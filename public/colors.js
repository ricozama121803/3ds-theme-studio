// Home Menu colour groups supported by kame-tools.
//
// kame-tools turns a group on as soon as ANY of its fields is set and leaves
// the rest as black, so we always send every field of an enabled group,
// derived from a base colour + text colour (each field can be overridden).

/** Field roles decide how a value is derived from the base/text colours. */
const DERIVE = {
  dark: (b) => mix(b, "#000000", 0.35),
  main: (b) => b,
  light: (b) => mix(b, "#ffffff", 0.35),
  glow: (b) => mix(b, "#ffffff", 0.6),
  shadow: (b) => mix(b, "#000000", 0.55),
  border: (b) => mix(b, "#000000", 0.45),
  unpressed: (b) => b,
  pressed: (b) => mix(b, "#ffffff", 0.35),
  textmain: (_b, t) => t,
  textselected: (_b, t) => t,
  textshadow: (_b, t) => contrastOf(t),
  iconmain: (_b, t) => t,
  iconlight: (_b, t) => mix(t, "#ffffff", 0.3),
  icontextmain: (_b, t) => t,
};

export const COLOR_GROUPS = [
  { id: "filecolor", label: "App tiles", desc: "The squares behind your app icons.",
    fields: ["dark", "main", "light", "shadow"], rgba: ["shadow"] },
  { id: "cursorcolor", label: "Selection cursor", desc: "The glowing frame around the selected app.",
    fields: ["dark", "main", "light", "glow"] },
  { id: "foldercolor", label: "Folders", desc: "Folder icons and the 3D folder on the top screen.",
    fields: ["dark", "main", "light", "shadow"] },
  { id: "folderbgcolor", label: "Inside folders", desc: "Bottom-screen background while a folder is open.",
    fields: ["dark", "main", "light", "shadow"], rgba: ["shadow"] },
  { id: "folderarrowcolor", label: "Folder back button", desc: "The button that leaves an open folder.",
    fields: ["dark", "main", "light", "shadow", "glow", "textshadow", "textmain", "textselected"],
    rgba: ["shadow"], textShadowPos: true, text: true },
  { id: "open", label: "Open button", desc: "The bar at the bottom of the touch screen.",
    fields: ["dark", "main", "light", "shadow", "glow", "textshadow", "textmain", "textselected"],
    rgba: ["shadow"], textShadowPos: true, text: true },
  { id: "close", label: "Close button", desc: "The bar while a game is suspended.",
    fields: ["dark", "main", "light", "shadow", "glow", "textshadow", "textmain", "textselected"],
    rgba: ["shadow"], textShadowPos: true, text: true },
  { id: "arrowbuttoncolor", label: "Scroll buttons", desc: "The side buttons for scrolling the app grid.",
    fields: ["dark", "main", "light", "shadow"], rgba: ["shadow"] },
  { id: "arrowcolor", label: "Scroll arrows", desc: "The arrows drawn on those buttons.",
    fields: ["border", "unpressed", "pressed"] },
  { id: "bottomcornerbuttoncolor", label: "Bottom corner buttons", desc: "Zoom and app-grid buttons.",
    fields: ["dark", "main", "light", "shadow", "iconmain", "iconlight", "icontextmain"], text: true },
  { id: "topcornerbuttoncolor", label: "Top corner buttons", desc: "Brightness, settings and friends shortcuts.",
    fields: ["main", "light", "shadow", "textmain"], text: true },
  { id: "gametext", label: "App name bubble", desc: "The title popup above the selected app.",
    fields: ["main", "light", "shadow", "textmain"], rgba: ["shadow"], text: true },
  { id: "demotextcolor", label: "Demo text", desc: "The ‘demo’ label on trial software.",
    fields: ["main", "textmain"], text: true },
];

// ---- colour maths ----------------------------------------------------------

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastOf(hex) {
  return luminance(hex) > 0.4 ? "#1a1a1a" : "#ffffff";
}

// ---- group state -----------------------------------------------------------

/** Fill in every field of a group from its base and text colours. */
export function deriveFields(group, base, text, overrides = {}) {
  const out = {};
  for (const f of group.fields) out[f] = overrides[f] || DERIVE[f](base, text);
  return out;
}

/**
 * Convert enabled groups to kame-tools config entries:
 * { "filecolor.main": "0xRRGGBB", "filecolor.shadow": "0xRRGGBBAA", ... }
 */
export function toConfig(state) {
  const cfg = {};
  for (const group of COLOR_GROUPS) {
    const s = state[group.id];
    if (!s?.enabled) continue;
    const fields = deriveFields(group, s.base, s.text, s.overrides);
    for (const [field, hex] of Object.entries(fields)) {
      const isRgba = group.rgba?.includes(field);
      cfg[`${group.id}.${field}`] = "0x" + hex.slice(1) + (isRgba ? "ff" : "");
    }
    if (group.textShadowPos) cfg[`${group.id}.textshadowpos`] = "1";
  }
  return cfg;
}

/**
 * Pick a coherent palette from the screen images: tiles in a light tint of
 * the bottom image, cursor/folders in its most vivid colour, bars darker.
 */
export function paletteFromImages(topPalette, bottomPalette) {
  const all = [...bottomPalette, ...topPalette];
  if (!all.length) return null;
  const hex = (c) => rgbToHex([c.r, c.g, c.b]);

  const dominant = bottomPalette[0] || topPalette[0];
  const dark = [...all].filter((c) => c.count > 2).sort((a, b) => a.lum - b.lum)[0] || dominant;
  const tile = mix(hex(dominant), "#ffffff", 0.55);

  // Accent (cursor, folders): the most saturated mid-brightness colour that
  // clearly stands apart from the tiles, so the selection is easy to see.
  const tileRgb = hexToRgb(tile);
  const distance = (c) => Math.hypot(c.r - tileRgb[0], c.g - tileRgb[1], c.b - tileRgb[2]);
  const candidates = all
    .filter((c) => c.count >= 3 && c.lum > 0.15 && c.lum < 0.85)
    .sort((a, b) => b.sat ** 2 * Math.sqrt(b.count) - a.sat ** 2 * Math.sqrt(a.count));
  const vivid = candidates.find((c) => distance(c) > 110) || candidates[0] || dominant;
  const accent = hex(vivid);
  const bar = mix(hex(dark), accent, 0.35);
  return {
    filecolor: { base: tile, text: contrastOf(tile) },
    cursorcolor: { base: accent, text: contrastOf(accent) },
    foldercolor: { base: accent, text: contrastOf(accent) },
    folderbgcolor: { base: mix(hex(dominant), "#000000", 0.25), text: "#ffffff" },
    folderarrowcolor: { base: bar, text: contrastOf(bar) },
    open: { base: bar, text: contrastOf(bar) },
    close: { base: mix(bar, accent, 0.4), text: contrastOf(mix(bar, accent, 0.4)) },
    arrowbuttoncolor: { base: tile, text: contrastOf(tile) },
    arrowcolor: { base: accent, text: contrastOf(accent) },
    bottomcornerbuttoncolor: { base: tile, text: contrastOf(tile) },
    topcornerbuttoncolor: { base: tile, text: contrastOf(tile) },
    gametext: { base: mix(hex(dark), "#000000", 0.3), text: "#ffffff" },
    demotextcolor: { base: accent, text: contrastOf(accent) },
  };
}
