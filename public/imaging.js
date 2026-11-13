// Image quality helpers: mipmapped downscaling and RGB565 quantization.

/** Canvas factory that works with or without OffscreenCanvas. */
export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const mipCache = new WeakMap();

/**
 * Successive 2x box-filtered reductions of an image. Drawing from the level
 * that is at most 2x larger than the target avoids the aliasing/shimmer you
 * get from a single large bilinear downscale.
 */
function mipChain(img) {
  let chain = mipCache.get(img);
  if (chain) return chain;
  chain = [img];
  let src = img;
  while (src.width > 2 && src.height > 2 && chain.length < 12) {
    const c = makeCanvas(src.width / 2, src.height / 2);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, c.width, c.height);
    chain.push(c);
    src = c;
  }
  mipCache.set(img, chain);
  return chain;
}

/** Draw `img` scaled by `scale` with its top-left at (x, y), high quality. */
export function drawScaled(ctx, img, x, y, scale) {
  const chain = mipChain(img);
  // Pick the smallest mip level that is still >= the target size.
  let level = 0;
  while (level + 1 < chain.length && scale * 2 ** (level + 1) <= 1) level++;
  const src = chain[level];
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, x, y, img.width * scale, img.height * scale);
}

const to5 = (v) => Math.min(31, Math.max(0, Math.round((v * 31) / 255)));
const to6 = (v) => Math.min(63, Math.max(0, Math.round((v * 63) / 255)));
const from5 = (q) => (q << 3) | (q >> 2);
const from6 = (q) => (q << 2) | (q >> 4);

/**
 * Quantize an ImageData to the 3DS screen format (RGB565) in place, so the
 * pixels are exactly what the console will show. With `dither`, uses
 * serpentine Floyd–Steinberg error diffusion (smooth gradients, no banding);
 * without, rounds to the nearest representable colour.
 */
export function quantize565(imageData, dither) {
  const { width: w, height: h, data } = imageData;
  if (!dither) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = from5(to5(data[i]));
      data[i + 1] = from6(to6(data[i + 1]));
      data[i + 2] = from5(to5(data[i + 2]));
      data[i + 3] = 255;
    }
    return imageData;
  }

  const buf = new Float32Array(w * h * 3);
  for (let p = 0, i = 0; p < buf.length; p += 3, i += 4) {
    buf[p] = data[i];
    buf[p + 1] = data[i + 1];
    buf[p + 2] = data[i + 2];
  }

  const spread = (x, y, er, eg, eb, f) => {
    if (x < 0 || x >= w || y >= h) return;
    const p = (y * w + x) * 3;
    buf[p] += er * f;
    buf[p + 1] += eg * f;
    buf[p + 2] += eb * f;
  };

  for (let y = 0; y < h; y++) {
    const ltr = y % 2 === 0;
    const dir = ltr ? 1 : -1;
    for (let n = 0; n < w; n++) {
      const x = ltr ? n : w - 1 - n;
      const p = (y * w + x) * 3;
      const r = from5(to5(buf[p]));
      const g = from6(to6(buf[p + 1]));
      const b = from5(to5(buf[p + 2]));
      const er = buf[p] - r, eg = buf[p + 1] - g, eb = buf[p + 2] - b;
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
      spread(x + dir, y, er, eg, eb, 7 / 16);
      spread(x - dir, y + 1, er, eg, eb, 3 / 16);
      spread(x, y + 1, er, eg, eb, 5 / 16);
      spread(x + dir, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return imageData;
}

/** Return a new canvas holding `canvas` quantized to RGB565. */
export function to565Canvas(canvas, dither) {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  ctx.putImageData(quantize565(img, dither), 0, 0);
  return out;
}

/** Copy `canvas` onto a black canvas of size w x h at the top-left. */
export function padCanvas(canvas, w, h) {
  const out = makeCanvas(w, h);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/**
 * A small palette of an image's prominent colours, for auto-theming.
 * Returns [{r,g,b,count,sat,lum}] sorted by count.
 */
export function extractPalette(img, maxColors = 8) {
  const c = makeCanvas(64, 64 * (img.height / img.width));
  const ctx = c.getContext("2d");
  drawScaled(ctx, img, 0, 0, c.width / img.width);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]; b.count++;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .map((b) => {
      const r = b.r / b.count, g = b.g / b.count, bl = b.b / b.count;
      const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
      return {
        r: Math.round(r), g: Math.round(g), b: Math.round(bl), count: b.count,
        sat: max === 0 ? 0 : (max - min) / max,
        lum: (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors * 4);
}
