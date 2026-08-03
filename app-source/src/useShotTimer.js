import { useCallback, useEffect, useRef, useState } from "react";

const SETTINGS_KEY = "shot-timer-settings";

const DEFAULT_SETTINGS = {
  sensitivity: 60, // 0-100, higher = more sensitive (detects quieter clicks)
  delayMin: 1.0, // seconds
  delayMax: 4.0, // seconds
  parEnabled: false,
  parTime: 3.0, // seconds after beep
  drawDetection: true, // auto-tag the first detected sound in a run as the holster draw, not a shot
};

const REFRACTORY_MS = 180; // baseline min gap between two detected events
const SCRIPT_BUFFER_SIZE = 1024; // ~23ms resolution @44.1kHz - runs on the audio thread

// A real trigger/dry-fire click is dramatically louder than whatever else is
// happening around it (movement, fabric, ambient room noise). Rather than
// relying only on a single fixed threshold, we also track a rolling ambient
// noise floor and require a peak to clearly stand out above it before it
// counts as an event - this is what filters out incidental noise that still
// happens to clear the fixed threshold. NOISE_FLOOR_ALPHA controls how fast
// the floor adapts (small = slow/stable), PROMINENCE_MULTIPLIER is how many
// times louder than ambient a peak must be.
const NOISE_FLOOR_ALPHA = 0.05;
const PROMINENCE_MULTIPLIER = 2.2;

// First analysis pass (single reference recordings of each sound in
// isolation) suggested the draw/holster sound is duller/lower-frequency
// (zero-crossing rate ~0.11-0.20) than an actual trigger click (~0.20-0.40).
// A second pass on real draw-click-rack-holster sequences (same gear, live
// timing) showed this doesn't hold in general - that draw's own brightness
// varied 0.31-0.36, overlapping the click's 0.33-0.34 almost completely (a
// snappier holster/retention makes for a brighter draw sound). So this gate
// alone is not reliable and is kept only as a cheap extra layer, not the
// main filter - see SHOT_VS_DRAW_MULTIPLIER below for what actually
// separated draw from click consistently across those takes.
// Note: this can NOT tell an actual click apart from racking/chambering the
// gun, since both are similarly bright metallic snaps acoustically.
const ZCR_MIN_FOR_SHOT = 0.19;
const ZCR_WINDOW_HALF = 150; // samples each side of the buffer's peak (~3.4ms @44.1kHz)

// What DID separate draw from click consistently across 3 live draw-click-
// rack-holster takes: loudness. The draw peaked around 0.27-0.35, the click
// 0.85-1.0+ - roughly 3x louder every time, regardless of exact timing. So a
// "shot" candidate additionally has to be clearly louder than the draw that
// started this run, not just brighter/prominent. Set well below the
// observed ~3x ratio to leave margin for a real click that's just quieter
// than usual (further away, muffled) without risking being rejected.
// Unlike a settle window this doesn't care about timing at all, so a fast
// draw-to-shot is unaffected - it only rejects sounds that are about as
// quiet as the draw itself, which a genuine click essentially never is.
const SHOT_VS_DRAW_MULTIPLIER = 1.3;

// Earlier attempt: a fixed longer "settle window" after the draw (and after
// each shot) to swallow extra draw-stroke noises / an assumed double-click.
// Reverted - testing showed a real, fast trigger press produces exactly one
// click (no second sound), and a fast draw-to-shot time can land well inside
// any such fixed window, so it silently ate real shots. Back to a single
// flat REFRACTORY_MS for every event.

// The built-in phone mic (without autoGainControl, which we disable so the
// sensitivity slider stays meaningful) reads noticeably quieter than a
// Bluetooth headset mic, which usually applies its own hardware-level AGC we
// can't turn off. This boosts the signal before peak detection so draws/
// shots are recognized without headphones too. It's applied on a silent
// branch of the graph, so it never affects what's audible.
const MIC_BOOST = 6;

// How long after the beep starts to ignore mic input entirely. Without
// headphones, the beep plays from the same device's speaker the mic is
// listening on, and with MIC_BOOST applied that acoustic bleed can otherwise
// get misread as the draw/shot itself. Covers the ~0.35s beep sample plus a
// small safety margin.
const BEEP_GUARD_MS = 420;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function fmt(ms) {
  return (ms / 1000).toFixed(2);
}

// Older shot arrays stored events as plain numbers; normalize to objects.
function normalizeEvent(s) {
  return typeof s === "number" ? { t: s, kind: "shot" } : s;
}

