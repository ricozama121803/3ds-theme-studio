import { drawScaled, to565Canvas, padCanvas, makeCanvas, extractPalette } from "./imaging.js";
import { COLOR_GROUPS, deriveFields, toConfig, paletteFromImages, contrastOf } from "./colors.js";
import { canRecordTabs, startTabRecording, MAX_RECORD_SECONDS } from "./recorder.js";

// ---- Constants -------------------------------------------------------------

const SAMPLE_RATE = 32728;              // 3DS native audio rate (matches the server)
const MAX_BGM_BYTES = 3371008;          // Home Menu BGM size limit
const MAX_SFX_CHUNK = 0x2dc00;          // kame-tools' limit for all SFX together
const MAX_SFX_SECONDS = 3;
const ADPCM_BYTES_PER_SAMPLE = 8 / 14;  // DSP-ADPCM: 8-byte frame per 14 samples
const BGM_OVERHEAD = 8 * 1024;          // headers + block padding, conservative
const SFX_OVERHEAD = 512;
const SCREEN = { top: { w: 412, h: 240 }, bottom: { w: 320, h: 240 } };
const SCROLL_W = 1008;                  // visible width of a scrolling background
const TEX_H = 256;

const $ = (sel, root = document) => root.querySelector(sel);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---- Image cropper ---------------------------------------------------------

class Cropper {
  constructor(root, { w, h, editScale, optional = false, quantize = true, onChange }) {
    root.append($("#cropper-template").content.cloneNode(true));
    this.root = root;
    this.outW = w;
    this.outH = h;
    this.k = editScale;
    this.quantize = quantize;
    this.onChange = onChange;
    this.img = null;
    this.bg = "#000000";

    this.drop = $(".drop", root);
    this.input = $("input[type=file]", root);
    this.ui = $(".crop-ui", root);
    this.canvas = $(".crop-canvas", root);
    this.zoomEl = $(".zoom", root);
    this.bgEl = $(".bg", root);
    this.qualityEl = $(".quality", root);
    this.ctx = this.canvas.getContext("2d");
    this.sizeCanvas();

    this.input.addEventListener("change", () => {
      if (this.input.files[0]) this.loadFile(this.input.files[0]);
      this.input.value = "";
    });
    wireDropZone(this.drop, (file) => this.loadFile(file), "image/");
    $(".replace", root).addEventListener("click", () => this.input.click());
    $(".reset", root).addEventListener("click", () => this.reset());
    const remove = $(".remove", root);
    remove.hidden = !optional;
    remove.addEventListener("click", () => this.clear());
    this.zoomEl.addEventListener("input", () => {
      this.applyZoom(Number(this.zoomEl.value));
      this.changed();
    });
    this.bgEl.addEventListener("input", () => {
      this.bg = this.bgEl.value;
      this.changed();
    });
    this.wirePointer();
  }

  get hasImage() { return !!this.img; }

  sizeCanvas() {
    this.canvas.width = Math.round(this.outW * this.k);
    this.canvas.height = Math.round(this.outH * this.k);
  }

  /** Change the output size (e.g. switching to a scrolling background). */
  resize(w, h, editScale = this.k) {
    this.outW = w;
    this.outH = h;
    this.k = editScale;
    this.sizeCanvas();
    if (this.img) this.reset();
  }

  async loadFile(file) {
    try {
      const img = await createImageBitmap(file);
      this.userImage = true;
      this.setImage(img);
    } catch {
      alert(`Couldn't open "${file.name}" as an image.`);
    }
  }

  setImage(img) {
    this.img = img;
    this.drop.hidden = true;
    this.ui.hidden = false;
    this.reset();
  }

  clear() {
    this.img = null;
    this.userImage = false;
    this.drop.hidden = false;
    this.ui.hidden = true;
    this.onChange();
  }

  // Zoom maps the slider (0..1000) logarithmically from "whole image fits"
  // (contain) to 4x "fills the frame" (cover).
  scaleBounds() {
    const { width: iw, height: ih } = this.img;
    const contain = Math.min(this.outW / iw, this.outH / ih);
    const cover = Math.max(this.outW / iw, this.outH / ih);
    return { contain, cover, max: cover * 4 };
  }

  sliderFor(scale) {
    const { contain, max } = this.scaleBounds();
    if (max <= contain) return 0;
    return Math.round((1000 * Math.log(scale / contain)) / Math.log(max / contain));
  }

  applyZoom(v) {
    const { contain, max } = this.scaleBounds();
    this.scale = contain * Math.pow(max / contain, v / 1000);
    this.clamp();
  }

  reset() {
    const { cover } = this.scaleBounds();
    this.scale = cover;
    this.cx = this.img.width / 2;
    this.cy = this.img.height / 2;
    this.zoomEl.value = this.sliderFor(cover);
    this.changed();
  }

