"use client";
import { useEffect, useRef } from "react";
import { IconRefresh, IconPhotoEdit, IconRotate, IconRotateClockwise, IconTrash } from "@tabler/icons-react";
import { rotate90 } from "@/lib/imaging";
import { FileUpload } from "@/components/ui/file-upload";
import { cn } from "@/lib/utils";
import { clampCrop, coverCrop, drawCrop, scaleFor, sliderFor } from "@/lib/crop";
import ImageSearch, { fetchImageUrl } from "@/components/ImageSearch";

const IMAGE_ACCEPT = { "image/*": [] };

/**
 * Pan/zoom image cropper for a w×h output.
 * Controlled: `crop` comes from the parent; changes go out through `onCrop`.
 */
export default function Cropper({
  crop, onCrop, w, h, editScale = 2, optional = false, compact = false, pixelated = false,
  uploadTitle = "Upload an image", showQuality = true, webSearch = false, clearable = false,
}) {
  const canvasRef = useRef(null);
  const replaceRef = useRef(null);
  const latest = useRef(crop);
  latest.current = crop;

  const load = async (file) => {
    if (!file) return;
    try {
      const img = await createImageBitmap(file);
      onCrop(coverCrop(img, w, h, { bg: crop?.bg, userImage: true }));
    } catch {
      alert(file.name ? `Couldn't open "${file.name}" as an image.` : "Couldn't open that as an image.");
    }
  };

  // Turn the picture itself, then fit it to the frame again.
  const rotate = async (dir) => {
    const cur = latest.current;
    if (!cur?.img) return;
    onCrop(coverCrop(await rotate90(cur.img, dir), w, h, cur));
  };

  // A picture dragged in from another tab arrives as a link, not a file.
  const onDropLink = (e) => {
    if (e.dataTransfer?.files?.length) return;
    const url = e.dataTransfer?.getData("text/uri-list")?.split("\n").find((l) => l && !l.startsWith("#"))
      || e.dataTransfer?.getData("text/plain");
    if (!url || !/^(https?:|data:image\/)/i.test(url.trim())) return;
    e.preventDefault();
    fetchImageUrl(url).then(load, (err) => alert(err.message));
  };

  const search = webSearch && <ImageSearch onImage={load} />;

  // Redraw the editor canvas.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !crop?.img) return;
    c.width = Math.round(w * editScale);
    c.height = Math.round(h * editScale);
    drawCrop(c.getContext("2d"), crop, w, h, editScale);
  }, [crop, w, h, editScale]);

  // Drag to pan, wheel to zoom.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let last = null;
    const down = (e) => {
      if (!latest.current?.img) return;
      last = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      const cur = latest.current;
      if (!last || !cur?.img) return;
      const cssToOut = w / c.clientWidth;
      const next = {
        ...cur,
        cx: cur.cx - ((e.clientX - last.x) * cssToOut) / cur.scale,
        cy: cur.cy - ((e.clientY - last.y) * cssToOut) / cur.scale,
      };
      last = { x: e.clientX, y: e.clientY };
      onCrop(clampCrop(next, w, h));
    };
    const up = () => { last = null; };
    const wheel = (e) => {
      const cur = latest.current;
      if (!cur?.img) return;
      e.preventDefault();
      const v = Math.min(1000, Math.max(0, sliderFor(cur, w, h) - Math.sign(e.deltaY) * 40));
      onCrop(clampCrop({ ...cur, scale: scaleFor(v, cur.img, w, h) }, w, h));
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
    };
  }, [w, h, onCrop, crop?.img]);

  if (!crop?.img) {
    return (
      <div className="space-y-3" onDragOver={(e) => e.preventDefault()} onDrop={onDropLink}>
        <FileUpload
          accept={IMAGE_ACCEPT}
          compact={compact}
          title={uploadTitle}
          subtitle="Drag & drop an image here, or click to browse"
          onChange={(files) => load(files[0])}
        />
        {search}
      </div>
    );
  }

  const zoom = sliderFor(crop, w, h);
  const enlarged = crop.scale > 1.05;

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className={cn(
          "block cursor-grab touch-none rounded-lg ring-1 ring-neutral-800 active:cursor-grabbing",
          pixelated ? "max-h-56 max-w-full [image-rendering:pixelated]" : "w-full",
          compact && !pixelated && "max-w-48",
        )}
        style={pixelated ? { width: Math.min(w * editScale, 256) } : undefined}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2 text-neutral-400">
          Zoom
          <input
            type="range" min="0" max="1000" value={zoom}
            className={compact ? "w-20" : "w-36"}
            onChange={(e) => onCrop(clampCrop({ ...crop, scale: scaleFor(Number(e.target.value), crop.img, w, h) }, w, h))}
          />
        </label>
        <label className="flex items-center gap-2 text-neutral-400" title="Colour behind the image when zoomed out">
          Fill
          <input type="color" value={crop.bg} onChange={(e) => onCrop({ ...crop, bg: e.target.value })} />
        </label>
        <span className="flex-1" />
        <div className="flex gap-1.5">
          <IconButton label="Rotate left" onClick={() => rotate(-1)}><IconRotate size={16} /></IconButton>
          <IconButton label="Rotate right" onClick={() => rotate(1)}><IconRotateClockwise size={16} /></IconButton>
          <IconButton label="Reset" onClick={() => onCrop(coverCrop(crop.img, w, h, crop))}><IconRefresh size={16} /></IconButton>
          <IconButton label="Replace" onClick={() => replaceRef.current?.click()}><IconPhotoEdit size={16} /></IconButton>
          {clearable && <IconButton label="Remove image" onClick={() => onCrop(null)}><IconTrash size={16} /> Remove</IconButton>}
          {optional && !clearable && <IconButton label="Remove" onClick={() => onCrop(null)}><IconTrash size={16} /></IconButton>}
        </div>
        <input
          ref={replaceRef} type="file" accept="image/*" hidden
          onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
      {showQuality && (
        <p className={cn("text-xs", enlarged ? "text-amber-400" : "text-neutral-500")}>
          {enlarged
            ? `⚠ Enlarged ${crop.scale.toFixed(1)}×, so it may look soft. Use a bigger image or zoom out.`
            : `✓ Sharp: ${crop.img.width}×${crop.img.height} source, scaled down ${(1 / crop.scale).toFixed(1)}× with high-quality filtering. Drag to reposition.`}
        </p>
      )}
      {search && (
        <details className="group">
          <summary className="cursor-pointer select-none text-sm text-neutral-400 hover:text-neutral-200">Find a different picture on Google Images</summary>
          <div className="mt-2">{search}</div>
        </details>
      )}
    </div>
  );
}

export function IconButton({ label, onClick, children, className }) {
  return (
    <button
      type="button" onClick={onClick} title={label} aria-label={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 text-xs text-neutral-300 transition hover:border-neutral-600 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
