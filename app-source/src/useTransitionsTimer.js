import { useCallback, useEffect, useRef, useState } from "react";

const SETTINGS_KEY = "transitions-settings";

const DEFAULT_SETTINGS = {
  categories: { lr: true, abcd: true, numbers: true, colors: true, distance: false },
  interval: "1", // "0.5" | "1" | "2" | "random"
  count: "10", // "10" | "20" | "endless"
  voiceGender: "female", // "female" | "male" - best effort, browser/device dependent
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
// gender field, so this falls back to matching common name hints and
// otherwise just uses whatever German voice is available first.
function pickVoice(gender) {
  if (!speechSynthesisAvailable) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const german = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("de"));
  const pool = german.length ? german : voices;
  const hints =
    gender === "male"
      ? ["male", "markus", "yannick", "hans", "stefan"]
      : ["female", "anna", "petra", "helena", "katja", "marlene"];
  const match = pool.find((v) => hints.some((h) => v.name.toLowerCase().includes(h)));
  return match || pool[0];
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

// Transitions drill: random spoken callouts (direction/letter/number/
// color/distance) at a set interval, for a set count or endlessly, until
// Stop is pressed. Pure speech-synthesis output - no microphone use.
export function useTransitionsTimer() {
  const [settings, setSettingsState] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...loadJSON(SETTINGS_KEY, {}),
  }));
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [current, setCurrent] = useState(null);
  const [calledCount, setCalledCount] = useState(0);

  const settingsRef = useRef(settings);
  const phaseRef = useRef("idle");
  const timeoutRef = useRef(null);
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
    timeoutRef.current = null;
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
        if (phaseRef.current !== "running") return;
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
        if (phaseRef.current === "running") scheduleNext(nextCount);
      }, intervalMs(s.interval));
    },
    [buildPool]
  );

  const start = useCallback(() => {
    clearTimer();
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    lastValueRef.current = null;
    setCurrent(null);
    setCalledCount(0);
    setPhase("running");
    scheduleNext(0);
  }, [clearTimer, scheduleNext]);

  const stop = useCallback(() => {
    clearTimer();
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    setPhase((p) => (p === "idle" ? p : "done"));
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    setPhase("idle");
    setCurrent(null);
    setCalledCount(0);
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
    speechSupported: speechSynthesisAvailable,
    start,
    stop,
    reset,
  };
}
