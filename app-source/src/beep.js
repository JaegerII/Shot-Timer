// Shared beep-playback helper, used by both the Dry Fire timer and the
// Targets (Range Officer simulation) timer. Playback-only AudioContext -
// never touches the microphone, so using this on its own never triggers a
// mic permission prompt.
export function createBeepPlayer() {
  let audioCtx = null;
  let beepBuffer = null;
  let beepArrayBuffer = null; // raw bytes, fetched once and reused across runs
  const calloutCache = new Map(); // key -> AudioBuffer | null (null = failed to load)
  const calloutLoading = new Map(); // key -> in-flight Promise<AudioBuffer|null>

  // Shared limiter setup for both the beep and the recorded callout clips -
  // keeps loud phone-speaker playback from clipping.
  function makeLimiter(ctx) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    return limiter;
  }

  // Loads and decodes one recorded callout clip
  // (public/audio/callouts-v2/<key>.mp3), caching the decoded buffer so
  // repeat plays (e.g. numbers/directions coming up again in the same
  // Transitions run) are instant. Dedupes concurrent requests for the same
  // key. ("-v2" because the first batch of clips had inconsistent trimming/
  // loudness - see loadCallout history - re-processed with per-file silence
  // detection + peak normalization instead of loudnorm, which behaves badly
  // on sub-1s clips.)
  async function loadCallout(key) {
    if (calloutCache.has(key)) return calloutCache.get(key);
    if (calloutLoading.has(key)) return calloutLoading.get(key);
    const ctx = audioCtx;
    if (!ctx) return null;

    const p = (async () => {
      try {
        const res = await fetch(new URL(`audio/callouts-v2/${key}.mp3`, document.baseURI));
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        calloutCache.set(key, buf);
        return buf;
      } catch {
        calloutCache.set(key, null);
        return null;
      } finally {
        calloutLoading.delete(key);
      }
    })();
    calloutLoading.set(key, p);
    return p;
  }

  // Warms the cache for a set of keys ahead of time (called at Start) so the
  // first callout of a run doesn't have to wait on a fetch.
  async function preloadCallouts(keys) {
    await Promise.all(keys.map(loadCallout));
  }

  // Plays a recorded callout clip and resolves once it finishes - mirrors the
  // old speechSynthesis-based speak() timing so calling code can keep the
  // same "wait for it to finish, then schedule the next one" pattern. Loads
  // on demand if it wasn't preloaded yet; resolves immediately (silently) if
  // the clip is missing or the context isn't ready, so a drill never stalls.
  async function playCallout(key, { gain = 1.6 } = {}) {
    const ctx = audioCtx;
    if (!ctx) return;
    const buffer = await loadCallout(key);
    if (!buffer) return;
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buffer;
      g.gain.value = gain;
      src.connect(g);
      g.connect(makeLimiter(ctx));
      src.onended = () => resolve();
      src.start();
    });
  }

  async function ensureAudioCtx() {
    let ctx = audioCtx;
    if (!ctx || ctx.state === "closed") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      audioCtx = ctx;
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Load the real, recorded PACT beep sample once and cache the raw bytes.
    // Falls back to a synthesized tone (in playBeep) if the fetch/decode
    // fails for any reason.
    if (!beepBuffer) {
      try {
        if (!beepArrayBuffer) {
          const res = await fetch(new URL("audio/beep.mp3", document.baseURI));
          beepArrayBuffer = await res.arrayBuffer();
        }
        // decodeAudioData can detach/consume the buffer it's given, so decode
        // a copy and keep the cached master intact for next time.
        beepBuffer = await ctx.decodeAudioData(beepArrayBuffer.slice(0));
      } catch {
        beepBuffer = null;
      }
    }
    return true;
  }

  // Plays the real, recorded PACT Club Timer beep (~2330Hz, ~0.3s - measured
  // from an actual recording, pre-normalized ~11dB louder for phone speaker
  // playback). rate < 1 pitches it down a bit (used for a lower secondary
  // beep) while keeping the authentic timbre. Falls back to a synthesized
  // tone if the sample couldn't be loaded.
  function playBeep(rate = 1, gain = 1.7) {
    const ctx = audioCtx;
    if (!ctx) return;

    // Brickwall-ish limiter so we can push gain > 1 for louder playback on
    // weak phone speakers without the output hard-clipping into distortion.
    const limiter = makeLimiter(ctx);

    if (beepBuffer) {
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = beepBuffer;
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
  }

  return { ensureAudioCtx, playBeep, preloadCallouts, playCallout };
}