  clamp() {
    const halfW = this.outW / (2 * this.scale);
    const halfH = this.outH / (2 * this.scale);
    const { width: iw, height: ih } = this.img;
    this.cx = iw >= 2 * halfW ? Math.min(Math.max(this.cx, halfW), iw - halfW) : iw / 2;
    this.cy = ih >= 2 * halfH ? Math.min(Math.max(this.cy, halfH), ih - halfH) : ih / 2;
  }

  wirePointer() {
    let last = null;
    this.canvas.addEventListener("pointerdown", (e) => {
      if (!this.img) return;
      last = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!last) return;
      const cssToOut = this.outW / this.canvas.clientWidth;
      this.cx -= ((e.clientX - last.x) * cssToOut) / this.scale;
      this.cy -= ((e.clientY - last.y) * cssToOut) / this.scale;
      last = { x: e.clientX, y: e.clientY };
      this.clamp();
      this.changed();
    });
    const end = () => { last = null; };
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);
    this.canvas.addEventListener("wheel", (e) => {
      if (!this.img) return;
      e.preventDefault();
      const v = Math.min(1000, Math.max(0, Number(this.zoomEl.value) - Math.sign(e.deltaY) * 40));
      this.zoomEl.value = v;
      this.applyZoom(v);
      this.changed();
    }, { passive: false });
  }

  /** Draw at k× output resolution into ctx at (0,0). */
  draw(ctx, k = 1) {
    const w = this.outW * k, h = this.outH * k;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    if (!this.img) return;
    const s = this.scale * k;
    drawScaled(ctx, this.img, w / 2 - this.cx * s, h / 2 - this.cy * s, s);
  }

  /** Exact-size output canvas (optionally rendered at a different size). */
  render(w = this.outW, h = this.outH) {
    const c = makeCanvas(w, h);
    this.draw(c.getContext("2d"), w / this.outW);
    return c;
  }

  updateQualityHint() {
    if (!this.img || !this.qualityEl) return;
    const { width: iw, height: ih } = this.img;
    if (this.scale > 1.05) {
      const needW = Math.ceil(this.outW), needH = Math.ceil(this.outH);
      this.qualityEl.textContent = `⚠ Enlarged ${this.scale.toFixed(1)}×, so it may look soft. An image at least ${needW}×${needH} (and less zoom) will be sharper.`;
      this.qualityEl.classList.add("warn");
    } else {
      this.qualityEl.textContent = `✓ Sharp: ${iw}×${ih} source, scaled down ${(1 / this.scale).toFixed(1)}× with high-quality filtering. Drag to reposition.`;
      this.qualityEl.classList.remove("warn");
    }
  }

  changed() {
    this.draw(this.ctx, this.k);
    this.updateQualityHint();
    this.onChange();
  }
}

function wireDropZone(zone, onFile, typePrefix) {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragging");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragging");
    const file = [...e.dataTransfer.files].find((f) => typePrefix.split(",").some((t) => f.type.startsWith(t)));
    if (file) onFile(file);
  });
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

// ---- Elements & croppers ---------------------------------------------------

const els = {
  title: $("#title"), author: $("#author"), description: $("#description"),
  topFrame: $("#top-frame"), bottomFrame: $("#bottom-frame"),
  topDims: $("#top-dims"), bottomDims: $("#bottom-dims"),
  previewTop: $("#preview-top"), previewBottom: $("#preview-bottom"), previewIcon: $("#preview-icon"),
  previewTitle: $("#preview-title"), previewAuthor: $("#preview-author"),
  dither: $("#toggle-dither"), overlay: $("#toggle-overlay"), device: $(".device"),
  hideGameText: $("#hide-gametext"),
  checklist: $("#checklist"), buildBtn: $("#build-btn"), buildStatus: $("#build-status"),
  result: $("#result"), saveSd: $("#save-sd"), sdStatus: $("#sd-status"), download: $("#download-link"),
};

const onChange = () => scheduleRender();
const topCrop = new Cropper($('[data-slot="top"]'), { ...SCREEN.top, editScale: 2, onChange: () => { syncIconToTop(); onChange(); } });
const bottomCrop = new Cropper($('[data-slot="bottom"]'), { ...SCREEN.bottom, editScale: 2, onChange });
const iconCrop = new Cropper($('[data-slot="icon"]'), { w: 48, h: 48, editScale: 1, onChange });

