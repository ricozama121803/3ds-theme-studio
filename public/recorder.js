// Record audio playing in another browser tab (Chrome/Edge "Share tab audio"),
// then trim the silence and turn it into a WAV at the 3DS sample rate.

const TARGET_RATE = 32728;
const SILENCE = 0.003;          // ≈ -50 dBFS
const PAD_SECONDS = 0.05;
export const MAX_RECORD_SECONDS = 600;

export const canRecordTabs = !!navigator.mediaDevices?.getDisplayMedia && "MediaRecorder" in window;

function pickMime() {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/**
 * Start a capture. The browser shows its tab picker; the user must tick
 * "Also share tab audio". Returns a controller, or throws with a friendly message.
 *
 * callbacks: onLevel(0..1), onTick(seconds), onStop(Promise<File>)
 */
export async function startTabRecording({ onLevel, onTick, onStop }) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // required by Chrome to show the tab picker
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      selfBrowserSurface: "exclude",
      preferCurrentTab: false,
      systemAudio: "include",
    });
  } catch (err) {
    if (err?.name === "NotAllowedError") throw new Error("Recording was cancelled.");
    throw new Error(`Couldn't start recording: ${err?.message || err}`);
  }

  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("No audio was shared. Pick a Chrome tab and make sure “Also share tab audio” is switched on.");
  }
  // Only the sound is recorded; the video track stays alive until we stop so
  // the browser doesn't end the capture early.
  const audioStream = new MediaStream(audioTracks);

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(audioStream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const mimeType = pickMime();
  const recorder = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: 256000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const startedAt = performance.now();
  let raf = 0;
  let stopped = false;

  const loop = () => {
    analyser.getFloatTimeDomainData(samples);
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    onLevel?.(Math.min(1, peak));
    const secs = (performance.now() - startedAt) / 1000;
    onTick?.(secs);
    if (secs >= MAX_RECORD_SECONDS) stop();
    else raf = requestAnimationFrame(loop);
  };

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    const done = new Promise((resolve, reject) => {
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          resolve(await recordingToWav(blob));
        } catch (err) {
          reject(err);
        }
      };
    });
    if (recorder.state !== "inactive") recorder.stop();
    else recorder.onstop();
    onStop?.(done);
  }

  // Stops automatically if the user clicks Chrome's "Stop sharing".
  audioTracks[0].addEventListener("ended", stop);
  recorder.start(1000);
  loop();
  return { stop };
}

/** Decode a recording, trim leading/trailing silence, resample, encode WAV. */
export async function recordingToWav(blob) {
  const decodeCtx = new AudioContext();
  let decoded;
  try {
    decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    decodeCtx.close();
  }

  const { start, end } = findSound(decoded);
  if (end <= start) throw new Error("The recording was silent. Was the other tab playing, with tab audio shared?");

  const length = end - start;
  const channels = Math.min(2, decoded.numberOfChannels);
  const outLength = Math.ceil((length * TARGET_RATE) / decoded.sampleRate);
  const offline = new OfflineAudioContext(channels, outLength, TARGET_RATE);
  const trimmed = offline.createBuffer(channels, length, decoded.sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    trimmed.copyToChannel(decoded.getChannelData(ch).subarray(start, end), ch);
  }
  const src = offline.createBufferSource();
  src.buffer = trimmed;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  const wav = encodeWav(rendered);
  const stamp = new Date().toTimeString().slice(0, 5).replace(":", "");
  const file = new File([wav], `Tab recording ${stamp}.wav`, { type: "audio/wav" });
  file.knownDuration = rendered.duration;
  return file;
}

function findSound(buf) {
  const chans = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  const loud = (i) => chans.some((c) => Math.abs(c[i]) > SILENCE);
  let start = 0;
  while (start < buf.length && !loud(start)) start++;
  let end = buf.length - 1;
  while (end > start && !loud(end)) end--;
  const pad = Math.round(PAD_SECONDS * buf.sampleRate);
  return { start: Math.max(0, start - pad), end: Math.min(buf.length, end + pad) };
}

function encodeWav(buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + n * ch * 2, true); str(8, "WAVE");
  str(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, ch, true); out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out.buffer;
}
