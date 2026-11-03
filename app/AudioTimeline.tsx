"use client";
import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type Ref } from "react";

type ScrubKind = "current" | "start" | "end";
type TimelineWord = { text: string; startMs: number; endMs: number };
const DETAIL_PIXELS_PER_SECOND = 120;
export type AudioTimelineHandle = {
  selectScriptTime: (startSeconds: number, endSeconds: number) => boolean;
};

export default function AudioTimeline({ duration, current, start, end, chapters, words, onSeek, onStart, onEnd, onPreview, ref }: {
  duration: number; current: number; start: number; end: number; chapters: number[]; words: TimelineWord[]; onSeek: (n: number) => void; onStart: (n: number) => void; onEnd: (n: number) => void; onPreview: (seconds: number | null) => void; ref?: Ref<AudioTimelineHandle>;
}) {
  const [seeking, setSeeking] = useState(false);
  const [boundary, setBoundary] = useState<"start" | "end" | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; kind: ScrubKind; x: number; y: number; value: number; detail: boolean } | null>(null);
  const [detailKind, setDetailKind] = useState<ScrubKind | null>(null);
  const detailKindRef = useRef<ScrubKind | null>(null);
  const detailPanel = useRef<HTMLDivElement>(null);
  const scrubClickPendingRef = useRef(false);
  const [detailTime, setDetailTime] = useState(0);
  const limitValue = (kind: "current" | "start" | "end", value: number) => Math.max(kind === "end" ? Math.min(duration, start + 0.05) : 0, Math.min(kind === "start" ? Math.max(0, end - 0.05) : duration, value));
  const apply = (kind: "current" | "start" | "end", value: number) => {
    // The detailed timeline must edit the same handle as the normal timeline.
    // Update both the rendered mode and the ref used by script-word taps.
    if (detailKindRef.current !== null && detailKindRef.current !== kind) {
      detailKindRef.current = kind;
      setDetailKind(kind);
    }
    (kind === "current" ? onSeek : kind === "start" ? onStart : onEnd)(value);
    onPreview(value);
    setDetailTime(value);
  };
  useImperativeHandle(ref, () => ({
    selectScriptTime: (startSeconds, endSeconds) => {
      const kind = detailKindRef.current;
      if (kind === null) return false;
      gesture.current = null;
      apply(kind, limitValue(kind, kind === "end" ? endSeconds : startSeconds));
      return true;
    },
  }));
  const begin = (e: PointerEvent<HTMLElement>, kind: "current" | "start" | "end") => {
    if (!e.isPrimary || e.button !== 0 || gesture.current) return;
    e.preventDefault(); e.stopPropagation();
    scrubClickPendingRef.current = true;
    e.currentTarget.focus({ preventScroll: true });
    const r = track.current!.getBoundingClientRect();
    let value = kind === "current" ? current : kind === "start" ? start : end;
    if (kind === "current" && Math.abs(e.clientX - (r.left + current / Math.max(duration, 0.01) * r.width)) > 12) value = limitValue(kind, (e.clientX - r.left) / r.width * duration);
    gesture.current = { id: e.pointerId, kind, x: e.clientX, y: e.clientY, value, detail: false };
    setSeeking(kind === "current"); setBoundary(kind === "current" ? null : kind);
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(kind, value);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.detail && g.y - e.clientY >= 40 && detailKindRef.current === null) {
      detailKindRef.current = g.kind;
      setDetailKind(g.kind);
    }
    const width = track.current!.getBoundingClientRect().width;
    g.value = limitValue(g.kind, g.value + (g.detail ? -(e.clientX - g.x) / DETAIL_PIXELS_PER_SECOND : (e.clientX - g.x) / width * duration));
    g.x = e.clientX;
    apply(g.kind, g.value);
  };
  const finish = () => { gesture.current = null; setSeeking(false); setBoundary(null); if (detailKindRef.current === null) onPreview(null); };
  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const close = () => { gesture.current = null; detailKindRef.current = null; setDetailKind(null); setSeeking(false); setBoundary(null); onPreview(null); };
    const outside = (event: Event) => {
      // Pointer capture can target the original slider with a click after release.
      // It belongs to this scrub, not to a new outside interaction.
      if (scrubClickPendingRef.current) { scrubClickPendingRef.current = false; return; }
      const target = event.target instanceof Element ? event.target : null;
      const script = target?.closest("[data-reader-line-id]") && !target.closest("button,input,select,textarea,a");
      if (detailKindRef.current !== null && !script && !detailPanel.current?.contains(event.target as Node)) {
        // Keep the pressed control in place until its click has completed.
        clearTimeout(closeTimer);
        closeTimer = setTimeout(close, 0);
      }
    };
    const newPointer = () => { scrubClickPendingRef.current = false; };
    const escape = (event: KeyboardEvent) => { scrubClickPendingRef.current = false; if (event.key === "Escape") close(); };
    window.addEventListener("blur", close);
    document.addEventListener("click", outside, true);
    document.addEventListener("pointerdown", newPointer, true);
    document.addEventListener("play", close, true);
    document.addEventListener("keydown", escape);
    return () => { clearTimeout(closeTimer); window.removeEventListener("blur", close); document.removeEventListener("click", outside, true); document.removeEventListener("pointerdown", newPointer, true); document.removeEventListener("play", close, true); document.removeEventListener("keydown", escape); onPreview(null); };
  }, [onPreview]);
  const max = Math.max(duration, 0.01);
  const left = Math.min(start, max) / max * 100, right = Math.min(current, max) / max * 100;
  const endPercent = Math.min(end, max) / max * 100;
  const focusTime = boundary === "start" ? start : boundary === "end" ? end : current;
  return <>
    {detailKind !== null && <div ref={detailPanel} onPointerDown={e => e.stopPropagation()} className="relative mb-1 rounded-lg bg-gray-50">
      <span className="pointer-events-none absolute right-1 top-0 z-20 rounded bg-gray-50/90 px-1 text-[10px] tabular-nums text-gray-500">{Math.floor(detailTime / 60)}:{(detailTime % 60).toFixed(2).padStart(5, "0")}</span>
      <div role="slider" tabIndex={0} aria-label="単語付き時間軸を左右に動かして調整" aria-valuemin={detailKind === "end" ? Math.min(duration, start + 0.05) : 0} aria-valuemax={detailKind === "start" ? Math.max(0, end - 0.05) : duration} aria-valuenow={detailTime}
        className="relative h-12 touch-none select-none overflow-hidden rounded-lg cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-blue-500"
        onPointerDown={e => {
          if (!e.isPrimary || e.button !== 0 || gesture.current) return;
          e.preventDefault(); e.stopPropagation(); e.currentTarget.focus({ preventScroll: true });
          scrubClickPendingRef.current = true;
          gesture.current = { id: e.pointerId, kind: detailKind, x: e.clientX, y: e.clientY, value: detailTime, detail: true };
          e.currentTarget.setPointerCapture(e.pointerId);
        }} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); apply(detailKind, limitValue(detailKind, e.key === "Home" ? 0 : e.key === "End" ? duration : detailTime + (e.key === "ArrowRight" ? 0.05 : -0.05))); } }}>
        {words.map((word, i) => {
          const from = word.startMs / 1000, to = word.endMs / 1000;
          if (to < detailTime - 8 || from > detailTime + 8) return null;
          const next = words[i + 1]?.startMs;
          const width = Math.max(8, ((next !== undefined && next > word.startMs ? next : word.endMs) - word.startMs) / 1000 * DETAIL_PIXELS_PER_SECOND - 4);
          const active = from <= detailTime && to > detailTime;
          return <div key={i} title={word.text} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 px-1 text-sm ${active ? "z-20 whitespace-nowrap rounded bg-gray-50 font-semibold text-blue-700" : "text-gray-600"}`} style={{ left: `calc(50% + ${(from - detailTime) * DETAIL_PIXELS_PER_SECOND}px)`, width: active ? "max-content" : width, minWidth: active ? width : undefined }}><span className={active ? "block" : "block truncate"}>{word.text}</span></div>;
        })}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px bg-blue-600" />
      </div>
    </div>}
    <div ref={track} className="relative mx-2 h-9 min-w-0 flex-1">
    <div className="pointer-events-none absolute left-0 right-0 top-4 h-1 rounded-full bg-gray-300" />
    <div className="pointer-events-none absolute top-4 h-1 rounded-full bg-blue-600" style={{ left: `${left}%`, width: `${Math.max(0, Math.min(right, endPercent) - left)}%` }} />
    <input type="range" min={0} max={max} step={0.01} value={Math.min(current, max)} onPointerDown={e => begin(e, "current")} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish} onKeyDown={() => setSeeking(true)} onKeyUp={finish} onChange={e => { if (!gesture.current) apply("current", Number(e.target.value)); }} aria-label="再生位置" className="timeline-current absolute inset-0 h-full w-full touch-none cursor-pointer" />
    {(seeking || boundary !== null) && chapters.map((t, i) => {
      const distance = Math.abs(t - focusTime) / max;
      return distance < 0.07 ? <span key={i} className="pointer-events-none absolute top-0 w-px bg-blue-700" style={{ left: `${t / max * 100}%`, height: 5 + 9 * (1 - distance / 0.07), opacity: 1 - distance / 0.07 }} /> : null;
    })}
    {(["start", "end"] as const).map(kind => {
      const value = kind === "start" ? start : end;
      const min = kind === "start" ? 0 : Math.min(duration, start + 0.05);
      const limit = kind === "start" ? Math.max(0, end - 0.05) : duration;
      const update = (n: number) => apply(kind, Math.max(min, Math.min(limit, n)));
      const label = `全体リピートの${kind === "start" ? "開始" : "終了"}地点`;
      return <div key={kind} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={limit} aria-valuenow={value} title={label} style={{ left: `${kind === "start" ? left : endPercent}%` }} className={`absolute top-0.5 z-10 flex h-8 w-5 touch-none cursor-ew-resize items-center rounded focus-visible:outline-2 focus-visible:outline-blue-500 ${kind === "start" ? "-translate-x-full justify-end" : "justify-start"}`}
        onPointerDown={e => begin(e, kind)} onPointerMove={move} onPointerUp={finish}
        onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish}
        onKeyUp={finish}
        onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setBoundary(kind); update(e.key === "Home" ? min : e.key === "End" ? limit : value + (e.key === "ArrowRight" ? 1 : -1)); } }}><span className="pointer-events-none h-5 w-1 rounded-sm bg-blue-600" /></div>;
    })}
    <style>{`.timeline-current{appearance:none;background:transparent;margin:0}.timeline-current::-webkit-slider-runnable-track{height:4px;background:transparent}.timeline-current::-webkit-slider-thumb{appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;background:#2563eb}.timeline-current::-moz-range-track{height:4px;background:transparent}.timeline-current::-moz-range-progress{background:transparent}.timeline-current::-moz-range-thumb{width:14px;height:14px;background:#2563eb;border:0;border-radius:50%}`}</style>
  </div></>;
}