const TEXTURES = {
  filelarge: { w: 64, h: 128, k: 2 },
  filesmall: { w: 32, h: 64, k: 4 },
  folderopen: { w: 128, h: 64, k: 2 },
  folderclose: { w: 128, h: 64, k: 2 },
};
const textureCrops = Object.fromEntries(Object.entries(TEXTURES).map(([slot, t]) => [
  slot,
  new Cropper($(`[data-slot="${slot}"]`), { w: t.w, h: t.h, editScale: t.k, optional: true, quantize: false, onChange }),
]));
for (const c of Object.values(textureCrops)) {
  $(".drop-text", c.root).innerHTML = "<strong>Choose</strong> or drop";
  c.drop.classList.add("small");
}

// kame-tools has one on/off flag per pair: setting only one texture of a pair
// leaves the other solid black on the console. Fill the missing partner with
// the same picture (the pairs share an aspect ratio).
const TEXTURE_PAIRS = [["filelarge", "filesmall"], ["folderopen", "folderclose"]];

function textureOutputs() {
  const out = {};
  for (const [a, b] of TEXTURE_PAIRS) {
    const [ca, cb] = [textureCrops[a], textureCrops[b]];
    if (!ca.hasImage && !cb.hasImage) continue;
    out[a] = ca.hasImage ? ca.render() : cb.render(TEXTURES[a].w, TEXTURES[a].h);
    out[b] = cb.hasImage ? cb.render() : ca.render(TEXTURES[b].w, TEXTURES[b].h);
  }
  return out;
}

// The icon follows the top screen image until the user picks their own.
function syncIconToTop() {
  if (iconCrop.userImage || !topCrop.img || iconCrop.img === topCrop.img) return;
  iconCrop.setImage(topCrop.img);
}

// Scrolling backgrounds use a wider canvas.
function applyFrames() {
  const topScroll = els.topFrame.value !== "single";
  const bottomScroll = els.bottomFrame.value !== "single";
  topCrop.resize(topScroll ? SCROLL_W : SCREEN.top.w, SCREEN.top.h, topScroll ? 1 : 2);
  bottomCrop.resize(bottomScroll ? SCROLL_W : SCREEN.bottom.w, SCREEN.bottom.h, bottomScroll ? 1 : 2);
  els.topDims.textContent = topScroll ? `${SCROLL_W} × 240 (scrolling)` : "400 × 240";
  els.bottomDims.textContent = bottomScroll ? `${SCROLL_W} × 240 (scrolling)` : "320 × 240";
  scheduleRender();
}
els.topFrame.addEventListener("change", applyFrames);
els.bottomFrame.addEventListener("change", applyFrames);

// ---- Rendering pipeline ----------------------------------------------------
// Outputs are what gets uploaded: screens/icons quantized to RGB565 exactly as
// the 3DS shows them, so the preview is pixel-accurate.

let outputs = {};
let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderOutputs();
  });
}

function renderOutputs() {
  const dither = els.dither.checked;
  outputs = {
    top: to565Canvas(topCrop.render(), dither),
    bottom: to565Canvas(bottomCrop.render(), dither),
    icon: iconCrop.img ? to565Canvas(iconCrop.render(), dither) : null,
    smallIcon: iconCrop.img ? to565Canvas(iconCrop.render(24, 24), dither) : null,
  };
  const ictx = els.previewIcon.getContext("2d");
  ictx.clearRect(0, 0, 48, 48);
  if (outputs.icon) ictx.drawImage(outputs.icon, 0, 0);
  els.previewTitle.textContent = els.title.value.trim() || "My Theme";
  els.previewAuthor.textContent = els.author.value.trim() || "Anonymous";
  drawScreens(performance.now());
  applyOverlayColors();
  invalidateBuild();
  updateChecklist();
}

const SCROLL_SPEED = { slowscroll: 12, fastscroll: 40, pagescroll: 0, bouncescroll: 30 }; // px/s

function windowOffset(frame, span, t) {
  if (frame === "single" || span <= 0) return 0;
  if (frame === "pagescroll") {
    const pages = 4;
    const page = Math.floor(t / 2500) % (pages * 2 - 2);
    const p = page < pages ? page : pages * 2 - 2 - page;
    return (span / (pages - 1)) * p;
  }
  const d = (t / 1000) * SCROLL_SPEED[frame];
  const cycle = d % (span * 2);
  return cycle < span ? cycle : span * 2 - cycle; // ping-pong
}

function drawScreens(t) {
  const pairs = [
    [els.previewTop, outputs.top, els.topFrame.value, SCREEN.top.w],
    [els.previewBottom, outputs.bottom, els.bottomFrame.value, SCREEN.bottom.w],
  ];
  for (const [canvas, out, frame, w] of pairs) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!out) continue;
    const x = Math.round(windowOffset(frame, out.width - w, t));
    ctx.drawImage(out, x, 0, w, 240, 0, 0, w, 240);
  }
}

(function animate(t) {
  if (els.topFrame.value !== "single" || els.bottomFrame.value !== "single") drawScreens(t);
  requestAnimationFrame(animate);
})(0);

