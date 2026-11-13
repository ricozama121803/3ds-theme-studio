"use client";
import { useRef } from "react";
import { IconPlayerPlay, IconUpload, IconX } from "@tabler/icons-react";
import { IconButton } from "@/components/Cropper";
import Meter from "@/components/Meter";
import { MAX_SFX_CHUNK, MAX_SFX_SECONDS, estimateSfxBytes } from "@/lib/limits";

export const SFX_SLOTS = [
  ["cursor", "Moving the cursor"],
  ["launch", "Opening an app"],
  ["folder", "Opening a folder"],
  ["close", "Closing an app"],
  ["frame0", "Scrolling (1)"],
  ["frame1", "Scrolling (2)"],
  ["frame2", "Scrolling (3)"],
  ["openlid", "Opening the lid"],
];
const SLOT_IDS = SFX_SLOTS.map(([id]) => id);

export const sfxBytes = (sfx) => estimateSfxBytes(sfx, SLOT_IDS);
export const sfxOverLimit = (sfx) => Object.keys(sfx).length > 0 && sfxBytes(sfx) >= MAX_SFX_CHUNK;

/** sfx: { [slot]: { file, duration, url } } */
export default function SfxPanel({ sfx, setSfx }) {
  const count = Object.keys(sfx).length;
  const bytes = sfxBytes(sfx);
  const kb = (b) => (b / 1024).toFixed(0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Short sounds for Home Menu actions. Each is trimmed to its first {MAX_SFX_SECONDS} seconds and converted to mono.
        All of them together must fit in about {kb(MAX_SFX_CHUNK)} KB, roughly 10 seconds in total.
      </p>
      <div className="grid gap-2">
        {SFX_SLOTS.map(([slot, label]) => (
          <SfxRow key={slot} slot={slot} label={label} value={sfx[slot]} setSfx={setSfx} />
        ))}
      </div>
      <Meter
        ratio={count ? bytes / MAX_SFX_CHUNK : 0}
        text={!count
          ? "No sound effects added."
          : bytes >= MAX_SFX_CHUNK
            ? `Too much: about ${kb(bytes)} KB of ${kb(MAX_SFX_CHUNK)} KB. Use shorter sounds or fewer of them.`
            : `About ${kb(bytes)} KB of ${kb(MAX_SFX_CHUNK)} KB used.`}
      />
    </div>
  );
}

function SfxRow({ slot, label, value, setSfx }) {
  const inputRef = useRef(null);
  const audioRef = useRef(null);

  const pick = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = new Audio(url);
    a.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(a.duration) ? a.duration : MAX_SFX_SECONDS;
      setSfx((prev) => {
        if (prev[slot]?.url) URL.revokeObjectURL(prev[slot].url);
        return { ...prev, [slot]: { file, duration, url } };
      });
    }, { once: true });
    a.addEventListener("error", () => alert(`Couldn't read "${file.name}" as audio.`), { once: true });
  };

  const remove = () => setSfx((prev) => {
    const next = { ...prev };
    if (next[slot]?.url) URL.revokeObjectURL(next[slot].url);
    delete next[slot];
    return next;
  });

  const play = () => {
    if (!value) return;
    const a = audioRef.current ?? (audioRef.current = new Audio());
    a.src = value.url;
    a.currentTime = 0;
    a.play();
    setTimeout(() => a.pause(), MAX_SFX_SECONDS * 1000);
  };

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-neutral-800 px-3 py-2 sm:grid-cols-[10rem_1fr_auto]">
      <span className="text-sm font-medium text-neutral-200">{label}</span>
      <span className="col-span-2 row-start-2 truncate text-xs text-neutral-500 sm:col-span-1 sm:row-start-1">
        {value
          ? `${value.file.name} · ${Math.min(value.duration, MAX_SFX_SECONDS).toFixed(1)} s${value.duration > MAX_SFX_SECONDS ? " (trimmed)" : ""}`
          : "None"}
      </span>
      <span className="flex gap-1.5">
        {value && <IconButton label="Play" onClick={play}><IconPlayerPlay size={14} /></IconButton>}
        <IconButton label={value ? "Replace" : "Choose"} onClick={() => inputRef.current?.click()}>
          <IconUpload size={14} /> {value ? "Replace" : "Choose"}
        </IconButton>
        {value && <IconButton label="Remove" onClick={remove}><IconX size={14} /></IconButton>}
      </span>
      <input
        ref={inputRef} type="file" accept="audio/*" hidden data-slot={slot}
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
