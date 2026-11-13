// Server-side theme builder: converts audio (ffmpeg -> rstmcpp) and packs
// everything with kame-tools. Images arrive already cropped and quantized.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const run = promisify(execFile);

const BIN = path.join(process.cwd(), "bin");
const KAME = process.env.KAME_TOOLS || path.join(BIN, "kame-tools");
const RSTM = process.env.RSTMCPP || path.join(BIN, "rstmcpp");

export const SAMPLE_RATE = 32728;       // 3DS native rate
export const MAX_BGM_BYTES = 3371008;   // Home Menu refuses larger BGMs
export const MAX_SFX_CHUNK = 0x2dc00;   // kame-tools' limit for all SFX together
export const MAX_SFX_SECONDS = 3;
export const MAX_UPLOAD = 80 * 1024 * 1024;

const TOP_FRAMES = ["single", "slowscroll", "fastscroll"];
const BOTTOM_FRAMES = ["single", "slowscroll", "fastscroll", "pagescroll", "bouncescroll"];
const SFX_SLOTS = ["cursor", "launch", "folder", "close", "frame0", "frame1", "frame2", "openlid"];
const OPTIONAL_TEXTURES = ["folderopen", "folderclose", "filelarge", "filesmall"];

// Colour keys kame-tools understands: group -> allowed fields.
const COLOR_FIELDS = {
  filecolor: ["dark", "main", "light", "shadow"],
  cursorcolor: ["dark", "main", "light", "glow"],
  foldercolor: ["dark", "main", "light", "shadow"],
  folderbgcolor: ["dark", "main", "light", "shadow"],
  folderarrowcolor: ["textshadowpos", "dark", "main", "light", "shadow", "glow", "textshadow", "textmain", "textselected"],
  open: ["textshadowpos", "dark", "main", "light", "shadow", "glow", "textshadow", "textmain", "textselected"],
  close: ["textshadowpos", "dark", "main", "light", "shadow", "glow", "textshadow", "textmain", "textselected"],
  arrowbuttoncolor: ["dark", "main", "light", "shadow"],
  arrowcolor: ["border", "unpressed", "pressed"],
  bottomcornerbuttoncolor: ["dark", "main", "light", "shadow", "iconmain", "iconlight", "icontextmain"],
  topcornerbuttoncolor: ["main", "light", "shadow", "textmain"],
  gametext: ["main", "light", "shadow", "textmain"],
  demotextcolor: ["main", "textmain"],
};

export class UserError extends Error {}

