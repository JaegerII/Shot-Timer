// Shared beep-playback helper, used by both the Dry Fire timer and the
// Targets (Range Officer simulation) timer. Playback-only AudioContext -
// never touches the microphone, so using this on its own never triggers a
// mic permission prompt.
export function createBeepPlayer() {
  let audioCtx = null;
  let beepBuffer = null;
  let beepArrayBuffer = null; // raw bytes, fetched once and reused across runs

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
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);

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

  return { ensureAudioCtx, playBeep };
}
