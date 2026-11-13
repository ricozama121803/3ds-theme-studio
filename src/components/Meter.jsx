import { cn } from "@/lib/utils";

export default function Meter({ ratio, text }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-200",
            ratio > 1 ? "bg-red-500" : ratio > 0.9 ? "bg-amber-400" : "bg-emerald-500",
          )}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      {text && <p className={cn("text-sm", ratio > 1 ? "text-red-400" : "text-neutral-500")}>{text}</p>}
    </div>
  );
}
