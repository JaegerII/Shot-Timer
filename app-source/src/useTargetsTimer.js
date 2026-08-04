import { useCallback, useEffect, useRef, useState } from "react";
import { createBeepPlayer } from "./beep";

const SETTINGS_KEY = "targets-settings";

const DEFAULT_SETTINGS = {
  targetType: "ipsc", // ipsc | uspsa | steel
  voiceEnabled: false,
};

// Random delay range for the "Standby" -> beep gap, same ballpark as a real
// range officer's pause. Not user-configurable (yet) - the roadmap only
// calls out target type as a setting here.
const DELAY_MIN_S = 1.5;
const DELAY_MAX_S = 4.0;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const SpeechRecognitionCtor =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const speechSynthesisAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

// Speaks "Standby" out loud (simulating the range officer) and resolves once
// the utterance finishes - or resolves immediately if speech synthesis
// isn't available, so the run still proceeds silently instead of stalling.
function announceStandby() {
  return new Promise((resolve) => {
    if (!speechSynthesisAvailable) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel(); // drop anything queued/stuck from before
      const utter = new SpeechSynthesisUtterance("Standby");
      utter.lang = "en-US"; // "Standby" is the RO command - keep it in English regardless of UI language
      utter.rate = 0.95;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    } catch {
      resolve();
    }
  });
}

// Range Officer simulation: Start -> (optional) Voice Start, where you say
// "Shooter Ready", the app answers "Standby" out loud -> random delay ->
// beep -> dry fire. Unlike the plain Dry Fire timer, this one *does* use the
// microphone, but only for the "Shooter Ready" cue, and only while Voice
// Start is switched on - the permission prompt only ever appears when you
// actually press Start with Voice Start enabled, never on app load or with
// it off.
export function useTargetsTimer() {
  const [settings, setSettingsState] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...loadJSON(SETTINGS_KEY, {}),
  }));
  const [phase, setPhase] = useState("idle"); // idle | ready | standby | arming | listening | done
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [armRemaining, setArmRemaining] = useState(null);
  const [micError, setMicError] = useState(null);

  const beepPlayerRef = useRef(null);
  if (!beepPlayerRef.current) beepPlayerRef.current = createBeepPlayer();

  const wakeLockRef = useRef(null);
  const beepAtRef = useRef(0);
  const armTimeoutRef = useRef(null);
  const armIntervalRef = useRef(null);
  const liveIntervalRef = useRef(null);
  const recognitionRef = useRef(null);
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

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        (phaseRef.current === "arming" || phaseRef.current === "listening")
      ) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestWakeLock]);

  const clearTimers = useCallback(() => {
    if (armTimeoutRef.current) clearTimeout(armTimeoutRef.current);
    if (armIntervalRef.current) clearInterval(armIntervalRef.current);
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    armTimeoutRef.current = null;
    armIntervalRef.current = null;
    liveIntervalRef.current = null;
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // already stopped - ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  // Fires the beep and starts the run - shared by the immediate-start path
  // (Voice Start off) and by the "Shooter Ready" -> "Standby" voice flow.
  const beginRun = useCallback(async () => {
    await beepPlayerRef.current.ensureAudioCtx();
    setPhase("arming");

    const delay = DELAY_MIN_S + Math.random() * (DELAY_MAX_S - DELAY_MIN_S);
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
    }, delay * 1000);
  }, []);

  // Called as soon as "ready" (from "shooter ready") shows up in what the
  // mic heard, while we're still in the "ready" (waiting) phase. The app
  // then answers "Standby" out loud before the random delay starts.
  const handleShooterReadyHeard = useCallback(() => {
    if (phaseRef.current !== "ready") return;
    stopRecognition();
    setPhase("standby");
    announceStandby().then(() => {
      // Only proceed if Stop/Reset didn't cancel the run while "Standby"
      // was being spoken.
      if (phaseRef.current === "standby") beginRun();
    });
  }, [stopRecognition, beginRun]);

  const startListeningForReady = useCallback(() => {
    if (!SpeechRecognitionCtor) {
      setMicError("Dein Browser unterstützt keine Spracherkennung - Voice Start funktioniert hier nicht.");
      setPhase("idle");
      return;
    }
    setMicError(null);
    const rec = new SpeechRecognitionCtor();
    rec.lang = "de-DE";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase();
        if (transcript.includes("ready")) {
          handleShooterReadyHeard();
          break;
        }
      }
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicError("Mikrofonzugriff verweigert. Bitte in den Browser-Einstellungen erlauben.");
        recognitionRef.current = null;
        setPhase("idle");
      }
      // Other errors (e.g. transient "no-speech") aren't fatal - onend below
      // restarts listening as long as we're still waiting.
    };
    rec.onend = () => {
      if (phaseRef.current === "ready" && recognitionRef.current === rec) {
        try {
          rec.start();
        } catch {
          // ignore - e.g. already starting
        }
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      // already started - ignore
    }
  }, [handleShooterReadyHeard]);

  const reset = useCallback(() => {
    clearTimers();
    stopRecognition();
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    releaseWakeLock();
    setPhase("idle");
    setLiveElapsed(0);
    setArmRemaining(null);
    setMicError(null);
  }, [clearTimers, stopRecognition, releaseWakeLock]);

  const stop = useCallback(() => {
    clearTimers();
    stopRecognition();
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    releaseWakeLock();
    setPhase((p) => (p === "idle" || p === "done" ? p : "done"));
  }, [clearTimers, stopRecognition, releaseWakeLock]);

  const start = useCallback(async () => {
    clearTimers();
    stopRecognition();
    setMicError(null);
    requestWakeLock();
    setLiveElapsed(0);

    if (settingsRef.current.voiceEnabled) {
      setPhase("ready");
      startListeningForReady();
    } else {
      await beginRun();
    }
  }, [clearTimers, stopRecognition, requestWakeLock, beginRun, startListeningForReady]);

  useEffect(
    () => () => {
      clearTimers();
      stopRecognition();
      if (speechSynthesisAvailable) window.speechSynthesis.cancel();
      releaseWakeLock();
    },
    [clearTimers, stopRecognition, releaseWakeLock]
  );

  return {
    settings,
    setSettings,
    phase,
    liveElapsed,
    armRemaining,
    micError,
    speechSupported: !!SpeechRecognitionCtor,
    start,
    stop,
    reset,
  };
}