els.dither.addEventListener("change", scheduleRender);
for (const el of [els.title, els.author, els.description]) el.addEventListener("input", scheduleRender);

// Home Menu overlay
const grid = $(".hm-grid");
for (let i = 0; i < 15; i++) grid.append(document.createElement("span"));
els.overlay.addEventListener("change", () => els.device.classList.toggle("show-hm", els.overlay.checked));
els.device.classList.toggle("show-hm", els.overlay.checked);

// ---- Colours ---------------------------------------------------------------

const DEFAULTS = {
  filecolor: "#f3f3f3", cursorcolor: "#43c7f4", foldercolor: "#f0c540", folderbgcolor: "#d9d9d9",
  folderarrowcolor: "#e6e6e6", open: "#e6e6e6", close: "#e6e6e6", arrowbuttoncolor: "#f3f3f3",
  arrowcolor: "#7d7d7d", bottomcornerbuttoncolor: "#f3f3f3", topcornerbuttoncolor: "#f3f3f3",
  gametext: "#2b2b2b", demotextcolor: "#43c7f4",
};
const colorState = Object.fromEntries(COLOR_GROUPS.map((g) => [
  g.id, { enabled: false, base: DEFAULTS[g.id], text: contrastOf(DEFAULTS[g.id]), overrides: {} },
]));

const groupsEl = $("#color-groups");
const groupUi = {};

for (const group of COLOR_GROUPS) {
  const row = document.createElement("div");
  row.className = "cgroup";
  row.innerHTML = `
    <label class="inline check cgroup-name">
      <input type="checkbox" class="enable">
      <span><strong></strong><small></small></span>
    </label>
    <div class="cgroup-pickers">
      <label class="swatch" title="Main colour"><input type="color" class="base"><span>Colour</span></label>
      ${group.text ? `<label class="swatch" title="Text colour"><input type="color" class="text"><span>Text</span></label>` : ""}
    </div>
    <details class="fine">
      <summary>Fine-tune shades</summary>
      <div class="fields"></div>
      <button type="button" class="ghost tiny reset-shades">Reset shades</button>
    </details>`;
  $("strong", row).textContent = group.label;
  $("small", row).textContent = group.desc;
  const fieldsEl = $(".fields", row);
  const fieldInputs = {};
  for (const f of group.fields) {
    const l = document.createElement("label");
    l.className = "swatch";
    l.innerHTML = `<input type="color"><span></span>`;
    $("span", l).textContent = f.replace("text", "text ").replace("icon", "icon ");
    const input = $("input", l);
    input.addEventListener("input", () => {
      colorState[group.id].overrides[f] = input.value;
      setEnabled(group.id, true);
    });
    fieldInputs[f] = input;
    fieldsEl.append(l);
  }
  const ui = { row, enable: $(".enable", row), base: $(".base", row), text: $(".text", row), fieldInputs };
  groupUi[group.id] = ui;

  ui.enable.addEventListener("change", () => setEnabled(group.id, ui.enable.checked));
  ui.base.addEventListener("input", () => { colorState[group.id].base = ui.base.value; setEnabled(group.id, true); });
  ui.text?.addEventListener("input", () => { colorState[group.id].text = ui.text.value; setEnabled(group.id, true); });
  $(".reset-shades", row).addEventListener("click", () => { colorState[group.id].overrides = {}; syncGroup(group.id); scheduleRender(); });
  groupsEl.append(row);
  syncGroup(group.id);
}

function setEnabled(id, on) {
  colorState[id].enabled = on;
  syncGroup(id);
  scheduleRender();
}

function syncGroup(id) {
  const group = COLOR_GROUPS.find((g) => g.id === id);
  const s = colorState[id];
  const ui = groupUi[id];
  ui.enable.checked = s.enabled;
  ui.row.classList.toggle("on", s.enabled);
  ui.base.value = s.base;
  if (ui.text) ui.text.value = s.text;
  const fields = deriveFields(group, s.base, s.text, s.overrides);
  for (const [f, input] of Object.entries(ui.fieldInputs)) {
    input.value = fields[f];
    input.parentElement.classList.toggle("overridden", !!s.overrides[f]);
  }
}

$("#auto-colors").addEventListener("click", () => {
  if (!topCrop.img && !bottomCrop.img) {
    alert("Add a top or bottom screen image first.");
    return;
  }
  const palette = paletteFromImages(
    topCrop.img ? extractPalette(topCrop.img) : [],
    bottomCrop.img ? extractPalette(bottomCrop.img) : [],
  );
  for (const [id, { base, text }] of Object.entries(palette)) {
    Object.assign(colorState[id], { enabled: true, base, text, overrides: {} });
    syncGroup(id);
  }
  scheduleRender();
});

