"use client";
import { useEffect, useRef } from "react";
import { IconPlayerPlayFilled, IconPlayerStopFilled } from "@tabler/icons-react";
import { useOpeningDemo, CLOSE_MS, OPEN_MS, PAGES, COLS } from "@/lib/opening-demo";

const SCREEN_W = { top: 412, bottom: 320 };
const SCROLL_SPEED = { slowscroll: 12, fastscroll: 40, bouncescroll: 30 }; // px/s

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

/**
 * Draws the RGB565 outputs into the device screens. Scroll modes play on their
 * own, except during the opening demo, when `scrollRef` (0..1 across the app
 * pages) drives them like swiping the grid does on the console.
 */
function useScreen(canvasRef, out, frame, w, scrollRef) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let x = 0, v = 0, last = 0;
    const draw = (t) => {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0);
      last = t;
      const span = out ? out.width - w : 0;
      const target = scrollRef.current;
      if (target == null || frame === "single") {
        x = windowOffset(frame, span, t);
        v = 0;
      } else {
        const goal = target * span * (frame === "slowscroll" ? 0.5 : 1);
        // Springy for "bounces", smooth for the rest.
        const [k, damp] = frame === "bouncescroll" ? [90, 7] : frame === "fastscroll" ? [60, 16] : [25, 10];
        v += ((goal - x) * k - v * damp) * dt;
        x += v * dt;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (out) ctx.drawImage(out, Math.round(Math.min(span, Math.max(0, x))), 0, w, 240, 0, 0, w, 240);
      if (frame !== "single") raf = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, out, frame, w, scrollRef]);
}

