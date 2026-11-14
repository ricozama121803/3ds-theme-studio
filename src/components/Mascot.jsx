"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The favicon (red top screen, blue bottom screen) brought to life: it floats,
// blinks, and its pupils follow the pointer.
const EYES = [
  { cx: 11.5, cy: 8.4 },
  { cx: 20.5, cy: 8.4 },
];

export default function Mascot({ className }) {
  const ref = useRef(null);
  const [look, setLook] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.27);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 220); // pupils drift further the further away you point
      setLook({ x: (dx / d) * 0.9 * reach, y: (dy / d) * 0.9 * reach });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div ref={ref} className={cn("mascot relative select-none", className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="mascot-body h-full w-full overflow-visible drop-shadow-[0_12px_30px_rgba(255,77,99,0.25)]">
        {/* bottom screen */}
        <rect x="6" y="17" width="20" height="13" rx="3" fill="#4f8cff" />
        <rect x="7.2" y="18.2" width="17.6" height="10.6" rx="2" fill="#6aa0ff" opacity="0.35" />
        {/* hinge */}
        <rect x="9" y="15" width="14" height="2" rx="1" fill="#2a2f45" />
        {/* top screen */}
        <g className="mascot-lid">
          <rect x="3" y="2" width="26" height="13" rx="3" fill="#ff4d63" />
          <rect x="4.2" y="3.2" width="23.6" height="10.6" rx="2" fill="#ff7184" opacity="0.35" />
          {EYES.map((e, i) => (
            <g key={i} className="mascot-eye" style={{ transformOrigin: `${e.cx}px ${e.cy}px` }}>
              <ellipse cx={e.cx} cy={e.cy} rx="2.7" ry="3.1" fill="#fff" />
              <circle cx={e.cx + look.x} cy={e.cy + look.y} r="1.45" fill="#14141c" />
              <circle cx={e.cx + look.x + 0.5} cy={e.cy + look.y - 0.55} r="0.45" fill="#fff" />
            </g>
          ))}
        </g>
      </svg>
      <div className="mascot-shadow mx-auto mt-2 h-2 w-2/3 rounded-[50%] bg-black/60 blur-[3px]" />
    </div>
  );
}