export function useShotTimer() {
  const [settings, setSettingsState] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...loadJSON(SETTINGS_KEY, {}),
  }));
  const [phase, setPhase] = useState("idle"); // idle | arming | listening | done
  const [shots, setShots] = useState([]); // [{t: ms since beep, kind: "shot" | "draw"}]
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [armRemaining, setArmRemaining] = useState(null); // ms left until beep, or null
  const [micError, setMicError] = useState(null);
  const [micReady, setMicReady] = useState(false);

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const scriptNodeRef = useRef(null);
  const beepBufferRef = useRef(null);
  const beepArrayBufferRef = useRef(null); // raw bytes, fetched once and reused across mic on/off cycles
  const wakeLockRef = useRef(null);
  const beepAtRef = useRef(0);
  const beepGuardUntilRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const eventCountRef = useRef(0); // events detected since the last beep, used for draw tagging
  const noiseFloorRef = useRef(0); // rolling ambient peak level, used to filter out incidental noise
  const drawPeakRef = useRef(0); // peak amplitude of this run's draw event, 0 if none yet - see SHOT_VS_DRAW_MULTIPLIER
  const armTimeoutRef = useRef(null);
  const armIntervalRef = useRef(null);
  const parTimeoutRef = useRef(null);
  const liveIntervalRef = useRef(null);
  const phaseRef = useRef("idle");
  const settingsRef = useRef(settings);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const setSettings = useCallback((patch) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // not critical - some browsers/permission states may block this
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  // Re-acquire the wake lock if it was auto-released because the tab/screen
  // was hidden while a run was still armed or listening.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && (phaseRef.current === "arming" || phaseRef.current === "listening")) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestWakeLock]);

  // Runs on the Web Audio processing thread, not the render/paint loop - so
  // unlike requestAnimationFrame it keeps working even if the screen dims or
  // the tab loses focus while waiting out the random delay.
  const handleAudioProcess = useCallback((event) => {
    if (phaseRef.current !== "listening") return;

    const now = performance.now();
    // Ignore mic input entirely while the beep itself is still sounding, so
    // its acoustic bleed into the mic (no headphones = same device for both)
    // never gets misread as the draw/shot itself.
    if (now < beepGuardUntilRef.current) return;

    const input = event.inputBuffer.getChannelData(0);
    let peak = 0;
    let peakIdx = 0;
    for (let i = 0; i < input.length; i++) {
      const v = Math.abs(input[i]);
      if (v > peak) {
        peak = v;
        peakIdx = i;
      }
    }

    const threshold = (6 + (100 - settingsRef.current.sensitivity) * 0.7) / 127; // 0-1 scale
    const inRefractory = now - lastEventAtRef.current <= REFRACTORY_MS;
    // A real click must both clear the fixed floor AND stand out clearly
    // above whatever ambient/incidental noise level we've been seeing - this
    // is what rejects a quieter stray noise that still happens to clear the
    // fixed threshold.
    const isProminent = peak > noiseFloorRef.current * PROMINENCE_MULTIPLIER;

    // A would-be shot (not the first/draw event) additionally has to sound
    // sharp/metallic rather than dull/broadband - see ZCR_MIN_FOR_SHOT above.
    // Only computed when it might matter, to keep this cheap on quiet buffers.
    const isFirstEvent = eventCountRef.current === 0;
    const wouldBeDraw = isFirstEvent && settingsRef.current.drawDetection;
    let isBrightEnough = true;
    if (peak > threshold && !wouldBeDraw) {
      const lo = Math.max(0, peakIdx - ZCR_WINDOW_HALF);
      const hi = Math.min(input.length - 1, peakIdx + ZCR_WINDOW_HALF);
      let crossings = 0;
      let prevPositive = input[lo] >= 0;
      for (let i = lo + 1; i <= hi; i++) {
        const positive = input[i] >= 0;
        if (positive !== prevPositive) crossings++;
        prevPositive = positive;
      }
      const zcr = crossings / Math.max(1, hi - lo);
      isBrightEnough = zcr > ZCR_MIN_FOR_SHOT;
    }

    // A would-be shot also has to be clearly louder than this run's draw -
    // see SHOT_VS_DRAW_MULTIPLIER above. No-op if there was no draw event
    // (drawDetection off, or this candidate would be the draw itself).
    const isLoudEnoughVsDraw = drawPeakRef.current === 0 || peak > drawPeakRef.current * SHOT_VS_DRAW_MULTIPLIER;

    if (peak > threshold && isProminent && isBrightEnough && isLoudEnoughVsDraw && !inRefractory) {
      lastEventAtRef.current = now;
      const t = now - beepAtRef.current;
      eventCountRef.current += 1;
      const kind = wouldBeDraw ? "draw" : "shot";
      if (kind === "draw") drawPeakRef.current = peak;
      setShots((prev) => [...prev, { t, kind }]);
    } else if (!inRefractory) {
      // Not a registered event and not the decay tail of a recent one - safe
      // to fold into the rolling ambient noise floor.
      noiseFloorRef.current = noiseFloorRef.current * (1 - NOISE_FLOOR_ALPHA) + peak * NOISE_FLOOR_ALPHA;
    }
  }, []);

  const ensureMic = useCallback(async () => {
    if (streamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);

      // ScriptProcessorNode keeps firing on the audio thread regardless of
      // screen/tab visibility - unlike an AnalyserNode polled via rAF, which
      // pauses whenever the display isn't actively rendering.
      const scriptNode = ctx.createScriptProcessor(SCRIPT_BUFFER_SIZE, 1, 1);
      const inputBoost = ctx.createGain();
      inputBoost.gain.value = MIC_BOOST; // compensate quieter built-in mics vs. headset mics
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0; // keep it silent, we only need the processing callback
      source.connect(inputBoost);
      inputBoost.connect(scriptNode);
      scriptNode.connect(silentGain);
      silentGain.connect(ctx.destination);
      scriptNode.onaudioprocess = handleAudioProcess;

      audioCtxRef.current = ctx;
      streamRef.current = stream;
      scriptNodeRef.current = scriptNode;

      // Load the real, recorded PACT beep sample. Falls back to a synthesized
      // tone (below) if the fetch/decode fails for any reason. The raw bytes
      // are cached so re-opening the mic on the next GO doesn't re-fetch over
      // the network - only re-decode (fast, local) against the new context.
      try {
        if (!beepArrayBufferRef.current) {
          const res = await fetch(new URL("audio/beep.mp3", document.baseURI));
          beepArrayBufferRef.current = await res.arrayBuffer();
        }
        // decodeAudioData can detach/consume the buffer it's given, so decode
        // a copy and keep the cached master intact for next time.
        beepBufferRef.current = await ctx.decodeAudioData(beepArrayBufferRef.current.slice(0));
      } catch {
        beepBufferRef.current = null;
      }

      setMicReady(true);
      setMicError(null);
      return true;
    } catch (err) {
      setMicError(
        err && err.name === "NotAllowedError"
          ? "Mikrofonzugriff verweigert. Bitte in den Browser-Einstellungen erlauben."
          : "Mikrofon nicht verfügbar: " + (err?.message || err)
      );
      return false;
    }
  }, [handleAudioProcess]);

  // Stops the mic track (turns off the browser's mic indicator/hardware
  // access) and closes the audio graph between runs, instead of leaving the
  // mic hot for the whole time the app is open. ensureMic() re-acquires it
  // fresh on the next GO - since permission was already granted once, the
  // browser doesn't show the "allow microphone?" prompt again.
  const releaseMic = useCallback(() => {
    if (scriptNodeRef.current) {
      scriptNodeRef.current.onaudioprocess = null;
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx.state !== "closed") ctx.close().catch(() => {});
    }
    setMicReady(false);
  }, []);

  // Plays the real, recorded PACT Club Timer beep (~2330Hz, ~0.3s - measured
  // from an actual recording, pre-normalized ~11dB louder for phone speaker
  // playback). rate < 1 pitches it down a bit for the par beep so the two
  // are distinguishable while keeping the authentic timbre. Falls back to a
  // synthesized tone if the sample couldn't be loaded.
  const playBeep = useCallback((rate = 1, gain = 1.7) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    beepGuardUntilRef.current = performance.now() + BEEP_GUARD_MS;

    // Brickwall-ish limiter so we can push gain > 1 for louder playback on
    // weak phone speakers without the output hard-clipping into distortion.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);

    if (beepBufferRef.current) {
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = beepBufferRef.current;
      src.playbackRate.value = rate;
      g.gain.value = gain;
      src.connect(g);
      g.connect(limiter);
      src.start();
      return;
    }

    // Fallback: synthesized approximation (~2330Hz sine, ~0.3s) in case the
    // recorded sample failed to load.
    const t0 = ctx.currentTime;
    const duration = 0.3;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 2330 * rate;

    gainNode.gain.setValueAtTime(0, t0);
    gainNode.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    gainNode.gain.setValueAtTime(gain, t0 + duration - 0.02);
    gainNode.gain.linearRampToValueAtTime(0, t0 + duration);

    osc.connect(gainNode);
    gainNode.connect(limiter);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }, []);

  const clearTimers = useCallback(() => {
    if (armTimeoutRef.current) clearTimeout(armTimeoutRef.current);
    if (armIntervalRef.current) clearInterval(armIntervalRef.current);
    if (parTimeoutRef.current) clearTimeout(parTimeoutRef.current);
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    armTimeoutRef.current = null;
    armIntervalRef.current = null;
    parTimeoutRef.current = null;
    liveIntervalRef.current = null;
  }, []);

  // Discards the current run entirely and goes back to idle.
  const reset = useCallback(() => {
    clearTimers();
    releaseWakeLock();
    releaseMic();
    setPhase("idle");
    setShots([]);
    setLiveElapsed(0);
    setArmRemaining(null);
  }, [clearTimers, releaseWakeLock, releaseMic]);

  // Manually ends the run so the result stays on screen for review. Pressing
  // GO afterwards starts a fresh one.
  const stop = useCallback(() => {
    clearTimers();
    releaseWakeLock();
    releaseMic();
    setPhase((p) => (p === "listening" || p === "arming" ? "done" : p));
  }, [clearTimers, releaseWakeLock, releaseMic]);

  // GO always works: if a run is still going (Stop wasn't pressed), it's
  // simply discarded and a fresh delay + beep starts immediately. The
  // listening phase itself never times out on its own.
  const start = useCallback(async () => {
    const ok = await ensureMic();
    if (!ok) return;
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    clearTimers();
    requestWakeLock();
    setShots([]);
    setLiveElapsed(0);
    setPhase("arming");

    const s = settingsRef.current;
    const delay = s.delayMin + Math.random() * Math.max(0, s.delayMax - s.delayMin);
    const targetAt = performance.now() + delay * 1000;
    setArmRemaining(delay * 1000);

    armIntervalRef.current = setInterval(() => {
      setArmRemaining(Math.max(0, targetAt - performance.now()));
    }, 80);

    armTimeoutRef.current = setTimeout(() => {
      if (armIntervalRef.current) clearInterval(armIntervalRef.current);
      armIntervalRef.current = null;
      setArmRemaining(null);

      playBeep();
      beepAtRef.current = performance.now();
      lastEventAtRef.current = 0;
      eventCountRef.current = 0;
      noiseFloorRef.current = 0;
      drawPeakRef.current = 0;
      setPhase("listening");

      liveIntervalRef.current = setInterval(() => {
        setLiveElapsed(performance.now() - beepAtRef.current);
      }, 30);

      if (s.parEnabled) {
        parTimeoutRef.current = setTimeout(() => {
          playBeep(0.75); // lower pitch so the par beep is distinguishable from the start beep
        }, s.parTime * 1000);
      }
    }, delay * 1000);
  }, [ensureMic, playBeep, clearTimers, requestWakeLock]);

  useEffect(() => () => {
    clearTimers();
    releaseWakeLock();
    releaseMic();
  }, [clearTimers, releaseWakeLock, releaseMic]);

  // Numbered split list - only counts events tagged as "shot". A tagged
  // "draw" is excluded from the count and from split timing, but the beep
  // stays t=0 either way, so shot #1's time still reflects draw + reaction.
  let shotN = 0;
  let prevShotT = 0;
  const splitsView = shots.map((s, idx) => {
    const ev = normalizeEvent(s);
    if (ev.kind === "draw") {
      return { idx, kind: "draw", abs: ev.t, label: "Zug", split: null };
    }
    shotN += 1;
    const split = ev.t - prevShotT;
    prevShotT = ev.t;
    return { idx, kind: "shot", abs: ev.t, label: `#${shotN}`, split };
  });
  const shotCount = splitsView.filter((r) => r.kind === "shot").length;

  return {
    settings,
    setSettings,
    phase,
    shots,
    splitsView,
    shotCount,
    liveElapsed,
    armRemaining,
    micError,
    micReady,
    start,
    stop,
    reset,
    fmt,
  };
}
