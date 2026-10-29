"use client";
import { useRef, useState } from "react";

export default function AudioTimeline({ duration, current, start, end, chapters, onSeek, onStart, onEnd }: {
  duration: number; current: number; start: number; end: number; chapters: number[]; onSeek: (n: number) => void; onStart: (n: number) => void; onEnd: (n: number) => void;
}) {
  const [seeking, setSeeking] = useState(false);
  const [boundary, setBoundary] = useState<"start" | "end" | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const max = Math.max(duration, 0.01);
  const left = Math.min(start, max) / max * 100, right = Math.min(current, max) / max * 100;
  const endPercent = Math.min(end, max) / max * 100;
  const focusTime = boundary === "start" ? start : boundary === "end" ? end : current;
  return <div ref={track} className="relative mx-2 h-9 min-w-0 flex-1">
    <div className="pointer-events-none absolute left-0 right-0 top-4 h-1 rounded-full bg-gray-300" />
    <div className="pointer-events-none absolute top-4 h-1 rounded-full bg-blue-600" style={{ left: `${left}%`, width: `${Math.max(0, Math.min(right, endPercent) - left)}%` }} />
    <input type="range" min={0} max={max} step={0.01} value={Math.min(current, max)} onPointerDown={() => setSeeking(true)} onPointerUp={() => setSeeking(false)} onPointerCancel={() => setSeeking(false)} onBlur={() => setSeeking(false)} onKeyDown={() => setSeeking(true)} onKeyUp={() => setSeeking(false)} onChange={e => onSeek(Number(e.target.value))} aria-label="再生位置" className="timeline-current absolute inset-0 h-full w-full cursor-pointer" />
    {(seeking || boundary !== null) && chapters.map((t, i) => {
      const distance = Math.abs(t - focusTime) / max;
      return distance < 0.07 ? <span key={i} className="pointer-events-none absolute top-0 w-px bg-blue-700" style={{ left: `${t / max * 100}%`, height: 5 + 9 * (1 - distance / 0.07), opacity: 1 - distance / 0.07 }} /> : null;
    })}
    {(["start", "end"] as const).map(kind => {
      const value = kind === "start" ? start : end;
      const min = kind === "start" ? 0 : Math.min(duration, start + 0.05);
      const limit = kind === "start" ? Math.max(0, end - 0.05) : duration;
      const update = (n: number) => (kind === "start" ? onStart : onEnd)(Math.max(min, Math.min(limit, n)));
      const label = `全体リピートの${kind === "start" ? "開始" : "終了"}地点`;
      return <div key={kind} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={limit} aria-valuenow={value} title={label} style={{ left: `${kind === "start" ? left : endPercent}%` }} className={`absolute top-0.5 z-10 flex h-8 w-5 touch-none cursor-ew-resize items-center rounded focus-visible:outline-2 focus-visible:outline-blue-500 ${kind === "start" ? "-translate-x-full justify-end" : "justify-start"}`}
        onPointerDown={e => { e.stopPropagation(); setBoundary(kind); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const r = track.current!.getBoundingClientRect(); update((e.clientX - r.left) / r.width * duration); }}
        onPointerUp={e => { setBoundary(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => setBoundary(null)} onLostPointerCapture={() => setBoundary(null)} onBlur={() => setBoundary(null)}
        onKeyUp={() => setBoundary(null)}
        onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setBoundary(kind); update(e.key === "Home" ? min : e.key === "End" ? limit : value + (e.key === "ArrowRight" ? 1 : -1)); } }}><span className="pointer-events-none h-5 w-1 rounded-sm bg-blue-600" /></div>;
    })}
    <style>{`.timeline-current{appearance:none;background:transparent;margin:0}.timeline-current::-webkit-slider-runnable-track{height:4px;background:transparent}.timeline-current::-webkit-slider-thumb{appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;background:#2563eb}.timeline-current::-moz-range-track{height:4px;background:transparent}.timeline-current::-moz-range-progress{background:transparent}.timeline-current::-moz-range-thumb{width:14px;height:14px;background:#2563eb;border:0;border-radius:50%}`}</style>
  </div>;
}