export default function Preview({
  outputs, topFrame, bottomFrame, overlayVars, hideGameText, title, author,
  showHomeMenu, setShowHomeMenu, dither, setDither, music, sfx,
}) {
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  const iconRef = useRef(null);
  const scrollRef = useRef(null);
  const demo = useOpeningDemo({ music, sfx });
  scrollRef.current = demo.playing ? demo.page / (PAGES - 1) : null;
  useScreen(topRef, outputs.top, topFrame, SCREEN_W.top, scrollRef);
  useScreen(bottomRef, outputs.bottom, bottomFrame, SCREEN_W.bottom, scrollRef);

  const lidShut = demo.phase === "closed";
  const screensOn = !demo.playing || demo.phase === "on";
  const overlay = showHomeMenu || demo.playing;
  const lidStyle = {
    transformOrigin: "50% 100%",
    transformStyle: "preserve-3d",
    transform: lidShut ? "rotateX(-180deg)" : "rotateX(0deg)",
    transition: `transform ${lidShut ? CLOSE_MS : OPEN_MS}ms ${lidShut ? "cubic-bezier(.5,0,.75,0)" : "cubic-bezier(.15,.75,.25,1)"}`,
  };

  // Esc stops the demo.
  useEffect(() => {
    if (!demo.playing) return;
    const onKey = (e) => e.key === "Escape" && demo.stop();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demo.playing, demo.stop]);

  useEffect(() => {
    const ctx = iconRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 48, 48);
    if (outputs.icon) ctx.drawImage(outputs.icon, 0, 0);
  }, [outputs.icon]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-[420px]" style={{ ...overlayVars, perspective: "1600px", perspectiveOrigin: "50% 45%" }}>
        {/* Top half: a hinged lid with a front (screen) and a back (shell) */}
        <div className="relative z-20" style={lidStyle}>
        <div className="relative rounded-t-[22px] rounded-b-md border border-black bg-neutral-800 px-5 pb-5 pt-7 shadow-2xl shadow-black/50 [backface-visibility:hidden]">
          <TopBezel />
          <div className="relative aspect-[412/240] overflow-hidden rounded-[3px] bg-black ring-[3px] ring-black">
            <canvas ref={topRef} width={412} height={240} className="block h-full w-full" />
            {overlay && (
              <div className="pointer-events-none absolute inset-0 text-[11px] font-semibold" aria-hidden>
                <div className="flex items-center gap-1.5 px-[2.5%] py-[2%] text-white [text-shadow:0_1px_2px_rgb(0_0_0/.6)]">
                  <span className="h-3.5 w-[9%] rounded bg-[var(--hm-topcorner)] opacity-90" />
                  <span className="ml-auto">12:00</span>
                  <span className="h-2.5 w-[18px] rounded-sm border-[1.5px] border-white bg-[linear-gradient(90deg,#6f6_70%,transparent_70%)]" />
                  <span className="h-3.5 w-[9%] rounded bg-[var(--hm-topcorner)] opacity-90" />
                </div>
                {!hideGameText && (
                  <div
                    key={demo.playing ? `${demo.page}-${demo.cursor}` : "still"}
                    className={`absolute bottom-[8%] left-1/2 -translate-x-1/2 rounded-full bg-[var(--hm-bubble)] px-3 py-1.5 text-[var(--hm-bubble-text)] shadow-lg ${demo.playing ? "animate-[hm-bubble_250ms_ease-out]" : ""}`}
                  >
                    {demo.playing ? DEMO_GAMES[(demo.page * COLS + demo.cursor) % DEMO_GAMES.length] : "Game Title"}
                  </div>
                )}
              </div>
            )}
            <PowerFade on={screensOn} />
          </div>
        </div>
        <div
          className="absolute inset-0 rounded-b-[22px] rounded-t-md border border-black bg-[radial-gradient(ellipse_at_50%_60%,#4a4a4a,#262626)] shadow-inner [backface-visibility:hidden] [transform:rotateX(180deg)]"
          aria-hidden
        >
          <span className="absolute bottom-[38%] left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-neutral-900 ring-2 ring-neutral-600" />
        </div>
        </div>
        <div className="mx-4 flex h-2.5 items-center justify-end gap-1.5 rounded-b-md bg-black pr-6" aria-hidden>
          <span className={`h-1 w-1 rounded-full transition-colors ${lidShut || demo.phase === "opening" ? "animate-pulse bg-sky-300" : "bg-sky-400"} shadow-[0_0_4px_1px_rgba(56,189,248,0.8)]`} />
          <span className="h-1 w-1 rounded-full bg-neutral-700" />
          <span className="h-1 w-1 rounded-full bg-amber-400/80 shadow-[0_0_4px_1px_rgba(251,191,36,0.5)]" />
        </div>
        {/* Bottom half */}
        <div className="relative rounded-b-[26px] rounded-t-md border border-black bg-neutral-800 px-14 pb-12 pt-5 shadow-2xl shadow-black/50">
          <BottomControls />
          <div className="relative aspect-[4/3] overflow-hidden rounded-[3px] bg-black ring-[3px] ring-black">
            <canvas ref={bottomRef} width={320} height={240} className="block h-full w-full" />
            {overlay && <BottomOverlay demo={demo.playing ? demo : null} />}
            <PowerFade on={screensOn} />
          </div>
        </div>
      </div>

      <button
        type="button" onClick={demo.playing ? demo.stop : demo.start}
        className={`inline-flex w-full max-w-[420px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition ${
          demo.playing
            ? "border border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-neutral-500"
            : "bg-accent-500 text-white shadow-lg shadow-accent-500/20 hover:bg-accent-400"
        }`}
      >
        {demo.playing ? <><IconPlayerStopFilled size={16} /> Stop</> : <><IconPlayerPlayFilled size={16} /> Play the opening</>}
      </button>
      {demo.playing && (
        <p className="-mt-2 max-w-[420px] text-center text-xs text-neutral-500">
          {music?.file ? "Playing your music clip on a loop." : "No music added, so this runs silently."} Press Esc or Stop to end.
        </p>
      )}

      <div className="flex w-full max-w-[420px] items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 px-4 py-3">
        <canvas ref={iconRef} width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg bg-neutral-800" aria-label="Theme icon" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-100">{title || "My Theme"}</p>
          <p className="truncate text-sm text-neutral-500">{author || "Anonymous"}</p>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-neutral-300">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showHomeMenu} onChange={(e) => setShowHomeMenu(e.target.checked)} />
          Show Home Menu
        </label>
        <label className="flex items-center gap-2" title="The 3DS screens show 16-bit colour. Dithering hides banding in gradients and skies.">
          <input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} />
          Smooth gradients (dither)
        </label>
      </div>
      <p className="max-w-[420px] text-center text-xs text-neutral-500">
        The preview shows the exact pixels and 16-bit colours the 3DS will display. The Home Menu overlay is only an approximation.
      </p>
    </div>
  );
}

