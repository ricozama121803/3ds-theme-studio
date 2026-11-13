// Size limits and estimates shared by the UI (must match the server).

export const SAMPLE_RATE = 32728;            // 3DS native audio rate
export const MAX_BGM_BYTES = 3371008;        // Home Menu BGM size limit
export const MAX_SFX_CHUNK = 0x2dc00;        // kame-tools' limit for all SFX together
export const MAX_SFX_SECONDS = 3;
const ADPCM_BYTES_PER_SAMPLE = 8 / 14;       // DSP-ADPCM: 8-byte frame per 14 samples
const BGM_OVERHEAD = 8 * 1024;               // headers + block padding, conservative
const SFX_OVERHEAD = 512;

export function bgmMaxSeconds(mono) {
  return (MAX_BGM_BYTES - BGM_OVERHEAD) / (SAMPLE_RATE * (mono ? 1 : 2) * ADPCM_BYTES_PER_SAMPLE);
}

export function clipRange(music) {
  const start = Math.max(0, Number(music.start) || 0);
  let end = Number(music.end) || music.duration;
  if (music.duration) end = Math.min(end, music.duration);
  return { start, end, length: Math.max(0, end - start) };
}

export function estimateBgmBytes(music) {
  return clipRange(music).length * SAMPLE_RATE * (music.mono ? 1 : 2) * ADPCM_BYTES_PER_SAMPLE + BGM_OVERHEAD;
}

export const musicOverLimit = (music) => !!music?.file && estimateBgmBytes(music) > MAX_BGM_BYTES;

/** sfx: { [slot]: { duration } } */
export function estimateSfxBytes(sfx, slots) {
  let total = 8 + 11 * 4;
  for (const slot of slots) {
    const s = sfx[slot];
    total += 8 + (s ? Math.min(s.duration, MAX_SFX_SECONDS) * SAMPLE_RATE * ADPCM_BYTES_PER_SAMPLE + SFX_OVERHEAD : 0);
  }
  return total;
}
