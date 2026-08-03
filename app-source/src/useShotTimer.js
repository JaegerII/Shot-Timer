import { useCallback, useEffect, useRef, useState } from "react";

const HISTORY_KEY = "shot-timer-history";
const SETTINGS_KEY = "shot-timer-settings";

const DEFAULT_SETTINGS = {
  sensitivity: 60, // 0-100, higher = more sensitive (detects quieter clicks)
  delayMin: 1.0, // seconds
  delayMax: 4.0, // seconds
  parEnabled: false,
  parTime: 3.0, // seconds after beep
  drawDetection: true, // auto-tag the first detected sound in a run as the holster draw, not a shot
};

const MAX_BARS = 42;
const SAMPLE_INTERVAL_MS = 70;
const REFRACTORY_MS = 180; // min gap between two detected events
const SCRIPT_BUFFER_SIZE = 1024; // ~23ms resolution @44.1kHz - runs on the audio thread

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

// Older history entries stored shots as plain numbers; normalize to objects.
function normalizeEvent(s) {
  return typeof s === "number" ? { t: s, kind: "shot" } : s;
}

// The time of the last real shot (ignoring a tagged draw), used for the
// history summary. Falls back to the last event if nothing is tagged.
function lastShotTime(shotsArr) {
  const normalized = (shotsArr || []).map(normalizeEvent);
  const shotsOnly = normalized.filter((s) => s.kind === "shot");
  const list = shotsOnly.length ? shotsOnly : normalized;
  return list.length ? list[list.length - 1].t : 0;
}

export function useShotTimer() {
  const [settings, setSettingsState] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...loadJSON(SETTINGS_KEY, {}),
  }));
  const [history, setHistory] = useState(() => loadJSON(HISTORY_KEY, []));
  const [phase, setPhase] = useState("idle"); // idle | arming | listening | done
  const [shots, setShots] = useState([]); // [{t: ms since beep, kind: "shot" | "draw"}]
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [armRemaining, setArmRemaining] = useState(null); // ms left until beep, or null
  const [waveform, setWaveform] = useState([]); // [{level: 0-100, kind: "shot"|"draw"|null}]
  const [micError, setMicError] = useState(null);
  const [micReady, setMicReady] = useState(false);

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const scriptNodeRef = useRef(null);
  const beepBufferRef = useRef(null);
  const wakeLockRef = useRef(null);
  const beepAtRef = useRef(0);
  const beepGuardUntilRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const eventCountRef = useRef(0); // events detected since the last beep, used for draw tagging
  const armTimeoutRef = useRef(null);
  const armIntervalRef = useRef(null);
  const parTimeoutRef = useRef(null);
  const liveIntervalRef = useRef(null);
  const waveformSampleAtRef = useRef(0);
  const maxPeakSinceSampleRef = useRef(0);
  const eventKindSinceSampleRef = useRef(null);
  const phaseRef = useRef("idle");
  const settingsRef = useRef(settings);
  const shotsRef = useRef([]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

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
    // never gets misread as the draw/shot.
    if (now < beepGuardUntilRef.current) return;

    const input = event.inputBuffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < input.length; i++) {
      const v = Math.abs(input[i]);
      if (v > peak) peak = v;
    }

    if (peak > maxPeakSinceSampleRef.current) maxPeakSinceSampleRef.current = peak;

    const threshold = (6 + (100 - settingsRef.current.sensitivity) * 0.7) / 127; // 0-1 scale

    if (peak > threshold && now - lastEventAtRef.current > REFRACTORY_MS) {
      lastEventAtRef.current = now;
      const t = now - beepAtRef.current;
      const isFirstEvent = eventCountRef.current === 0;
      eventCountRef.current += 1;
      const kind = isFirstEvent && settingsRef.current.drawDetection ? "draw" : "shot";
      setShots((prev) => [...prev, { t, kind }]);
      eventKindSinceSampleRef.current = kind;
    }

    if (now - waveformSampleAtRef.current >= SAMPLE_INTERVAL_MS) {
      const level = Math.min(100, Math.round(maxPeakSinceSampleRef.current * 100));
      const kind = eventKindSinceSampleRef.current;
      setWaveform((prev) => {
        const next = [...prev, { level, kind }];
        return next.length > MAX_BARS ? next.slice(next.length - MAX_BARS) : next;
      });
      maxPeakSinceSampleRef.current = 0;
      eventKindSinceSampleRef.current = null;
      waveformSampleAtRef.current = now;
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
      // tone (below) if the fetch/decode fails for any reason.
      try {
        const res = await fetch(new URL("audio/beep.mp3", document.baseURI));
        const arrBuf = await res.arrayBuffer();
        beepBufferRef.current = await ctx.decodeAudioData(arrBuf);
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

  const commitToHistory = useCallback((shotsArr) => {
    if (!shotsArr || shotsArr.length === 0) return;
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      total: lastShotTime(shotsArr),
      shots: shotsArr,
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 20);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Flip a detected event between "shot" and "draw" - for when the
  // auto-tagging (first sound = draw) guessed wrong.
  const toggleEventKind = useCallback((index) => {
    setShots((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const ev = normalizeEvent(s);
        return { t: ev.t, kind: ev.kind === "draw" ? "shot" : "draw" };
      })
    );
  }, []);

  // Discards the current run entirely (no history entry) and goes back to idle.
  const reset = useCallback(() => {
    clearTimers();
    releaseWakeLock();
    setPhase("idle");
    setShots([]);
    setLiveElapsed(0);
    setArmRemaining(null);
    setWaveform([]);
  }, [clearTimers, releaseWakeLock]);

  // Manually ends the run so the splits stay on screen for review. Saves the
  // string to history right away; pressing GO afterwards starts a fresh one.
  const stop = useCallback(() => {
    clearTimers();
    releaseWakeLock();
    commitToHistory(shotsRef.current);
    setPhase((p) => (p === "listening" || p === "arming" ? "done" : p));
  }, [clearTimers, releaseWakeLock, commitToHistory]);

  // GO always works: if a run is still going (Stop wasn't pressed), its shots
  // are saved to history first, then a fresh delay + beep starts immediately.
  // The listening phase itself never times out on its own.
  const start = useCallback(async () => {
    const ok = await ensureMic();
    if (!ok) return;
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    if (phaseRef.current === "listening" || phaseRef.current === "arming") {
      commitToHistory(shotsRef.current);
    }

    clearTimers();
    requestWakeLock();
    setShots([]);
    setLiveElapsed(0);
    setWaveform([]);
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
      waveformSampleAtRef.current = performance.now();
      maxPeakSinceSampleRef.current = 0;
      eventKindSinceSampleRef.current = null;
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
  }, [ensureMic, playBeep, clearTimers, commitToHistory, requestWakeLock]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  useEffect(() => () => {
    clearTimers();
    releaseWakeLock();
  }, [clearTimers, releaseWakeLock]);

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
    waveform,
    micError,
    micReady,
    history,
    clearHistory,
    start,
    stop,
    reset,
    toggleEventKind,
    fmt,
    normalizeEvent,
  };
}
