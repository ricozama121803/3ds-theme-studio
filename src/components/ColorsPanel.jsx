"use client";
import { IconSparkles, IconRefresh } from "@tabler/icons-react";
import { COLOR_GROUPS, deriveFields, contrastOf } from "@/lib/colors";
import { IconButton } from "@/components/Cropper";
import { cn } from "@/lib/utils";

export const COLOR_DEFAULTS = {
  filecolor: "#f3f3f3", cursorcolor: "#43c7f4", foldercolor: "#f0c540", folderbgcolor: "#d9d9d9",
  folderarrowcolor: "#e6e6e6", open: "#e6e6e6", close: "#e6e6e6", arrowbuttoncolor: "#f3f3f3",
  arrowcolor: "#7d7d7d", bottomcornerbuttoncolor: "#f3f3f3", topcornerbuttoncolor: "#f3f3f3",
  gametext: "#2b2b2b", demotextcolor: "#43c7f4",
};

export const initialColorState = () =>
  Object.fromEntries(COLOR_GROUPS.map((g) => [
    g.id, { enabled: false, base: COLOR_DEFAULTS[g.id], text: contrastOf(COLOR_DEFAULTS[g.id]), overrides: {} },
  ]));

/** Resolved colour of one field (falls back to the 3DS-like default when the group is off). */
export function resolveColor(state, id, field) {
  const s = state[id];
  const group = COLOR_GROUPS.find((g) => g.id === id);
  const base = s.enabled ? s.base : COLOR_DEFAULTS[id];
  const text = s.enabled ? s.text : contrastOf(COLOR_DEFAULTS[id]);
  return deriveFields(group, base, text, s.enabled ? s.overrides : {})[field];
}

export default function ColorsPanel({ state, setState, hideGameText, setHideGameText, onAuto, canAuto }) {
  const update = (id, patch) => setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Recolour the app tiles, cursor, folders, buttons and text. Anything left unticked keeps the standard 3DS look.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button" onClick={onAuto} disabled={!canAuto}
          title={canAuto ? "" : "Add a top or bottom screen image first"}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-accent-600 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconSparkles size={16} /> Match my images
        </button>
        <IconButton label="Reset all" className="h-9 px-3" onClick={() => setState(() => {
          const fresh = {};
          for (const g of COLOR_GROUPS) {
            fresh[g.id] = { enabled: false, base: COLOR_DEFAULTS[g.id], text: contrastOf(COLOR_DEFAULTS[g.id]), overrides: {} };
          }
          return fresh;
        })}>
          <IconRefresh size={16} /> Reset all
        </IconButton>
      </div>

      <div className="grid gap-2">
        {COLOR_GROUPS.map((group) => {
          const s = state[group.id];
          const fields = deriveFields(group, s.base, s.text, s.overrides);
          return (
            <div
              key={group.id}
              className={cn(
                "rounded-xl border px-4 py-3 transition-colors",
                s.enabled ? "border-accent-500/60 bg-accent-500/5" : "border-neutral-800",
              )}
            >
              <div className="flex items-center gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => update(group.id, { enabled: e.target.checked })} />
                  <span className="min-w-0">
                    <span className="block font-medium text-neutral-100">{group.label}</span>
                    <span className="block text-xs text-neutral-500">{group.desc}</span>
                  </span>
                </label>
                <Swatch label="Colour" value={s.base} onChange={(v) => update(group.id, { base: v, enabled: true })} />
                {group.text && <Swatch label="Text" value={s.text} onChange={(v) => update(group.id, { text: v, enabled: true })} />}
              </div>
              {s.enabled && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">Fine-tune shades</summary>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    {group.fields.map((f) => (
                      <Swatch
                        key={f}
                        label={f.replace("text", "text ").replace("icon", "icon ")}
                        value={fields[f]}
                        highlight={!!s.overrides[f]}
                        onChange={(v) => update(group.id, { overrides: { ...s.overrides, [f]: v } })}
                      />
                    ))}
                    <IconButton label="Reset shades" onClick={() => update(group.id, { overrides: {} })}>Reset shades</IconButton>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input type="checkbox" checked={hideGameText} onChange={(e) => setHideGameText(e.target.checked)} />
        Hide the app-name bubble
      </label>
    </div>
  );
}

function Swatch({ label, value, onChange, highlight }) {
  return (
    <label className="flex flex-col items-center gap-1 text-[11px] text-neutral-500">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className={highlight ? "text-accent-400" : undefined}>{label}</span>
    </label>
  );
}
