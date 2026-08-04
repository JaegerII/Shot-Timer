import { useCallback, useEffect, useRef, useState } from "react";
import { createBeepPlayer } from "./beep";

const SETTINGS_KEY = "transitions-settings";

const DEFAULT_SETTINGS = {
  categories: { lr: true, abcd: false, numbers: false, colors: false, distance: false },
  interval: "1", // "0.5" | "1" | "2" | "random"
  count: "10", // "10" | "20" | "endless"
  prepDelay: "3", // "2" | "3" | "4" seconds - time to get into position before "Standby"
};

// Spoken callout pools per category, using the user's own recorded audio
// clips (public/audio/callouts/) instead of browser text-to-speech - much
// better and more consistent voice quality than any Web Speech API voice.
// ABCD uses the NATO-style words actually recorded (Alpha/Beta/Charlie/
// Delta), not bare letters.
const POOLS = {
  lr: ["Links", "Mitte", "Rechts"],
  abcd: ["Alpha", "Beta", "Charlie", "Delta"],
  numbers: ["1", "2", "3", "4", "5"],
  colors: ["Rot", "Grün", "Blau", "Gelb"],
  distance: ["Nah", "Fern"],
};

// Maps each displayed callout word to its recorded clip's filename (without
// extension) under public/audio/callouts/.
const CALLOUT_KEYS = {
  Links: "links",
  Mitte: "mitte",
  Rechts: "rechts",
  Alpha: "alpha",
  Beta: "beta",
  Charlie: "charlie",
  Delta: "delta",
  1: "1",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  Rot: "rot",
  Grün: "gruen",
  Blau: "blau",
  Gelb: "gelb",
  Nah: "nah",
  Fern: "fern",
};

const ALL_CALLOUT_KEYS = [...new Set(Object.values(CALLOUT_KEYS))].concat("standby");

// Random delay between "Standby" and the beep - same "don't let them
// anticipate the exact moment" idea as the Targets tab's arm delay, just a
// shorter window since the calling drill starts right after.
const ARM_DELAY_MIN_S = 1.0;
const ARM_DELAY_MAX_S = 2.5;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function intervalMs(interval) {
  if (interval === "0.5") return 500;
  if (interval === "2") return 2000;
  if (interval === "random") return 500 + Math.random() * 2000;
  return 1000;
}

// Transitions drill: Start -> short "get ready" countdown -> "Standby" ->
// random delay -> beep -> the app calls out a random direction/letter/
// number/color/distance at a set pace until the count is reached (or
// endlessly, until Stop). Pure audio output - no camera, no mic.
export function useTransitionsTimer() {
  const [settings, setSettingsState] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...loadJSON(SETTINGS_KEY, {}),
  }));
  const [phase, setPhase] = useState("idle"); // idle | prep | standby | arming | calling | done
  const [current, setCurrent] = useState(null);
  const [calledCount, setCalledCount] = useState(0);
  const [countdown, setCountdown] = useState(null); // whole seconds left, during "prep"
  const [armRemaining, setArmRemaining] = useState(null); // ms left, during "arming"

  const beepPlayerRef = useRef(null);
  if (!beepPlayerRef.current) beepPlayerRef.current = createBeepPlayer();

  const settingsRef = useRef(settings);
  const phaseRef = useRef("idle");
  const timeoutRef = useRef(null);
  const tickRef = useRef(null);
  const lastValueRef = useRef(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const setSettings = useCallback((patch) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timeoutRef.current = null;
    tickRef.current = null;
  }, []);

  const buildPool = useCallback(() => {
    const cats = settingsRef.current.categories;
    let pool = [];
    for (const key of Object.keys(POOLS)) {
      if (cats[key]) pool = pool.concat(POOLS[key]);
    }
    return pool;
  }, []);

  const scheduleNext = useCallback(
    (calledSoFar) => {
      const s = settingsRef.current;
      const max = s.count === "endless" ? Infinity : parseInt(s.count, 10);
      if (calledSoFar >= max) {
        setPhase("done");
        return;
      }
      timeoutRef.current = setTimeout(async () => {
        if (phaseRef.current !== "calling") return;
        const pool = buildPool();
        if (!pool.length) {
          setPhase("done");
          return;
        }
        let pick = pool[Math.floor(Math.random() * pool.length)];
        if (pool.length > 1) {
          while (pick === lastValueRef.current) {
            pick = pool[Math.floor(Math.random() * pool.length)];
          }
        }
        lastValueRef.current = pick;
        setCurrent(pick);
        const nextCount = calledSoFar + 1;
        setCalledCount(nextCount);
        await beepPlayerRef.current.playCallout(CALLOUT_KEYS[pick] || String(pick).toLowerCase());
        if (phaseRef.current === "calling") scheduleNext(nextCount);
      }, intervalMs(s.interval));
    },
    [buildPool]
  );

  const beginArm = useCallback(() => {
    setPhase("arming");
    const delay = ARM_DELAY_MIN_S + Math.random() * (ARM_DELAY_MAX_S - ARM_DELAY_MIN_S);
    const targetAt = performance.now() + delay * 1000;
    setArmRemaining(delay * 1000);

    tickRef.current = setInterval(() => {
      setArmRemaining(Math.max(0, targetAt - performance.now()));
    }, 80);

    timeoutRef.current = setTimeout(() => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      setArmRemaining(null);
      if (phaseRef.current !== "arming") return;

      beepPlayerRef.current.playBeep();
      setPhase("calling");
      scheduleNext(0);
    }, delay * 1000);
  }, [scheduleNext]);

  const beginStandby = useCallback(() => {
    setPhase("standby");
    beepPlayerRef.current.playCallout("standby").then(() => {
      if (phaseRef.current === "standby") beginArm();
    });
  }, [beginArm]);

  const start = useCallback(async () => {
    clearTimer();

    // Unlock audio playback synchronously within this click's user-
    // activation window - the actual beep/callout clips fire later, from
    // inside timeout/promise chains well outside the tap, and mobile
    // browsers (iOS Safari especially) silently block audio APIs invoked
    // that far removed from a gesture.
    await beepPlayerRef.current.ensureAudioCtx();
    // Warm the cache for every recorded clip so the first callout of the
    // run doesn't wait on a fetch - not awaited, playCallout() will load
    // on demand anyway if this hasn't finished by the time it's needed.
    beepPlayerRef.current.preloadCallouts(ALL_CALLOUT_KEYS);

    lastValueRef.current = null;
    setCurrent(null);
    setCalledCount(0);

    const prep = parseInt(settingsRef.current.prepDelay, 10) || 3;
    let remaining = prep;
    setPhase("prep");
    setCountdown(remaining);
    tickRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(tickRef.current);
        tickRef.current = null;
        setCountdown(null);
        if (phaseRef.current === "prep") beginStandby();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, [clearTimer, beginStandby]);

  const stop = useCallback(() => {
    clearTimer();
    setCountdown(null);
    setArmRemaining(null);
    setPhase((p) => (p === "idle" ? p : "done"));
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setPhase("idle");
    setCurrent(null);
    setCalledCount(0);
    setCountdown(null);
    setArmRemaining(null);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    settings,
    setSettings,
    phase,
    current,
    calledCount,
    countdown,
    armRemaining,
    start,
    stop,
    reset,
  };
}
