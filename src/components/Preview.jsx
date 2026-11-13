"use client";
import { useEffect, useRef } from "react";

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

/** Draws the RGB565 outputs into the device screens, animating scroll modes. */
function useScreen(canvasRef, out, frame, w) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    const draw = (t) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (out) ctx.drawImage(out, Math.round(windowOffset(frame, out.width - w, t)), 0, w, 240, 0, 0, w, 240);
      if (frame !== "single") raf = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, out, frame, w]);
}

export default function Preview({
  outputs, topFrame, bottomFrame, overlayVars, hideGameText, title, author,
  showHomeMenu, setShowHomeMenu, dither, setDither,
}) {
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  const iconRef = useRef(null);
  useScreen(topRef, outputs.top, topFrame, SCREEN_W.top);
  useScreen(bottomRef, outputs.bottom, bottomFrame, SCREEN_W.bottom);

  useEffect(() => {
    const ctx = iconRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 48, 48);
    if (outputs.icon) ctx.drawImage(outputs.icon, 0, 0);
  }, [outputs.icon]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-[420px]" style={overlayVars}>
        {/* Top half */}
        <div className="rounded-t-[22px] rounded-b-md border border-black bg-neutral-800 px-5 pb-5 pt-4 shadow-2xl shadow-black/50">
          <div className="relative aspect-[412/240] overflow-hidden rounded-[3px] bg-black ring-[3px] ring-black">
            <canvas ref={topRef} width={412} height={240} className="block h-full w-full" />
            {showHomeMenu && (
              <div className="pointer-events-none absolute inset-0 text-[11px] font-semibold" aria-hidden>
                <div className="flex items-center gap-1.5 px-[2.5%] py-[2%] text-white [text-shadow:0_1px_2px_rgb(0_0_0/.6)]">
                  <span className="h-3.5 w-[9%] rounded bg-[var(--hm-topcorner)] opacity-90" />
                  <span className="ml-auto">12:00</span>
                  <span className="h-2.5 w-[18px] rounded-sm border-[1.5px] border-white bg-[linear-gradient(90deg,#6f6_70%,transparent_70%)]" />
                  <span className="h-3.5 w-[9%] rounded bg-[var(--hm-topcorner)] opacity-90" />
                </div>
                {!hideGameText && (
                  <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 rounded-full bg-[var(--hm-bubble)] px-3 py-1.5 text-[var(--hm-bubble-text)] shadow-lg">
                    Game Title
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="mx-4 h-2.5 rounded-b-md bg-black" />
        {/* Bottom half */}
        <div className="rounded-b-[26px] rounded-t-md border border-black bg-neutral-800 px-14 pb-8 pt-5 shadow-2xl shadow-black/50">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[3px] bg-black ring-[3px] ring-black">
            <canvas ref={bottomRef} width={320} height={240} className="block h-full w-full" />
            {showHomeMenu && <BottomOverlay />}
          </div>
        </div>
      </div>

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

function BottomOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-[11px] font-semibold" aria-hidden>
      <div className="flex h-[11%] items-center justify-between px-[3%]">
        <span className="h-[70%] w-[13%] rounded-[5px] bg-[var(--hm-corner)] shadow" />
        <span className="h-[70%] w-[13%] rounded-[5px] bg-[var(--hm-corner)] shadow" />
      </div>
      <div className="flex flex-1 items-center">
        <Arrow side="left" />
        <div className="grid flex-1 self-stretch grid-cols-5 grid-rows-3 gap-[5%] px-[4%] py-[3%]">
          {Array.from({ length: 15 }, (_, i) => (
            <span
              key={i}
              className="rounded-[12%] bg-[linear-gradient(var(--hm-tile-light),var(--hm-tile)_55%,var(--hm-tile-dark))] shadow-[0_1px_3px_rgb(0_0_0/.35)]"
              style={i === 0 ? { outline: "2px solid var(--hm-cursor)", outlineOffset: 1, boxShadow: "0 0 8px 2px var(--hm-cursor-glow)" } : undefined}
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