// Values go into an INI-style config: strip anything that could break a line
// or start a comment/section, and cap to SMDH field lengths.
function cleanText(value, max, fallback) {
  const text = String(value ?? "")
    .replace(/[\r\n\t;#[\]=]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const mb = (b) => (b / 1048576).toFixed(2);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const isFile = (v) => v && typeof v === "object" && typeof v.arrayBuffer === "function";

async function fileBuffer(file) {
  if (file.size > MAX_UPLOAD) throw new UserError(`${file.name || "A file"} is too large.`);
  return Buffer.from(await file.arrayBuffer());
}

async function savePng(file, dest, label) {
  if (!isFile(file)) return false;
  const buf = await fileBuffer(file);
  if (!buf.subarray(0, 4).equals(PNG_MAGIC)) throw new UserError(`${label} must be a PNG`);
  await fs.writeFile(dest, buf);
  return true;
}

function parseColors(raw) {
  if (!raw) return [];
  let obj;
  try {
    obj = JSON.parse(String(raw));
  } catch {
    throw new UserError("Colour settings were malformed.");
  }
  const lines = [];
  for (const [key, value] of Object.entries(obj ?? {})) {
    const [group, field, extra] = key.split(".");
    if (extra !== undefined || !COLOR_FIELDS[group]?.includes(field)) continue;
    const v = String(value);
    const ok = field === "textshadowpos" ? /^\d{1,3}(\.\d{1,3})?$/.test(v) : /^0x[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);
    if (!ok) throw new UserError(`Invalid colour value for ${key}`);
    lines.push(`${group}.${field} = ${v}`);
  }
  return lines;
}

async function toWav(src, wav, { start = 0, end = 0, channels, fade = 0, maxSeconds = 0, trimSilence = false }) {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  if (start > 0) args.push("-ss", String(start));
  args.push("-i", src);
  const filters = [];
  if (trimSilence) filters.push("silenceremove=start_periods=1:start_threshold=-50dB");
  let length = end > start ? end - start : 0;
  if (maxSeconds) length = length ? Math.min(length, maxSeconds) : maxSeconds;
  if (fade > 0 && length) filters.push(`afade=t=out:st=${Math.max(0, length - fade)}:d=${fade}`);
  if (filters.length) args.push("-af", filters.join(","));
  if (length) args.push("-t", String(length));
  args.push("-vn", "-ac", String(channels), "-ar", String(SAMPLE_RATE), "-c:a", "pcm_s16le", wav);
  await run("ffmpeg", args, { timeout: 120_000 });
}

async function buildMusic(file, dir, form) {
  const src = path.join(dir, "music-src");
  const wav = path.join(dir, "bgm.wav");
  const bcstm = path.join(dir, "bgm.bcstm");
  await fs.writeFile(src, await fileBuffer(file));

  try {
    await toWav(src, wav, {
      start: Math.max(0, num(form.get("start"), 0)),
      end: num(form.get("end"), 0),
      channels: form.get("mono") === "true" ? 1 : 2,
      fade: Math.min(Math.max(0, num(form.get("fade"), 0)), 10),
    });
  } catch {
    throw new UserError("Couldn't read that audio file. Try an MP3, WAV, OGG or M4A.");
  }

  await run(RSTM, ["-l", wav, bcstm], { timeout: 120_000 });
  const { size } = await fs.stat(bcstm);
  if (size > MAX_BGM_BYTES) {
    throw new UserError(
      `Music is ${mb(size)} MB after conversion; the 3DS limit is ${mb(MAX_BGM_BYTES)} MB. ` +
        "Shorten the clip or switch to mono.",
    );
  }
  return bcstm;
}

/** Convert each uploaded SFX to a mono .bcwav; returns [slot, path] pairs. */
async function buildSfx(form, dir) {
  const out = [];
  let chunk = 8 + 11 * 4; // header + extData, as counted by kame-tools
  for (const slot of SFX_SLOTS) {
    const file = form.get(`sfx_${slot}`);
    if (!isFile(file)) {
      chunk += 8;
      continue;
    }
    const src = path.join(dir, `sfx-${slot}-src`);
    const wav = path.join(dir, `sfx-${slot}.wav`);
    const bcwav = path.join(dir, `sfx-${slot}.bcwav`);
    await fs.writeFile(src, await fileBuffer(file));
    try {
      await toWav(src, wav, { channels: 1, maxSeconds: MAX_SFX_SECONDS, trimSilence: true });
    } catch {
      throw new UserError(`Couldn't read the "${slot}" sound effect.`);
    }
    await run(RSTM, ["-noloop", wav, bcwav], { timeout: 60_000 });
    chunk += 8 + (await fs.stat(bcwav)).size;
    out.push([slot, bcwav]);
  }
  if (chunk >= MAX_SFX_CHUNK) {
    throw new UserError(
      `Sound effects add up to ${(chunk / 1024).toFixed(0)} KB; the 3DS allows ${(MAX_SFX_CHUNK / 1024).toFixed(0)} KB. ` +
        "Use shorter sounds or fewer of them.",
    );
  }
  return out;
}

/** Build a theme zip from the submitted FormData. */
export async function buildTheme(form) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "3ds-theme-"));
  try {
    if (!isFile(form.get("top"))) throw new UserError("Missing image: top screen");
    if (!isFile(form.get("bottom"))) throw new UserError("Missing image: bottom screen");
    if (!isFile(form.get("icon"))) throw new UserError("Missing image: icon");
    await savePng(form.get("top"), path.join(dir, "top.png"), "Top screen");
    await savePng(form.get("bottom"), path.join(dir, "bottom.png"), "Bottom screen");
    await savePng(form.get("icon"), path.join(dir, "icon.png"), "Icon");
    const hasSmall = await savePng(form.get("smallicon"), path.join(dir, "smallicon.png"), "Small icon");
    const hasPreview = await savePng(form.get("preview"), path.join(dir, "preview.png"), "Preview");

    const textureLines = [];
    for (const key of OPTIONAL_TEXTURES) {
      if (await savePng(form.get(key), path.join(dir, `${key}.png`), key)) {
        textureLines.push(`${key}.image = ${key}.png`);
      }
    }

    const colorLines = parseColors(form.get("colors"));
    const music = form.get("music");
    const bgm = isFile(music) ? await buildMusic(music, dir, form) : null;
    const sfx = await buildSfx(form, dir);

    const title = cleanText(form.get("title"), 64, "My Theme");
    const rc = [
      "[info]",
      `shorttitle = ${title}`,
      `longtitle = ${cleanText(form.get("description"), 128, title)}`,
      `publisher = ${cleanText(form.get("author"), 64, "Anonymous")}`,
      "icon = icon.png",
      hasSmall ? "smallicon = smallicon.png" : "",
      "",
      "[frames]",
      "top.type = texture",
      `top.frame = ${oneOf(form.get("topFrame"), TOP_FRAMES, "single")}`,
      "bottom.type = texture",
      `bottom.frame = ${oneOf(form.get("bottomFrame"), BOTTOM_FRAMES, "single")}`,
      "",
      "[textures]",
      "top.image = top.png",
      "bottom.image = bottom.png",
      ...textureLines,
      "",
      "[colors]",
      ...colorLines,
      "",
      "[flags]",
      form.get("hideGameText") === "true" ? "gametext.hidden = 1" : "",
      "",
      "[audio]",
      bgm ? "bgm = bgm.bcstm" : "",
      ...sfx.map(([slot, file]) => `sfx.${slot} = ${path.basename(file)}`),
      "",
    ].join("\n");
    await fs.writeFile(path.join(dir, "theme.rc"), rc);

    const zipPath = path.join(dir, "out", "theme.zip");
    await fs.mkdir(path.dirname(zipPath));
    // Images arrive already quantized/dithered for RGB565, so skip kame's dither.
    let stdout;
    try {
      ({ stdout } = await run(
        KAME, ["make3dstheme", "-c", path.join(dir, "theme.rc"), "-o", zipPath, "-nd", "1"],
        { timeout: 60_000 },
      ));
    } catch (err) {
      stdout = `${err.stdout || ""}${err.stderr || ""}`;
      if (!/ERROR/i.test(stdout)) throw err;
    }
    if (/ERROR/i.test(stdout)) {
      console.error(stdout);
      throw new UserError(stdout.match(/ERROR:?\s*(.*)/i)?.[1]?.trim() || "kame-tools reported an error");
    }
    if (hasPreview) await run("zip", ["-j", "-q", zipPath, path.join(dir, "preview.png")]);
    return { zip: await fs.readFile(zipPath), title };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
