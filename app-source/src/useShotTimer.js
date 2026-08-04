import { useCallback, useEffect, useRef, useState } from "react";

const SETTINGS_KEY = "shot-timer-settings";

const DEFAULT_SETTINGS = {
  delayMin: 1.0, // seconds
  delayMax: 4.0, // seconds
  parEnabled: false,
  parTime: 3.0, // seconds after beep
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// The Dry Fire timer intentionally never touches the microphone - no shot
// detection, no mic permission prompt. It's just a beep + stopwatch + par
// time, started/stopped by hand. (Mic access is reserved for the separate
// Voice Start / Live Fire flows, which request it only when the user turns
// those on.)
export function useShotTimer() {
  const [settings, setSettingsState] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...loadJSON(SETTINGS_KEY, {}),
  }));
  const [phase, setPhase] = useState("idle"); // idle | arming | listening | done
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [armRemaining, setArmRemaining] = useState(null); // ms left until beep, or null

  const audioCtxRef = useRef(null);
  const beepBufferRef = useRef(null);
  const beepArrayBufferRef = useRef(null); // raw bytes, fetched once and reused across runs
  const wakeLockRef = useRef(null);
  const beepAtRef = useRef(0);
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

  // Sets up (or resumes) a plain playback-only AudioContext for the beep -
  // no getUserMedia, so this never triggers a microphone permission prompt.
  const ensureAudioCtx = useCallback(async () => {
    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Load the real, recorded PACT beep sample once and cache the raw bytes
    // across runs. Falls back to a synthesized tone (in playBeep) if the
    // fetch/decode fails for any reason.
    if (!beepBufferRef.current) {
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
    }
    return true;
  }, []);

  // Plays the real, recorded PACT Club Timer beep (~2330Hz, ~0.3s - measured
  // from an actual recording, pre-normalized ~11dB louder for phone speaker
  // playback). rate < 1 pitches it down a bit for the par beep so the two
  // are distinguishable while keeping the authentic timbre. Falls back to a
  // synthesized tone if the sample couldn't be loaded.
  const playBeep = useCallback((rate = 1, gain = 1.7) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

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
    setPhase("idle");
    setLiveElapsed(0);
    setArmRemaining(null);
  }, [clearTimers, releaseWakeLock]);

  // Manually ends the run so the result stays on screen for review. Pressing
  // GO afterwards starts a fresh one.
  const stop = useCallback(() => {
    clearTimers();
    releaseWakeLock();
    setPhase((p) => (p === "listening" || p === "arming" ? "done" : p));
  }, [clearTimers, releaseWakeLock]);

  // GO always works: if a run is still going (Stop wasn't pressed), it's
  // simply discarded and a fresh delay + beep starts immediately.
  const start = useCallback(async () => {
    await ensureAudioCtx();

    clearTimers();
    requestWakeLock();
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
  }, [ensureAudioCtx, playBeep, clearTimers, requestWakeLock]);

  useEffect(() => () => {
    clearTimers();
    releaseWakeLock();
  }, [clearTimers, releaseWakeLock]);

  return {
    settings,
    setSettings,
    phase,
    liveElapsed,
    armRemaining,
    start,
    stop,
    reset,
  };
}
