"use client";
import { useEffect, useRef, useState } from "react";
import { IconPlayerPlay, IconPlayerRecordFilled, IconPlayerStopFilled, IconTrash } from "@tabler/icons-react";
import { FileUpload } from "@/components/ui/file-upload";
import { IconButton } from "@/components/Cropper";
import { Hint } from "@/components/StepCard";
import Meter from "@/components/Meter";
import { canRecordTabs, startTabRecording, MAX_RECORD_SECONDS } from "@/lib/recorder";
import { MAX_BGM_BYTES, bgmMaxSeconds, estimateBgmBytes, clipRange } from "@/lib/limits";

const AUDIO_ACCEPT = { "audio/*": [], "video/*": [] };
const tenth = (s) => Math.floor(s * 10) / 10;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const mb = (b) => (b / 1048576).toFixed(2);

/**
 * music: { file, duration, start, end, fade, mono } | null
 */
export default function MusicPanel({ music, setMusic }) {
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(null); // { stop, secs, level }
  const [processing, setProcessing] = useState(false);
  const [canRecord, setCanRecord] = useState(true);
  const playerRef = useRef(null);
  const stopAt = useRef(null);
  const [url, setUrl] = useState(null);

  useEffect(() => setCanRecord(canRecordTabs()), []);

  // Object URL for the player.
  useEffect(() => {
    if (!music?.file) return setUrl(null);
    const u = URL.createObjectURL(music.file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [music?.file]);

  const load = (file) => {
    setError("");
    const duration = file.knownDuration || 0;
    setMusic({
      file, duration, start: 0, fade: 0, mono: false,
      end: duration ? tenth(Math.min(duration, bgmMaxSeconds(false))) : 0,
    });
  };

  const onMetadata = () => {
    const d = playerRef.current?.duration;
    if (!music || music.duration || !Number.isFinite(d)) return;
    setMusic({ ...music, duration: d, end: tenth(Math.min(d, bgmMaxSeconds(music.mono))) });
  };

  const record = async () => {
    setError("");
    try {
      const controller = await startTabRecording({
        onLevel: (level) => setRecording((r) => r && { ...r, level }),
        onTick: (secs) => setRecording((r) => r && { ...r, secs }),
        onStop: async (done) => {
          setRecording(null);
          setProcessing(true);
          try {
            load(await done);
          } catch (err) {
            setError(err.message);
          } finally {
            setProcessing(false);
          }
        },
      });
      setRecording({ stop: controller.stop, secs: 0, level: 0 });
    } catch (err) {
      setError(err.message);
    }
  };

  const playClip = () => {
    const p = playerRef.current;
    if (!p || !music) return;
    const { start, end } = clipRange(music);
    stopAt.current = end;
    p.currentTime = start;
    p.play();
  };

  if (recording) {
    return (
      <div className="space-y-4 rounded-xl border border-red-500/40 bg-red-500/5 p-5">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
          <span className="font-semibold">Recording</span>
          <span className="ml-auto text-sm tabular-nums text-neutral-400">
            {fmtTime(recording.secs)} / {fmtTime(MAX_RECORD_SECONDS)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
          <div className="h-full bg-red-500 transition-[width] duration-75" style={{ width: `${Math.round(recording.level * 100)}%` }} />
        </div>
        <Hint>Play the song in the other tab now, from the start. Click Stop when it’s finished.</Hint>
        <button
          type="button" onClick={recording.stop}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 font-semibold text-white transition hover:bg-red-400"
        >
          <IconPlayerStopFilled size={16} /> Stop recording
        </button>
      </div>
    );
  }

  if (!music) {
    return (
      <div className="space-y-4">
        <FileUpload
          accept={AUDIO_ACCEPT}
          title="Upload a song"
          subtitle="MP3, WAV, OGG, M4A… drag it here or click to browse"
          onChange={(files) => load(files[0])}
        />
        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-neutral-600">
          <span className="h-px flex-1 bg-neutral-800" /> or <span className="h-px flex-1 bg-neutral-800" />
        </div>
        <button
          type="button" onClick={record} disabled={!canRecord || processing}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 font-semibold text-neutral-100 transition hover:border-red-500/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconPlayerRecordFilled size={16} className="text-red-500" />
          {processing ? "Processing recording…" : "Record from another tab"}
        </button>
        <Hint>
          {canRecord
            ? "Grabs whatever is playing in another Chrome tab (YouTube, Spotify Web, SoundCloud…). Turn on “Also share tab audio” in the picker. Silence at the start and end is trimmed automatically."
            : "Recording another tab needs Chrome or Edge on a computer."}
        </Hint>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      </div>
    );
  }

  const { length } = clipRange(music);
  const bytes = estimateBgmBytes(music);
  const max = bgmMaxSeconds(music.mono);
  const over = bytes > MAX_BGM_BYTES;
  const set = (patch) => setMusic({ ...music, ...patch });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-medium">{music.file.name}</span>
        <IconButton label="Remove" onClick={() => setMusic(null)}><IconTrash size={16} /> Remove</IconButton>
      </div>
      <audio
        ref={playerRef} src={url ?? undefined} controls preload="metadata" className="w-full"
        onLoadedMetadata={onMetadata}
        onTimeUpdate={() => {
          const p = playerRef.current;
          if (stopAt.current !== null && p.currentTime >= stopAt.current) {
            p.pause();
            stopAt.current = null;
          }
        }}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label="Start (s)" value={music.start} max={music.duration} onChange={(v) => set({ start: v })}
          onNow={() => set({ start: +(playerRef.current?.currentTime ?? 0).toFixed(1) })} />
        <NumberField label="End (s)" value={music.end} max={music.duration} onChange={(v) => set({ end: v })}
          onNow={() => set({ end: +(playerRef.current?.currentTime ?? 0).toFixed(1) })} />
        <NumberField label="Fade out (s)" value={music.fade} max={10} step={0.5} onChange={(v) => set({ fade: v })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-neutral-300">
          <input type="checkbox" checked={music.mono} onChange={(e) => set({ mono: e.target.checked })} />
          Mono (doubles the max length)
        </label>
        <IconButton label="Play clip" onClick={playClip}><IconPlayerPlay size={16} /> Play clip</IconButton>
      </div>
      <Meter
        ratio={bytes / MAX_BGM_BYTES}
        text={over
          ? `Too long: ${length.toFixed(1)} s ≈ ${mb(bytes)} MB. Keep it under ${max.toFixed(0)} s${music.mono ? "" : " or switch to mono"}.`
          : `${length.toFixed(1)} s clip ≈ ${mb(bytes)} MB of ${mb(MAX_BGM_BYTES)} MB (max ≈ ${max.toFixed(0)} s).`}
      />
      <Hint>The song loops on the Home Menu. The 3DS caps theme music at about 3.2 MB, which is roughly 90 seconds in stereo or 3 minutes in mono.</Hint>
    </div>
  );
}

function NumberField({ label, value, onChange, onNow, max, step = 0.1 }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-300">
      {label}
      <span className="flex gap-1.5">
        <input
          type="number" min="0" max={max || undefined} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full min-w-0 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 font-normal text-neutral-100 outline-none focus:border-accent-500"
        />
        {onNow && (
          <button type="button" onClick={onNow} title="Use the player's current position"
            className="shrink-0 rounded-lg border border-neutral-800 px-2 text-xs text-neutral-400 hover:border-neutral-600 hover:text-white">
            now
          </button>
        )}
      </span>
    </label>
  );
}
