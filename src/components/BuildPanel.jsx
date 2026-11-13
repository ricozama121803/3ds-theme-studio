"use client";
import { useEffect, useState } from "react";
import { IconCheck, IconCircle, IconMinus, IconDeviceSdCard, IconDownload, IconHammer, IconLoader2 } from "@tabler/icons-react";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { cn } from "@/lib/utils";

async function childDir(dir, name) {
  // Case-insensitive lookup, since FAT32 SD cards can have "themes" or "Themes".
  for await (const [entryName, handle] of dir.entries()) {
    if (handle.kind === "directory" && entryName.toLowerCase() === name.toLowerCase()) return handle;
  }
  return null;
}

async function fileExists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * checklist: [{ label, state: "done" | "todo" | "optional" }]
 * built: { blob, filename } | null
 */
export default function BuildPanel({ checklist, canBuild, building, status, built, onBuild }) {
  const [sdStatus, setSdStatus] = useState({ text: "", kind: "" });
  const [canPick, setCanPick] = useState(true);
  const [href, setHref] = useState(null);

  useEffect(() => setCanPick(typeof window !== "undefined" && "showDirectoryPicker" in window), []);
  useEffect(() => setSdStatus({ text: "", kind: "" }), [built]);
  useEffect(() => {
    if (!built) return setHref(null);
    const u = URL.createObjectURL(built.blob);
    setHref(u);
    return () => URL.revokeObjectURL(u);
  }, [built]);

  const saveToSd = async () => {
    if (!built) return;
    let picked;
    try {
      picked = await window.showDirectoryPicker({ id: "3ds-sd", mode: "readwrite" });
    } catch {
      return; // cancelled
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
      if (await fileExists(themes, built.filename) && !confirm(`${built.filename} is already in Themes. Replace it?`)) return;
      const handle = await themes.getFileHandle(built.filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(built.blob);
      await writable.close();
      const where = picked === themes ? themes.name : `${picked.name}/${themes.name}`;
      setSdStatus({ text: `Saved to ${where}/${built.filename}. Eject the SD card safely before removing it.`, kind: "ok" });
    } catch (err) {
      setSdStatus({ text: `Couldn't save to that folder: ${err.message}`, kind: "error" });
    }
  };

  return (
    <div className="space-y-5">
      <ul className="grid gap-1.5 text-sm" id="checklist">
        {checklist.map(({ label, state }) => (
          <li key={label} data-state={state} className={cn("flex items-center gap-2", state === "done" ? "text-neutral-200" : "text-neutral-500")}>
            {state === "done" ? <IconCheck size={16} className="text-emerald-400" /> : state === "optional" ? <IconMinus size={16} /> : <IconCircle size={14} />}
            {label}
          </li>
        ))}
      </ul>

      <HoverBorderGradient
        as="button"
        id="build-btn"
        onClick={canBuild && !building ? onBuild : undefined}
        aria-disabled={!canBuild || building}
        containerClassName={cn("w-full rounded-xl", (!canBuild || building) && "cursor-not-allowed opacity-50")}
        className="flex w-full items-center justify-center gap-2 bg-neutral-950 py-3 text-base font-semibold"
      >
        {building ? <IconLoader2 size={18} className="animate-spin" /> : <IconHammer size={18} />}
        {building ? "Building…" : "Build theme"}
      </HoverBorderGradient>

      {status.text && (
        <p id="build-status" role="status" className={cn("text-sm", status.kind === "error" ? "text-red-400" : status.kind === "ok" ? "text-emerald-400" : "text-neutral-400")}>
          {status.text}
        </p>
      )}

      {built && (
        <div id="result" className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button" id="save-sd" onClick={saveToSd} disabled={!canPick}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 font-semibold text-white transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconDeviceSdCard size={18} /> Save to SD card
            </button>
            <a
              id="download-link" href={href ?? undefined} download={built.filename}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 font-semibold text-neutral-100 transition hover:border-neutral-500"
            >
              <IconDownload size={18} /> Download {built.filename}
            </a>
          </div>
          {(sdStatus.text || !canPick) && (
            <p id="sd-status" role="status" className={cn("text-sm", sdStatus.kind === "error" ? "text-red-400" : sdStatus.kind === "ok" ? "text-emerald-400" : "text-neutral-400")}>
              {sdStatus.text || "Saving straight to the SD card needs Chrome or Edge. Download the zip and copy it into the card’s /Themes/ folder."}
            </p>
          )}
          <details open className="border-t border-neutral-800 pt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-neutral-200">Applying it on your 3DS</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-neutral-400">
              <li>Put the SD card in your computer and click <strong className="text-neutral-200">Save to SD card</strong>. Pick the card’s main folder and the theme goes into <code className="rounded bg-neutral-800 px-1">/Themes/</code>.</li>
              <li>Put the card back in the 3DS and open <strong className="text-neutral-200">Anemone3DS</strong> (requires custom firmware).</li>
              <li>Select your theme and apply it <strong className="text-neutral-200">with BGM</strong> if it has music.</li>
              <li>On the Home Menu, open Theme Settings and make sure theme shuffle is off.</li>
            </ol>
          </details>
        </div>
      )}
    </div>
  );
}
