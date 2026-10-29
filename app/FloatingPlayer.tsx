"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { ChevronDown, GripHorizontal, Rewind, FastForward, Pause, Play } from "lucide-react";

export default function FloatingPlayer({ playing, onPlayback, onPrevious, onNext, onDockHeight, header, headerRight, children }: {
  playing: boolean; onPlayback: () => void; onPrevious: () => void; onNext: () => void; onDockHeight?: (height: number) => void; header?: ReactNode; headerRight?: ReactNode; children: ReactNode;
}) {
  const [size, setSize] = useState(0);
  const expanded = size === 2;
  const [docked, setDocked] = useState(false);
  const [height, setHeight] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean; edge: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const clamp = (left: number, top: number) => {
    const rect = panel.current?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
    const rightMargin = 8;
    return { left: Math.max(x + 8, Math.min(left, x + (viewport?.width ?? window.innerWidth) - (rect?.width ?? 64) - rightMargin)), top: Math.max(y + 16, Math.min(top, y + (viewport?.height ?? window.innerHeight) - (rect?.height ?? 64) - 8)) };
  };
  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary || drag.current) return;
    const target = e.target as HTMLElement;
    const edge = !!target.closest("[data-resize-edge]");
    if (!edge && expanded && target.closest("button, input, select, textarea, a, [role='button'], [contenteditable='true']")) return;
    const rect = panel.current!.getBoundingClientRect();
    suppressClick.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false, edge };
    target.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    d.moved = true;
    suppressClick.current = true;
    if (!d.edge) { setDocked(false); setPosition(clamp(d.left + e.clientX - d.x, d.top + e.clientY - d.y)); }
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (e.type === "pointerup" && d.edge && d.moved) {
      const r = panel.current!.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const delta = Math.hypot(e.clientX - cx, e.clientY - cy) - Math.hypot(d.x - cx, d.y - cy);
      if (Math.abs(delta) > 20) setSize(s => Math.max(0, Math.min(2, s + (delta > 0 ? 1 : -1))));
    }
    if (e.type === "pointerup" && !d.edge && d.moved && expanded) {
      const v = window.visualViewport;
      const bottom = (v?.offsetTop ?? 0) + (v?.height ?? window.innerHeight);
      if (panel.current!.getBoundingClientRect().bottom >= bottom - 40) setDocked(true);
    }
    drag.current = null;
  };
  useLayoutEffect(() => {
    const fit = () => { setHeight(panel.current?.getBoundingClientRect().height ?? 0); setPosition((p) => {
      const next = clamp(p?.left ?? 12, p?.top ?? window.innerHeight - 100);
      return p?.left === next.left && p?.top === next.top ? p : next;
    }); };
    fit();
    const observer = new ResizeObserver(fit);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
  }, []);
  const isDocked = docked && expanded;
  useEffect(() => { onDockHeight?.(isDocked ? height : 0); return () => onDockHeight?.(0); }, [isDocked, height, onDockHeight]);
  return <>{isDocked && <div aria-hidden className="shrink-0" style={{ height }} />}<div ref={panel} style={isDocked ? { left: 0, bottom: 0, width: "100%" } : position ? { left: position.left, top: position.top } : { left: 12, bottom: 12 }}
    onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
    onKeyDownCapture={() => { suppressClick.current = false; }}
    onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } }}
    className={`group/player fixed z-[55] border border-gray-200 bg-white/95 shadow-lg backdrop-blur ${expanded ? isDocked ? "rounded-t-xl" : "w-[min(720px,calc(100vw-16px))] rounded-xl" : size === 1 ? "w-44 rounded-full p-2" : "h-16 w-16 rounded-full"}`}>
    <div className="pointer-events-none absolute -inset-1 rounded-[inherit] border-[6px] border-gray-400/0 transition-colors group-hover/player:border-gray-400/20 group-focus-within/player:border-gray-400/20" />
    {expanded && <div className="relative flex h-8 items-center gap-2 px-3 pr-9"><div className="shrink-0">{header}</div><div aria-label="プレイヤーをドラッグして移動" title="ここをつまんで移動（下端で固定、上へドラッグで解除）" className="flex min-w-6 flex-1 self-stretch touch-none select-none cursor-grab items-center justify-center text-gray-400 active:cursor-grabbing"><GripHorizontal size={22} /></div><div className="flex shrink-0 items-center gap-2">{headerRight}</div></div>}
    <div className={expanded ? "" : "hidden"}>
      <button aria-label="プレイヤーを中サイズに縮小" title="縮小" onClick={() => setSize(1)} className="absolute right-1 top-0 rounded p-1 text-gray-500 hover:bg-gray-100"><ChevronDown size={18} /></button>
      <div className="max-h-[min(65dvh,calc(100dvh-48px))] overflow-y-auto">{children}</div>
    </div>
    {!expanded && <div className={size === 1 ? "flex items-center justify-between" : ""}>
      {size === 1 && <button aria-label="前の行" onClick={onPrevious} className="rounded-full p-2 text-gray-600"><Rewind size={22} /></button>}
      <button aria-label={playing ? "一時停止" : "再生"} title="タップで再生・停止、ドラッグで移動" onClick={onPlayback} className={`flex touch-none select-none items-center justify-center rounded-full text-blue-600 hover:bg-blue-50 ${size === 0 ? "h-16 w-16" : "h-12 w-12"}`}>{playing ? <Pause className="pointer-events-none" size={26} /> : <Play className="pointer-events-none" size={26} />}</button>
      {size === 1 && <button aria-label="次の行" onClick={onNext} className="rounded-full p-2 text-gray-600"><FastForward size={22} /></button>}
    </div>}
    {["-top-1 -left-1 -right-1 h-3 cursor-ns-resize", "-bottom-1 -left-1 -right-1 h-3 cursor-ns-resize", "-left-1 top-2 bottom-2 w-3 cursor-ew-resize", "-right-1 top-2 bottom-2 w-3 cursor-ew-resize"].map((cls, i) => <div key={i} data-resize-edge role="button" tabIndex={i === 0 ? 0 : -1} aria-label="プレイヤーのサイズ変更（Enterで切替、上下矢印で拡大縮小）" onKeyDown={e => {
      if (["Enter", " ", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        setSize(s => e.key === "ArrowUp" ? Math.min(2, s + 1) : e.key === "ArrowDown" ? Math.max(0, s - 1) : (s + 1) % 3);
      }
    }} title="外へ引くと拡大、内へ引くと縮小" className={`absolute ${cls} touch-none rounded-full`} />)}
  </div></>;
}