$("#clear-colors").addEventListener("click", () => {
  for (const g of COLOR_GROUPS) {
    Object.assign(colorState[g.id], { enabled: false, base: DEFAULTS[g.id], text: contrastOf(DEFAULTS[g.id]), overrides: {} });
    syncGroup(g.id);
  }
  scheduleRender();
});

els.hideGameText.addEventListener("change", scheduleRender);

/** Reflect colours in the preview overlay (approximate Home Menu look). */
function applyOverlayColors() {
  const get = (id, field) => {
    const s = colorState[id];
    const group = COLOR_GROUPS.find((g) => g.id === id);
    const base = s.enabled ? s.base : DEFAULTS[id];
    const text = s.enabled ? s.text : contrastOf(DEFAULTS[id]);
    return deriveFields(group, base, text, s.enabled ? s.overrides : {})[field];
  };
  const vars = {
    "--hm-tile": get("filecolor", "main"),
    "--hm-tile-light": get("filecolor", "light"),
    "--hm-tile-dark": get("filecolor", "dark"),
    "--hm-cursor": get("cursorcolor", "main"),
    "--hm-cursor-glow": get("cursorcolor", "glow"),
    "--hm-bar": get("open", "main"),
    "--hm-bar-light": get("open", "light"),
    "--hm-bar-text": get("open", "textmain"),
    "--hm-arrowbtn": get("arrowbuttoncolor", "main"),
    "--hm-arrow": get("arrowcolor", "unpressed"),
    "--hm-corner": get("bottomcornerbuttoncolor", "main"),
    "--hm-topcorner": get("topcornerbuttoncolor", "main"),
    "--hm-bubble": get("gametext", "main"),
    "--hm-bubble-text": get("gametext", "textmain"),
  };
  for (const [k, v] of Object.entries(vars)) els.device.style.setProperty(k, v);
  $("#hm-bubble").hidden = els.hideGameText.checked;
}

// ---- Music -----------------------------------------------------------------

const music = {
  file: null, duration: 0, url: null,
  source: $("#music-source"), drop: $("#music-drop"), input: $("#music-file"), ui: $("#music-ui"),
  player: $("#music-player"), name: $("#music-name"),
  start: $("#music-start"), end: $("#music-end"), fade: $("#music-fade"), mono: $("#music-mono"),
  fill: $("#meter-fill"), meterText: $("#meter-text"), error: $("#music-error"),
};

function maxSeconds(mono) {
  return (MAX_BGM_BYTES - BGM_OVERHEAD) / (SAMPLE_RATE * (mono ? 1 : 2) * ADPCM_BYTES_PER_SAMPLE);
}

function clipRange() {
  const start = Math.max(0, Number(music.start.value) || 0);
  let end = Number(music.end.value) || music.duration;
  if (music.duration) end = Math.min(end, music.duration);
  return { start, end, length: Math.max(0, end - start) };
}

function estimateBgmBytes() {
  return clipRange().length * SAMPLE_RATE * (music.mono.checked ? 1 : 2) * ADPCM_BYTES_PER_SAMPLE + BGM_OVERHEAD;
}

const musicOverLimit = () => !!music.file && estimateBgmBytes() > MAX_BGM_BYTES;

function updateMeter() {
  if (!music.file) return;
  const bytes = estimateBgmBytes();
  const ratio = bytes / MAX_BGM_BYTES;
  const { length } = clipRange();
  setMeter(music.fill, ratio);
  const mb = (b) => (b / 1048576).toFixed(2);
  const max = maxSeconds(music.mono.checked);
  music.meterText.textContent = ratio > 1
    ? `Too long: ${length.toFixed(1)} s ≈ ${mb(bytes)} MB. Keep it under ${max.toFixed(0)} s${music.mono.checked ? "" : " or switch to mono"}.`
    : `${length.toFixed(1)} s clip ≈ ${mb(bytes)} MB of ${mb(MAX_BGM_BYTES)} MB (max ≈ ${max.toFixed(0)} s).`;
}

function setMeter(fill, ratio) {
  fill.style.width = `${Math.min(100, ratio * 100)}%`;
  fill.classList.toggle("near", ratio > 0.9 && ratio <= 1);
  fill.classList.toggle("over", ratio > 1);
}

function setDuration(d) {
  music.duration = d;
  const fit = Math.min(d, Math.floor(maxSeconds(music.mono.checked)));
  music.end.value = fit.toFixed(1);
  music.end.max = d.toFixed(1);
  music.start.max = d.toFixed(1);
  updateMeter();
  scheduleRender();
}