const DEMO_GAMES = ["Settings", "Shop", "Camera", "Sound", "Browser", "Notes", "Friends", "Activity Log",
  "Puzzle Quest", "Kart Racer", "Space Blaster", "Farm Days"];

/** Black cover over a screen that fades away when the screen turns on. */
function PowerFade({ on }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-black transition-opacity ease-out"
      style={{ opacity: on ? 0 : 1, transitionDuration: on ? "400ms" : "0ms" }}
      aria-hidden
    />
  );
}

function BottomOverlay({ demo }) {
  const cursor = demo ? demo.cursor : 0;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[11px] font-semibold" aria-hidden>
      <div className="flex h-[11%] items-center justify-between px-[3%]">
        <span className="h-[70%] w-[13%] rounded-[5px] bg-[var(--hm-corner)] shadow" />
        <span className="h-[70%] w-[13%] rounded-[5px] bg-[var(--hm-corner)] shadow" />
      </div>
      <div className="flex flex-1 items-center overflow-hidden">
        <Arrow side="left" />
        <div
          key={demo ? `${demo.phase}-${demo.page}` : "still"}
          className="grid flex-1 self-stretch grid-cols-5 grid-rows-3 gap-[5%] px-[4%] py-[3%]"
          style={demo?.moved
            ? { animation: `${demo.dir > 0 ? "hm-page-next" : "hm-page-prev"} 380ms cubic-bezier(.2,.8,.2,1)` }
            : undefined}
        >
          {Array.from({ length: 15 }, (_, i) => (
            <span
              key={i}
              className="rounded-[12%] bg-[linear-gradient(var(--hm-tile-light),var(--hm-tile)_55%,var(--hm-tile-dark))] shadow-[0_1px_3px_rgb(0_0_0/.35)] transition-[outline-color,box-shadow] duration-150"
              style={{
                ...(i === cursor ? { outline: "2px solid var(--hm-cursor)", outlineOffset: 1, boxShadow: "0 0 8px 2px var(--hm-cursor-glow)" } : null),
                ...(demo?.phase === "on" && !demo.moved
                  ? { animation: `hm-pop 420ms ${i * 35}ms cubic-bezier(.3,1.5,.5,1) backwards` }
                  : null),
              }}
            />
          ))}
        </div>
        <Arrow side="right" />
      </div>
      <div className="flex h-[13%] items-center justify-center bg-[linear-gradient(var(--hm-bar-light),var(--hm-bar))] text-[var(--hm-bar-text)]">
        Open
      </div>
    </div>
  );
}

function Arrow({ side }) {
  const left = side === "left";
  return (
    <span className={`relative h-[30%] w-[5%] bg-[var(--hm-arrowbtn)] shadow ${left ? "rounded-r-md" : "rounded-l-md"}`}>
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-transparent"
        style={left ? { borderRightColor: "var(--hm-arrow)", marginLeft: -2 } : { borderLeftColor: "var(--hm-arrow)", marginLeft: 2 }}
      />
    </span>
  );
}

// ---- Decorative 3DS hardware --------------------------------------------------

