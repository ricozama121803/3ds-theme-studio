"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { Spotlight } from "@/components/ui/spotlight-new";
import StepCard, { Hint } from "@/components/StepCard";
import Cropper from "@/components/Cropper";
import Preview from "@/components/Preview";
import MusicPanel from "@/components/MusicPanel";
import ColorsPanel, { initialColorState, resolveColor } from "@/components/ColorsPanel";
import SfxPanel, { sfxOverLimit } from "@/components/SfxPanel";
import BuildPanel from "@/components/BuildPanel";
import Footer from "@/components/Footer";
import { coverCrop, renderCrop } from "@/lib/crop";
import { to565Canvas, padCanvas, makeCanvas, extractPalette } from "@/lib/imaging";
import { toConfig, paletteFromImages } from "@/lib/colors";
import { clipRange, musicOverLimit } from "@/lib/limits";

const SCREEN_H = 240;
const SCROLL_W = 1008;      // visible width of a scrolling background
const TEX_H = 256;
const TEXTURES = {
  filelarge: { w: 64, h: 128, k: 2, label: "Large tile" },
  filesmall: { w: 32, h: 64, k: 4, label: "Small tile" },
  folderopen: { w: 128, h: 64, k: 2, label: "Folder (open)" },
  folderclose: { w: 128, h: 64, k: 2, label: "Folder (closed)" },
};
// kame-tools has one on/off flag per pair: setting only one leaves its partner
// solid black on the console, so the missing one reuses the same picture.
const TEXTURE_PAIRS = [["filelarge", "filesmall"], ["folderopen", "folderclose"]];

const TOP_FRAMES = [["single", "Still"], ["slowscroll", "Scrolls slowly"], ["fastscroll", "Scrolls quickly"]];
const BOTTOM_FRAMES = [["single", "Still"], ["pagescroll", "Moves page by page"], ["slowscroll", "Scrolls slowly"], ["fastscroll", "Scrolls quickly"], ["bouncescroll", "Bounces"]];

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