function loadMusic(file) {
  music.file = file;
  music.error.textContent = "";
  if (music.url) URL.revokeObjectURL(music.url);
  music.url = URL.createObjectURL(file);
  music.player.src = music.url;
  music.name.textContent = file.name;
  music.source.hidden = true;
  music.ui.hidden = false;
  music.start.value = 0;
  music.end.value = 0;
  music.duration = 0;
  music.meterText.textContent = "Reading song length…";
  if (file.knownDuration) setDuration(file.knownDuration);
  scheduleRender();
}

music.player.addEventListener("loadedmetadata", () => {
  if (music.duration || !Number.isFinite(music.player.duration)) return;
  setDuration(music.player.duration);
});
music.player.addEventListener("error", () => {
  if (!music.file) return;
  music.meterText.textContent = "Your browser can't play this file, but the server may still convert it.";
});

music.input.addEventListener("change", () => {
  if (music.input.files[0]) loadMusic(music.input.files[0]);
  music.input.value = "";
});
wireDropZone(music.drop, loadMusic, "audio/,video/");
$("#music-remove").addEventListener("click", () => {
  music.player.pause();
  music.player.removeAttribute("src");
  music.file = null;
  music.ui.hidden = true;
  music.source.hidden = false;
  scheduleRender();
});
for (const el of [music.start, music.end, music.mono, music.fade]) {
  el.addEventListener("input", () => { updateMeter(); scheduleRender(); });
}
$("#set-start").addEventListener("click", () => {
  music.start.value = music.player.currentTime.toFixed(1);
  updateMeter(); scheduleRender();
});
$("#set-end").addEventListener("click", () => {
  music.end.value = music.player.currentTime.toFixed(1);
  updateMeter(); scheduleRender();
});

let clipStopAt = null;
$("#music-preview").addEventListener("click", () => {
  const { start, end } = clipRange();
  clipStopAt = end;
  music.player.currentTime = start;
  music.player.play();
});
music.player.addEventListener("timeupdate", () => {
  if (clipStopAt !== null && music.player.currentTime >= clipStopAt) {
    music.player.pause();
    clipStopAt = null;
  }
});

// Tab recording
const recBtn = $("#record-btn");
const recUi = $("#recording-ui");
if (!canRecordTabs) {
  recBtn.disabled = true;
  $("#record-hint").textContent = "Recording another tab needs Chrome or Edge on a computer.";
}
recBtn.addEventListener("click", async () => {
  music.error.textContent = "";
  let controller;
  try {
    controller = await startTabRecording({
      onLevel: (v) => { $("#rec-level").style.width = `${Math.round(v * 100)}%`; },
      onTick: (s) => { $("#rec-time").textContent = `${fmtTime(s)} / ${fmtTime(MAX_RECORD_SECONDS)}`; },
      onStop: async (done) => {
        recUi.hidden = true;
        music.source.hidden = false;
        recBtn.disabled = true;
        recBtn.textContent = "Processing recording…";
        try {
          loadMusic(await done);
        } catch (err) {
          music.error.textContent = err.message;
        } finally {
          recBtn.disabled = false;
          recBtn.textContent = "● Record from another tab";
        }
      },
    });
  } catch (err) {
    music.error.textContent = err.message;
    return;
  }
  music.source.hidden = true;
  recUi.hidden = false;
  $("#rec-stop").onclick = () => controller.stop();
});

// ---- Sound effects ---------------------------------------------------------

const SFX_SLOTS = [
  ["cursor", "Moving the cursor"],
  ["launch", "Opening an app"],
  ["folder", "Opening a folder"],
  ["close", "Closing an app"],
  ["frame0", "Scrolling (1)"],
  ["frame1", "Scrolling (2)"],
  ["frame2", "Scrolling (3)"],
  ["openlid", "Opening the lid"],
];
const sfx = {}; // slot -> { file, duration }
const sfxList = $("#sfx-list");

