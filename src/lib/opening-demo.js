"use client";
// "Open the 3DS" demo for the preview: the lid shuts, opens again with the
// lid sound, the screens wake, the theme music starts, and the cursor walks
// the app grid (cursor and scrolling sounds) so scrolling backgrounds move
// the way they do on the console.
import { useCallback, useEffect, useRef, useState } from "react";
import { clipRange } from "@/lib/limits";

export const CLOSE_MS = 450;
export const OPEN_MS = 1100;
const HOLD_MS = 450;         // lid stays shut for a moment
const WAKE_MS = 400;         // screens fade on
const WALK_DELAY_MS = 1600;  // after waking, before the cursor starts moving
const STEP_MS = 1000;        // one cursor move
export const PAGES = 4;
export const COLS = 5;

// phase: "idle" | "closed" | "opening" | "on"
export function useOpeningDemo({ music, sfx }) {
  const [phase, setPhase] = useState("idle");
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);
  const [moved, setMoved] = useState(false);
  const run = useRef(null);
  const latest = useRef({ music, sfx });
  latest.current = { music, sfx };

  const stop = useCallback(() => {
    const r = run.current;
    if (!r) return;
    r.alive = false;
    r.timers.forEach(clearTimeout);
    clearInterval(r.interval);
    cancelAnimationFrame(r.raf);
    if (r.audio) {
      r.audio.pause();
      r.audio.removeAttribute("src");
    }
    if (r.url) URL.revokeObjectURL(r.url);
    run.current = null;
    setPhase("idle");
    setCursor(0);
    setPage(0);
    setDir(1);
    setMoved(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    stop();
    const { music, sfx } = latest.current;
    const r = { timers: [], alive: true };
    run.current = r;
    const at = (ms, fn) => r.timers.push(setTimeout(() => r.alive && fn(), ms));
    const sound = (slot) => {
      const url = sfx?.[slot]?.url;
      if (!url) return;
      const a = new Audio(url);
      a.volume = 0.8;
      a.play().catch(() => {});
    };

    // Create the player inside the click so the browser allows it to play.
    if (music?.file) {
      r.url = URL.createObjectURL(music.file);
      r.audio = new Audio(r.url);
      r.audio.preload = "auto";
    }

    setPhase("closed");
    const openAt = CLOSE_MS + HOLD_MS;
    at(openAt, () => { setPhase("opening"); sound("openlid"); });
    at(openAt + OPEN_MS, () => { setPhase("on"); if (r.audio) playLoop(r, music); });
    at(openAt + OPEN_MS + WAKE_MS + WALK_DELAY_MS, () => {
      // Walk along the top row; at its end, swipe to the next page (ping-pong).
      let col = 0, pg = 0, step = 1;
      r.interval = setInterval(() => {
        setMoved(true);
        if (col < COLS - 1) {
          col += 1;
          setCursor(col);
          sound("cursor");
          return;
        }
        if (pg + step < 0 || pg + step >= PAGES) step = -step;
        pg += step;
        col = 0;
        setDir(step);
        setPage(pg);
        setCursor(0);
        sound(`frame${pg % 3}`);
      }, STEP_MS);
    });
  }, [stop]);

  return { phase, cursor, page, dir, moved, playing: phase !== "idle", start, stop };
}

/** Loop the chosen clip like the console does, with its fade-out at the end. */
function playLoop(r, music) {
  const a = r.audio;
  const { start, end } = clipRange(music);
  const fade = Math.max(0, Number(music.fade) || 0);
  const begin = () => {
    a.currentTime = start;
    a.play().catch(() => {});
    const tick = () => {
      if (!r.alive) return;
      const stopAt = end > start ? end : a.duration || Infinity;
      if (a.currentTime >= stopAt - 0.03 || a.ended) {
        a.currentTime = start;
        if (a.paused) a.play().catch(() => {});
      }
      a.volume = fade > 0 && Number.isFinite(stopAt) ? Math.min(1, Math.max(0, (stopAt - a.currentTime) / fade)) : 1;
      r.raf = requestAnimationFrame(tick);
    };
    tick();
  };
  if (a.readyState >= 1) begin();
  else a.addEventListener("loadedmetadata", begin, { once: true });
}