export default function Studio() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [topFrame, setTopFrame] = useState("single");
  const [bottomFrame, setBottomFrame] = useState("single");
  const [top, setTop] = useState(null);
  const [bottom, setBottom] = useState(null);
  const [icon, setIcon] = useState(null);
  const [textures, setTextures] = useState({});
  const [dither, setDither] = useState(true);
  const [showHomeMenu, setShowHomeMenu] = useState(true);
  const [music, setMusic] = useState(null);
  const [sfx, setSfx] = useState({});
  const [colors, setColors] = useState(initialColorState);
  const [hideGameText, setHideGameText] = useState(false);
  const [outputs, setOutputs] = useState({});
  const [building, setBuilding] = useState(false);
  const [built, setBuilt] = useState(null);
  const [status, setStatus] = useState({ text: "", kind: "" });

  const topW = topFrame === "single" ? 412 : SCROLL_W;
  const bottomW = bottomFrame === "single" ? 320 : SCROLL_W;

  // Re-fit crops when a scrolling mode changes the canvas width.
  useEffect(() => { setTop((c) => (c?.img ? coverCrop(c.img, topW, SCREEN_H, c) : c)); }, [topW]);
  useEffect(() => { setBottom((c) => (c?.img ? coverCrop(c.img, bottomW, SCREEN_H, c) : c)); }, [bottomW]);

  // The icon follows the top image until the user picks their own.
  useEffect(() => {
    if (!top?.img) return;
    setIcon((c) => (c?.userImage || c?.img === top.img ? c : coverCrop(top.img, 48, 48)));
  }, [top?.img]);

  // Outputs: exactly the pixels the 3DS will show (RGB565, optional dithering).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setOutputs({
        top: to565Canvas(renderCrop(top, topW, SCREEN_H), dither),
        bottom: to565Canvas(renderCrop(bottom, bottomW, SCREEN_H), dither),
        icon: icon?.img ? to565Canvas(renderCrop(icon, 48, 48), dither) : null,
        smallIcon: icon?.img ? to565Canvas(renderCrop(icon, 48, 48, 24, 24), dither) : null,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [top, bottom, icon, topW, bottomW, dither]);

  // Any change after a build makes that build stale.
  const builtRef = useRef(built);
  builtRef.current = built;
  useEffect(() => {
    if (!builtRef.current) return;
    setBuilt(null);
    setStatus({ text: "You changed something; build again to update the theme.", kind: "" });
  }, [title, author, description, topFrame, bottomFrame, top, bottom, icon, textures, dither, music, sfx, colors, hideGameText]);

  const overlayVars = useMemo(() => {
    const get = (id, f) => resolveColor(colors, id, f);
    return {
      "--hm-tile": get("filecolor", "main"), "--hm-tile-light": get("filecolor", "light"), "--hm-tile-dark": get("filecolor", "dark"),
      "--hm-cursor": get("cursorcolor", "main"), "--hm-cursor-glow": get("cursorcolor", "glow"),
      "--hm-bar": get("open", "main"), "--hm-bar-light": get("open", "light"), "--hm-bar-text": get("open", "textmain"),
      "--hm-arrowbtn": get("arrowbuttoncolor", "main"), "--hm-arrow": get("arrowcolor", "unpressed"),
      "--hm-corner": get("bottomcornerbuttoncolor", "main"), "--hm-topcorner": get("topcornerbuttoncolor", "main"),
      "--hm-bubble": get("gametext", "main"), "--hm-bubble-text": get("gametext", "textmain"),
    };
  }, [colors]);

  const autoColors = () => {
    const palette = paletteFromImages(top?.img ? extractPalette(top.img) : [], bottom?.img ? extractPalette(bottom.img) : []);
    if (!palette) return;
    setColors((prev) => {
      const next = { ...prev };
      for (const [id, { base, text }] of Object.entries(palette)) next[id] = { enabled: true, base, text, overrides: {} };
      return next;
    });
  };

  const textureOutputs = useCallback(() => {
    const out = {};
    for (const [a, b] of TEXTURE_PAIRS) {
      const [ca, cb] = [textures[a], textures[b]];
      if (!ca?.img && !cb?.img) continue;
      out[a] = ca?.img ? renderCrop(ca, TEXTURES[a].w, TEXTURES[a].h) : renderCrop(cb, TEXTURES[b].w, TEXTURES[b].h, TEXTURES[a].w, TEXTURES[a].h);
      out[b] = cb?.img ? renderCrop(cb, TEXTURES[b].w, TEXTURES[b].h) : renderCrop(ca, TEXTURES[a].w, TEXTURES[a].h, TEXTURES[b].w, TEXTURES[b].h);
    }
    return out;
  }, [textures]);

  const colorCount = Object.values(colors).filter((s) => s.enabled).length;
  const sfxCount = Object.keys(sfx).length;
  const texCount = Object.values(textures).filter((c) => c?.img).length;
  const musicTooLong = musicOverLimit(music);
  const sfxTooBig = sfxOverLimit(sfx);
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  const checklist = [
    { label: "Top screen image", state: top?.img ? "done" : "todo" },
    { label: "Bottom screen image", state: bottom?.img ? "done" : "todo" },
    { label: "Icon", state: icon?.img ? "done" : "todo" },
    { label: music ? (musicTooLong ? "Music is too long" : "Music") : "Music (optional)", state: music ? (musicTooLong ? "todo" : "done") : "optional" },
    { label: colorCount ? `${plural(colorCount, "colour group")} customised` : "Colours (optional)", state: colorCount ? "done" : "optional" },
    { label: sfxCount ? (sfxTooBig ? "Sound effects are too big" : plural(sfxCount, "sound effect")) : "Sound effects (optional)", state: sfxCount ? (sfxTooBig ? "todo" : "done") : "optional" },
    { label: texCount ? plural(texCount, "custom texture") : "Textures (optional)", state: texCount ? "done" : "optional" },
  ];
  const canBuild = !!(top?.img && bottom?.img && icon?.img) && !musicTooLong && !sfxTooBig;

  const build = async () => {
    setBuilding(true);
    setBuilt(null);
    setStatus({ text: music || sfxCount ? "Building… converting audio can take a few seconds." : "Building…", kind: "" });
    try {
      const texW = (frame) => (frame === "single" ? 512 : 1024);
      const preview = makeCanvas(412, 480);
      const pctx = preview.getContext("2d");
      pctx.fillStyle = "#000";
      pctx.fillRect(0, 0, 412, 480);
      pctx.drawImage(outputs.top, 0, 0, 412, 240, 0, 0, 412, 240);
      pctx.drawImage(outputs.bottom, 0, 0, 320, 240, 46, 240, 320, 240);

      const form = new FormData();
      form.append("title", title);
      form.append("author", author);
      form.append("description", description);
      form.append("topFrame", topFrame);
      form.append("bottomFrame", bottomFrame);
      form.append("colors", JSON.stringify(toConfig(colors)));
      form.append("hideGameText", String(hideGameText));
      form.append("top", await toBlob(padCanvas(outputs.top, texW(topFrame), TEX_H)), "top.png");
      form.append("bottom", await toBlob(padCanvas(outputs.bottom, texW(bottomFrame), TEX_H)), "bottom.png");
      form.append("icon", await toBlob(outputs.icon), "icon.png");
      form.append("smallicon", await toBlob(outputs.smallIcon), "smallicon.png");
      form.append("preview", await toBlob(preview), "preview.png");
      for (const [slot, canvas] of Object.entries(textureOutputs())) form.append(slot, await toBlob(canvas), `${slot}.png`);
      if (music) {
        const { start, end } = clipRange(music);
        form.append("music", music.file, music.file.name);
        form.append("start", String(start));
        form.append("end", String(end));
        form.append("mono", String(music.mono));
        form.append("fade", String(music.fade || 0));
      }
      for (const [slot, { file }] of Object.entries(sfx)) form.append(`sfx_${slot}`, file, file.name);

      const res = await fetch("/api/build", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Build failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const filename = decodeURIComponent(res.headers.get("X-Theme-Filename") || "theme.zip");
      setBuilt({ blob, filename });
      setStatus({ text: `Built ${filename} (${(blob.size / 1048576).toFixed(2)} MB).`, kind: "ok" });
    } catch (err) {
      setStatus({ text: err.message, kind: "error" });
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-neutral-900">
        <Spotlight />
        <BackgroundBeams />
        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pt-20">
          <h1 className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
            3DS Theme Studio
          </h1>
          <p className="mt-4 max-w-2xl text-base text-neutral-400 sm:text-lg">
            Make a custom Home Menu theme from your own pictures, colours, music and sounds. It previews pixel-exact,
            then installs straight onto your SD card.
          </p>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl items-start gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <StepCard n={1} title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Theme name" value={title} onChange={setTitle} placeholder="My Theme" id="title" />
              <Field label="Author" value={author} onChange={setAuthor} placeholder="Your name" id="author" />
            </div>
            <div className="mt-4">
              <Field label="Description" hint="(optional)" value={description} onChange={setDescription} placeholder="Shown in theme managers" maxLength={128} id="description" />
            </div>
          </StepCard>

          <StepCard n={2} title="Top screen" aside={topFrame === "single" ? "400 × 240" : `${SCROLL_W} × 240 (scrolling)`}>
            <FramePicker id="top-frame" value={topFrame} onChange={setTopFrame} options={TOP_FRAMES} />
            <div data-slot="top">
              <Cropper crop={top} onCrop={setTop} w={topW} h={SCREEN_H} editScale={topFrame === "single" ? 2 : 1} uploadTitle="Upload a top screen image" />
            </div>
          </StepCard>

          <StepCard n={3} title="Bottom screen" aside={bottomFrame === "single" ? "320 × 240" : `${SCROLL_W} × 240 (scrolling)`}>
            <FramePicker id="bottom-frame" value={bottomFrame} onChange={setBottomFrame} options={BOTTOM_FRAMES} />
            <div data-slot="bottom">
              <Cropper crop={bottom} onCrop={setBottom} w={bottomW} h={SCREEN_H} editScale={bottomFrame === "single" ? 2 : 1} uploadTitle="Upload a bottom screen image" />
            </div>
            <Hint className="mt-3">Your app icons sit on top of this screen. Keep “Show Home Menu” on in the preview to check.</Hint>
          </StepCard>

          <StepCard n={4} title="Theme icon" aside="48 × 48">
            <Hint className="mb-4">Shown in theme managers. It starts as a crop of your top screen; upload a different image if you like.</Hint>
            <div data-slot="icon">
              <Cropper crop={icon} onCrop={setIcon} w={48} h={48} editScale={4} pixelated compact uploadTitle="Upload an icon" />
            </div>
          </StepCard>

          <StepCard n={5} title={<>Music <span className="text-sm font-normal text-neutral-500">(optional)</span></>}>
            <MusicPanel music={music} setMusic={setMusic} />
          </StepCard>

          <StepCard n={6} title={<>Tiles &amp; colours <span className="text-sm font-normal text-neutral-500">(optional)</span></>}>
            <ColorsPanel
              state={colors} setState={setColors} hideGameText={hideGameText} setHideGameText={setHideGameText}
              onAuto={autoColors} canAuto={!!(top?.img || bottom?.img)}
            />
          </StepCard>

          <StepCard n={7} title={<>Sound effects <span className="text-sm font-normal text-neutral-500">(optional)</span></>}>
            <SfxPanel sfx={sfx} setSfx={setSfx} />
          </StepCard>

          <StepCard n={8} title="Tile & folder textures" badge="Experimental">
            <Hint className="mb-4">
              Use your own pictures for the app tiles and folder icons (full 24-bit colour). How each one is laid out on the console
              isn’t well documented, so check the result on your 3DS. Tiles and folders work in pairs: if you only set one, the other
              uses the same picture.
            </Hint>
            <div className="grid gap-5 sm:grid-cols-2">
              {Object.entries(TEXTURES).map(([slot, t]) => (
                <div key={slot} data-slot={slot}>
                  <h3 className="mb-2 flex gap-2 text-sm font-medium text-neutral-200">
                    {t.label} <span className="font-normal text-neutral-500">{t.w} × {t.h}</span>
                  </h3>
                  <Cropper
                    crop={textures[slot]} onCrop={(c) => setTextures((prev) => ({ ...prev, [slot]: c }))}
                    w={t.w} h={t.h} editScale={t.k} optional compact pixelated showQuality={false} uploadTitle="Choose"
                  />
                </div>
              ))}
            </div>
          </StepCard>

          <StepCard n={9} title="Build & install">
            <BuildPanel checklist={checklist} canBuild={canBuild} building={building} status={status} built={built} onBuild={build} />
          </StepCard>
        </div>

        <aside className="order-1 lg:sticky lg:top-6 lg:order-2" aria-label="Live preview">
          <Preview
            outputs={outputs} topFrame={topFrame} bottomFrame={bottomFrame} overlayVars={overlayVars}
            hideGameText={hideGameText} title={title.trim()} author={author.trim()}
            showHomeMenu={showHomeMenu} setShowHomeMenu={setShowHomeMenu} dither={dither} setDither={setDither}
          />
        </aside>
      </main>

      <Footer />
    </div>
  );
}

function Field({ label, hint, value, onChange, placeholder, maxLength = 64, id }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-300">
      <span>{label} {hint && <span className="font-normal text-neutral-500">{hint}</span>}</span>
      <input
        id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} autoComplete="off"
        className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 font-normal text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-accent-500"
      />
    </label>
  );
}

function FramePicker({ id, value, onChange, options }) {
  return (
    <label className="mb-4 flex items-center gap-3 text-sm text-neutral-400">
      Background
      <select
        id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-accent-500"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