for (const [slot, label] of SFX_SLOTS) {
  const row = document.createElement("div");
  row.className = "sfx-row";
  row.innerHTML = `
    <span class="sfx-label"></span>
    <span class="sfx-file hint">None</span>
    <span class="sfx-buttons">
      <button type="button" class="ghost tiny play" hidden title="Play">▶</button>
      <button type="button" class="ghost tiny pick">Choose</button>
      <button type="button" class="ghost tiny remove" hidden title="Remove">✕</button>
    </span>
    <input type="file" accept="audio/*" hidden>`;
  $(".sfx-label", row).textContent = label;
  const input = $("input", row);
  $(".pick", row).addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const a = new Audio(URL.createObjectURL(file));
    a.addEventListener("loadedmetadata", () => {
      sfx[slot] = { file, duration: Number.isFinite(a.duration) ? a.duration : MAX_SFX_SECONDS, audio: a };
      const used = Math.min(sfx[slot].duration, MAX_SFX_SECONDS);
      $(".sfx-file", row).textContent = `${file.name} · ${used.toFixed(1)} s${sfx[slot].duration > MAX_SFX_SECONDS ? " (trimmed)" : ""}`;
      $(".play", row).hidden = false;
      $(".remove", row).hidden = false;
      updateSfxMeter();
      scheduleRender();
    }, { once: true });
    a.addEventListener("error", () => alert(`Couldn't read "${file.name}" as audio.`), { once: true });
  });
  $(".play", row).addEventListener("click", () => {
    const a = sfx[slot]?.audio;
    if (!a) return;
    a.currentTime = 0;
    a.play();
    setTimeout(() => a.pause(), MAX_SFX_SECONDS * 1000);
  });
  $(".remove", row).addEventListener("click", () => {
    delete sfx[slot];
    $(".sfx-file", row).textContent = "None";
    $(".play", row).hidden = true;
    $(".remove", row).hidden = true;
    updateSfxMeter();
    scheduleRender();
  });
  sfxList.append(row);
}

function sfxBytes() {
  let total = 8 + 11 * 4;
  for (const [slot] of SFX_SLOTS) {
    const s = sfx[slot];
    total += 8 + (s ? Math.min(s.duration, MAX_SFX_SECONDS) * SAMPLE_RATE * ADPCM_BYTES_PER_SAMPLE + SFX_OVERHEAD : 0);
  }
  return total;
}
const sfxCount = () => Object.keys(sfx).length;
const sfxOverLimit = () => sfxCount() > 0 && sfxBytes() >= MAX_SFX_CHUNK;

function updateSfxMeter() {
  const bytes = sfxBytes();
  setMeter($("#sfx-fill"), sfxCount() ? bytes / MAX_SFX_CHUNK : 0);
  $("#sfx-text").textContent = !sfxCount()
    ? "No sound effects added."
    : bytes >= MAX_SFX_CHUNK
      ? `Too much: about ${(bytes / 1024).toFixed(0)} KB of ${(MAX_SFX_CHUNK / 1024).toFixed(0)} KB. Use shorter sounds or fewer of them.`
      : `About ${(bytes / 1024).toFixed(0)} KB of ${(MAX_SFX_CHUNK / 1024).toFixed(0)} KB used.`;
}

// ---- Checklist / build -----------------------------------------------------

function updateChecklist() {
  const colorCount = Object.values(colorState).filter((s) => s.enabled).length;
  const texCount = Object.values(textureCrops).filter((c) => c.hasImage).length;
  const items = [
    ["Top screen image", topCrop.hasImage, false],
    ["Bottom screen image", bottomCrop.hasImage, false],
    ["Icon", iconCrop.hasImage, false],
    [music.file ? (musicOverLimit() ? "Music is too long" : "Music") : "Music (optional)", music.file && !musicOverLimit(), !music.file],
    [colorCount ? `${colorCount} colour group${colorCount > 1 ? "s" : ""} customised` : "Colours (optional)", colorCount > 0, !colorCount],
    [sfxCount() ? (sfxOverLimit() ? "Sound effects are too big" : `${sfxCount()} sound effect${sfxCount() > 1 ? "s" : ""}`) : "Sound effects (optional)", sfxCount() && !sfxOverLimit(), !sfxCount()],
    [texCount ? `${texCount} custom texture${texCount > 1 ? "s" : ""}` : "Textures (optional)", texCount > 0, !texCount],
  ];
  els.checklist.replaceChildren(...items.map(([label, done, optional]) => {
    const li = document.createElement("li");
    li.textContent = label;
    if (done) li.classList.add("done");
    else if (optional) li.classList.add("optional");
    return li;
  }));
  els.buildBtn.disabled = building || !(topCrop.hasImage && bottomCrop.hasImage && iconCrop.hasImage) || musicOverLimit() || sfxOverLimit();
}

let built = null; // { blob, filename }
let building = false;

function invalidateBuild() {
  if (!built) return;
  built = null;
  els.result.hidden = true;
  setStatus(els.buildStatus, "You changed something; build again to update the theme.", "");
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = `status ${kind || ""}`;
}

function makePreviewImage() {
  const c = makeCanvas(412, 480);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 412, 480);
  ctx.drawImage(outputs.top, 0, 0, 412, 240, 0, 0, 412, 240);
  ctx.drawImage(outputs.bottom, 0, 0, 320, 240, 46, 240, 320, 240);
  return c;
}

