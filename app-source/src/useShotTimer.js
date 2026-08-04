import { useCallback, useEffect, useRef, useState } from "react";
import { createBeepPlayer, primeMobileAudio } from "./beep";

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

  const beepPlayerRef = useRef(null);
  if (!beepPlayerRef.current) beepPlayerRef.current = createBeepPlayer();
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
    primeMobileAudio();
    await beepPlayerRef.current.ensureAudioCtx();

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

      beepPlayerRef.current.playBeep();
      beepAtRef.current = performance.now();
      setPhase("listening");

      liveIntervalRef.current = setInterval(() => {
        setLiveElapsed(performance.now() - beepAtRef.current);
      }, 30);

      if (s.parEnabled) {
        parTimeoutRef.current = setTimeout(() => {
          beepPlayerRef.current.playBeep(0.75); // lower pitch so the par beep is distinguishable from the start beep
        }, s.parTime * 1000);
      }
    }, delay * 1000);
  }, [clearTimers, requestWakeLock]);

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
