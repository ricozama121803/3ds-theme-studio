"use client";
import { useState } from "react";
import { IconBrandGoogle, IconClipboard, IconLoader2 } from "@tabler/icons-react";

const looksLikeUrl = (s) => /^(https?:\/\/|data:image\/)/i.test(s.trim());

/** Download a picture from a link (or data: URL) as a Blob. */
export async function fetchImageUrl(raw) {
  const url = raw.trim();
  if (/^data:image\//i.test(url)) return (await fetch(url)).blob();
  const res = await fetch(`/api/image?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Couldn't download that picture (HTTP ${res.status}).`);
  }
  return res.blob();
}

/**
 * Search Google Images in a new tab, then bring a picture back by pasting it
 * (Copy image) or its link (Copy image address).
 */
export default function ImageSearch({ onImage, suggestion = "" }) {
  const [query, setQuery] = useState(suggestion);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const search = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // isz:l = large pictures only, so the result stays sharp on the 3DS.
    window.open(`https://www.google.com/search?tbm=isch&tbs=isz:l&q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
  };

  const loadLink = async (url) => {
    if (!looksLikeUrl(url)) return setError("Paste a picture, or a link starting with http.");
    setBusy(true);
    setError("");
    try {
      await onImage(await fetchImageUrl(url));
      setLink("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onPaste = (e) => {
    const file = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      setError("");
      onImage(file);
      return;
    }
    const text = e.clipboardData?.getData("text") || "";
    if (looksLikeUrl(text)) {
      e.preventDefault();
      setLink(text.trim());
      loadLink(text);
    }
  };

  const input = "min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-accent-500";
  const button = "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:border-neutral-500 disabled:opacity-50";

  return (
    <div className="space-y-2.5 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Google Images, e.g. “pixel art sunset”"
          aria-label="Google Images search" className={input}
        />
        <button type="submit" disabled={!query.trim()} className={button}>
          <IconBrandGoogle size={16} /> Search
        </button>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); loadLink(link); }} className="flex gap-2">
        <input
          value={link} onChange={(e) => setLink(e.target.value)} onPaste={onPaste} disabled={busy}
          placeholder="Then paste the picture or its link here" aria-label="Picture or picture link" className={input}
        />
        <button type="submit" disabled={busy || !link.trim()} className={button}>
          {busy ? <IconLoader2 size={16} className="animate-spin" /> : <IconClipboard size={16} />} Use
        </button>
      </form>
      <p className="text-xs text-neutral-500">
        Opens in a new tab. Click a result to open it full size, right-click it, choose <b className="font-medium text-neutral-400">Copy image</b>,
        then come back and paste (Ctrl+V) in the box above.
      </p>
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </div>
  );
}