els.buildBtn.addEventListener("click", async () => {
  building = true;
  els.buildBtn.disabled = true;
  const busy = music.file || sfxCount() ? "Building… converting audio can take a few seconds." : "Building…";
  setStatus(els.buildStatus, busy, "");
  els.result.hidden = true;

  try {
    renderOutputs();
    const texW = (frame) => (frame === "single" ? 512 : 1024);
    const form = new FormData();
    form.append("title", els.title.value);
    form.append("author", els.author.value);
    form.append("description", els.description.value);
    form.append("topFrame", els.topFrame.value);
    form.append("bottomFrame", els.bottomFrame.value);
    form.append("colors", JSON.stringify(toConfig(colorState)));
    form.append("hideGameText", els.hideGameText.checked);
    form.append("top", await toBlob(padCanvas(outputs.top, texW(els.topFrame.value), TEX_H)), "top.png");
    form.append("bottom", await toBlob(padCanvas(outputs.bottom, texW(els.bottomFrame.value), TEX_H)), "bottom.png");
    form.append("icon", await toBlob(outputs.icon), "icon.png");
    form.append("smallicon", await toBlob(outputs.smallIcon), "smallicon.png");
    form.append("preview", await toBlob(makePreviewImage()), "preview.png");
    for (const [slot, canvas] of Object.entries(textureOutputs())) {
      form.append(slot, await toBlob(canvas), `${slot}.png`);
    }
    if (music.file) {
      const { start, end } = clipRange();
      form.append("music", music.file, music.file.name);
      form.append("start", start);
      form.append("end", end);
      form.append("mono", music.mono.checked);
      form.append("fade", Number(music.fade.value) || 0);
    }
    for (const [slot, { file }] of Object.entries(sfx)) form.append(`sfx_${slot}`, file, file.name);

    const res = await fetch("/api/build", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Build failed (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    const filename = decodeURIComponent(res.headers.get("X-Theme-Filename") || "theme.zip");
    built = { blob, filename };

    if (els.download.href) URL.revokeObjectURL(els.download.href);
    els.download.href = URL.createObjectURL(blob);
    els.download.download = filename;
    els.download.textContent = `Download ${filename}`;
    els.result.hidden = false;
    setStatus(els.sdStatus, canPickFolders ? "" : els.sdStatus.textContent, "");
    setStatus(els.buildStatus, `Built ${filename} (${(blob.size / 1048576).toFixed(2)} MB).`, "ok");
  } catch (err) {
    setStatus(els.buildStatus, err.message, "error");
  } finally {
    building = false;
    updateChecklist();
  }
});

// ---- Save to SD card (File System Access API) ------------------------------

const canPickFolders = "showDirectoryPicker" in window;
const noPickerMsg = "Saving straight to the SD card needs Chrome or Edge. In this browser, download the zip and copy it into the card’s /Themes/ folder.";
if (!canPickFolders) {
  els.saveSd.disabled = true;
  els.saveSd.title = "Needs Chrome, Edge or another Chromium browser";
  setStatus(els.sdStatus, noPickerMsg, "");
}

async function childDir(dir, name) {
  // Case-insensitive lookup, since FAT32 SD cards can have "themes" or "Themes".
  for await (const [entryName, handle] of dir.entries()) {
    if (handle.kind === "directory" && entryName.toLowerCase() === name.toLowerCase()) return handle;
  }
  return null;
}

async function fileExists(dir, name) {
  try { await dir.getFileHandle(name); return true; } catch { return false; }
}

els.saveSd.addEventListener("click", async () => {
  if (!built) return;
  let picked;
  try {
    picked = await window.showDirectoryPicker({ id: "3ds-sd", mode: "readwrite" });
  } catch {
    return; // user cancelled
  }

  try {
    let themes;
    if (picked.name.toLowerCase() === "themes") {
      themes = picked;
    } else {
      themes = await childDir(picked, "Themes");
      if (!themes) {
        const looksLikeSd = (await childDir(picked, "Nintendo 3DS")) || (await childDir(picked, "luma")) || (await childDir(picked, "3ds"));
        const ok = looksLikeSd || confirm(
          `"${picked.name}" doesn't look like a 3DS SD card (no "Nintendo 3DS" or "luma" folder).\n\nCreate a Themes folder here anyway?`,
        );
        if (!ok) return;
        themes = await picked.getDirectoryHandle("Themes", { create: true });
      }
    }

    if (await fileExists(themes, built.filename) &&
        !confirm(`${built.filename} is already in Themes. Replace it?`)) {
      return;
    }

    const handle = await themes.getFileHandle(built.filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(built.blob);
    await writable.close();
    const where = picked === themes ? themes.name : `${picked.name}/${themes.name}`;
    setStatus(els.sdStatus, `Saved to ${where}/${built.filename}. Eject the SD card safely before removing it.`, "ok");
  } catch (err) {
    setStatus(els.sdStatus, `Couldn't save to that folder: ${err.message}`, "error");
  }
});

applyFrames();
updateSfxMeter();
scheduleRender();
