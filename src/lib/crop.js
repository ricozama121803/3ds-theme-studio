// Crop state: { img, scale, cx, cy, bg, userImage }
//   scale  output px per image px
//   cx, cy image-space point at the centre of the frame
import { drawScaled, makeCanvas } from "./imaging";

export function scaleBounds(img, w, h) {
  const contain = Math.min(w / img.width, h / img.height);
  const cover = Math.max(w / img.width, h / img.height);
  return { contain, cover, max: cover * 4 };
}

/** A crop that fills the frame, centred. */
export function coverCrop(img, w, h, prev = {}) {
  return {
    img,
    scale: scaleBounds(img, w, h).cover,
    cx: img.width / 2,
    cy: img.height / 2,
    bg: prev.bg ?? "#000000",
    userImage: prev.userImage ?? false,
  };
}

/** Keep the image covering the frame where it's big enough; centre it where it isn't. */
export function clampCrop(crop, w, h) {
  const { img, scale } = crop;
  const halfW = w / (2 * scale);
  const halfH = h / (2 * scale);
  return {
    ...crop,
    cx: img.width >= 2 * halfW ? Math.min(Math.max(crop.cx, halfW), img.width - halfW) : img.width / 2,
    cy: img.height >= 2 * halfH ? Math.min(Math.max(crop.cy, halfH), img.height - halfH) : img.height / 2,
  };
}

/** Slider position (0..1000, log scale from contain to 4× cover) <-> scale. */
export function sliderFor(crop, w, h) {
  const { contain, max } = scaleBounds(crop.img, w, h);
  if (max <= contain) return 0;
  return Math.round((1000 * Math.log(crop.scale / contain)) / Math.log(max / contain));
}

export function scaleFor(v, img, w, h) {
  const { contain, max } = scaleBounds(img, w, h);
  return contain * Math.pow(max / contain, v / 1000);
}

/** Draw a crop at k× its output size (w×h) into ctx at (0,0). */
export function drawCrop(ctx, crop, w, h, k = 1) {
  ctx.fillStyle = crop?.bg ?? "#000000";
  ctx.fillRect(0, 0, w * k, h * k);
  if (!crop?.img) return;
  const s = crop.scale * k;
  drawScaled(ctx, crop.img, (w * k) / 2 - crop.cx * s, (h * k) / 2 - crop.cy * s, s);
}

/** Render a crop into a new canvas of size outW×outH (scaled from w×h). */
export function renderCrop(crop, w, h, outW = w, outH = h) {
  const c = makeCanvas(outW, outH);
  drawCrop(c.getContext("2d"), crop, w, h, outW / w);
  return c;
}