function TopBezel() {
  return (
    <div aria-hidden>
      <SpeakerGrille className="left-6 top-2.5" />
      <span className="absolute left-1/2 top-2.5 h-2 w-2 -translate-x-1/2 rounded-full bg-neutral-950 ring-2 ring-neutral-700">
        <span className="absolute left-[2px] top-[2px] h-[3px] w-[3px] rounded-full bg-indigo-400/50" />
      </span>
      <SpeakerGrille className="right-6 top-2.5" />
      {/* 3D depth slider */}
      <span className="absolute right-[7px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-1">
        <span className="text-[7px] font-bold leading-none text-neutral-500">3D</span>
        <span className="relative block h-16 w-1.5 rounded-full bg-neutral-950">
          <span className="fake-btn absolute left-1/2 top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-sm bg-neutral-400" />
        </span>
      </span>
    </div>
  );
}

function SpeakerGrille({ className }) {
  return (
    <span className={`absolute grid grid-cols-3 gap-[3px] ${className}`}>
      {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-[3px] w-[3px] rounded-full bg-neutral-950" />)}
    </span>
  );
}

function BottomControls() {
  return (
    <div aria-hidden>
      {/* Circle Pad */}
      <span className="fake-btn absolute left-[11px] top-6 grid h-[34px] w-[34px] place-items-center rounded-full bg-neutral-950 shadow-inner">
        <span className="h-[26px] w-[26px] rounded-full bg-gradient-to-b from-neutral-500 to-neutral-700 shadow-[0_2px_3px_rgba(0,0,0,0.6)]" />
      </span>
      {/* D-pad */}
      <span className="absolute left-[12px] top-[104px] h-8 w-8">
        <span className="fake-btn absolute left-1/2 top-0 h-full w-[11px] -translate-x-1/2 rounded-[2px] bg-neutral-950" />
        <span className="fake-btn absolute left-0 top-1/2 h-[11px] w-full -translate-y-1/2 rounded-[2px] bg-neutral-950" />
      </span>
      {/* ABXY */}
      <span className="absolute right-[9px] top-6 h-[40px] w-[40px] text-[7px] font-bold text-neutral-400">
        <FaceButton label="X" className="left-1/2 top-0 -translate-x-1/2" />
        <FaceButton label="Y" className="left-0 top-1/2 -translate-y-1/2" />
        <FaceButton label="A" className="right-0 top-1/2 -translate-y-1/2" />
        <FaceButton label="B" className="bottom-0 left-1/2 -translate-x-1/2" />
      </span>
      {/* Power */}
      <span className="fake-btn absolute bottom-14 right-[22px] h-3 w-3 rounded-full bg-neutral-950 ring-1 ring-neutral-600">
        <span className="absolute inset-[3px] rounded-full border border-sky-400/70" />
      </span>
      {/* Select / HOME / Start */}
      <span className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-5 text-[7px] font-semibold uppercase tracking-wider text-neutral-500">
        <span className="flex flex-col items-center gap-1"><span className="fake-btn h-1.5 w-7 rounded-full bg-neutral-950" />Select</span>
        <span className="flex flex-col items-center gap-1"><span className="fake-btn h-2 w-9 rounded-full bg-neutral-950 ring-1 ring-neutral-600" />Home</span>
        <span className="flex flex-col items-center gap-1"><span className="fake-btn h-1.5 w-7 rounded-full bg-neutral-950" />Start</span>
      </span>
      {/* Mic */}
      <span className="absolute bottom-[18px] right-[34px] h-1 w-1 rounded-full bg-neutral-950" />
    </div>
  );
}

function FaceButton({ label, className }) {
  return (
    <span className={`fake-btn absolute grid h-[13px] w-[13px] place-items-center rounded-full bg-neutral-950 shadow-[0_1px_2px_rgba(0,0,0,0.7)] ${className}`}>
      {label}
    </span>
  );
}
