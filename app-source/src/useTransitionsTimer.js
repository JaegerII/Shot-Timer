import { useCallback, useEffect, useRef, useState } from "react";
import { createBeepPlayer } from "./beep";

const SETTINGS_KEY = "transitions-settings";

const DEFAULT_SETTINGS = {
  categories: { lr: true, abcd: true, numbers: true, colors: true, distance: false },
  interval: "1", // "0.5" | "1" | "2" | "random"
  count: "10", // "10" | "20" | "endless"
  voiceGender: "female", // "female" | "male" - best effort, browser/device dependent
  prepDelay: "3", // "2" | "3" | "4" seconds - time to get into position before "Standby"
};

// Spoken callout pools per category. German, since these are descriptive
// words (not fixed range-officer commands like "Standby"), matching the
// rest of the app's language.
const POOLS = {
  lr: ["Links", "Mitte", "Rechts"],
  abcd: ["A", "B", "C", "D"],
  numbers: ["1", "2", "3", "4", "5"],
  colors: ["Rot", "Grün", "Blau", "Gelb"],
  distance: ["Nah", "Fern"],
};

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

const speechSynthesisAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

// Best-effort voice pick - the Web Speech API doesn't expose a reliable
// gender field, so this falls back to matching common name hints, and
// otherwise prefers higher-quality voices (network/"enhanced"/"neural"
// ones sound far less robotic than the default local/compact voice most
// browsers pick automatically) before just using whatever's first.
function pickVoice(gender) {
  if (!speechSynthesisAvailable) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const german = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("de"));
  const pool = german.length ? german : voices;

  const genderHints =
    gender === "male"
      ? ["male", "markus", "yannick", "hans", "stefan"]
      : ["female", "anna", "petra", "helena", "katja", "marlene"];
  const qualityHints = ["enhanced", "premium", "neural", "natural", "siri"];

  const genderMatches = pool.filter((v) => genderHints.some((h) => v.name.toLowerCase().includes(h)));
  const best =
    genderMatches.find((v) => qualityHints.some((h) => v.name.toLowerCase().includes(h))) ||
    genderMatches[0] ||
    pool.find((v) => qualityHints.some((h) => v.name.toLowerCase().includes(h))) ||
    (pool.find((v) => !v.localService) ?? pool[0]);

  return best;
}

function speak(text, gender) {
  return new Promise((resolve) => {
    if (!speechSynthesisAvailable) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "de-DE";
      utter.rate = 1.15;
      const voice = pickVoice(gender);
      if (voice) utter.voice = voice;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    } catch {
      resolve();
    }
  });
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
        await speak(pick, s.voiceGender);
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
    speak("Standby", settingsRef.current.voiceGender).then(() => {
      if (phaseRef.current === "standby") beginArm();
    });
  }, [beginArm]);

  const start = useCallback(() => {
    clearTimer();
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();

    // Unlock audio playback and speech synthesis synchronously within this
    // click's user-activation window - the actual beep/"Standby" calls
    // fire later, from inside timeout/promise chains well outside the tap,
    // and mobile browsers (iOS Safari especially) silently block audio
    // APIs invoked that far removed from a gesture.
    beepPlayerRef.current.ensureAudioCtx();
    if (speechSynthesisAvailable) {
      try {
        const unlock = new SpeechSynthesisUtterance(" ");
        unlock.volume = 0;
        window.speechSynthesis.speak(unlock);
      } catch {
        // ignore - priming is best-effort
      }
    }

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
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    setCountdown(null);
    setArmRemaining(null);
    setPhase((p) => (p === "idle" ? p : "done"));
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    setPhase("idle");
    setCurrent(null);
    setCalledCount(0);
    setCountdown(null);
    setArmRemaining(null);
  }, [clearTimer]);

  useEffect(
    () => () => {
      clearTimer();
      if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    },
    [clearTimer]
  );

  return {
    settings,
    setSettings,
    phase,
    current,
    calledCount,
    countdown,
    armRemaining,
    speechSupported: speechSynthesisAvailable,
    start,
    stop,
    reset,
  };
}
