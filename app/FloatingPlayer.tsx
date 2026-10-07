"use client";
import { useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { ChevronDown, GripHorizontal, Maximize2, Pause, Play } from "lucide-react";

export default function FloatingPlayer({ expanded, onExpanded, playing, onPlayback, children }: {
  expanded: boolean; onExpanded: (value: boolean) => void; playing: boolean; onPlayback: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const clamp = (left: number, top: number) => {
    const rect = panel.current?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
    const rightMargin = rect && rect.width > 64 ? 8 : 32;
    return { left: Math.max(x + 8, Math.min(left, x + (viewport?.width ?? window.innerWidth) - (rect?.width ?? 64) - rightMargin)), top: Math.max(y + 16, Math.min(top, y + (viewport?.height ?? window.innerHeight) - (rect?.height ?? 64) - 8)) };
  };
  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary || drag.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-player-expand]") || (expanded && target.closest("button, input, select, textarea, a, [role='button'], [contenteditable='true']"))) return;
    const rect = panel.current!.getBoundingClientRect();
    suppressClick.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false };
    target.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    d.moved = true;
    suppressClick.current = true;
    setPosition(clamp(d.left + e.clientX - d.x, d.top + e.clientY - d.y));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  useLayoutEffect(() => {
    const fit = () => setPosition((p) => {
      const next = clamp(p?.left ?? 12, p?.top ?? window.innerHeight - 100);
      return p?.left === next.left && p?.top === next.top ? p : next;
    });
    fit();
    const observer = new ResizeObserver(fit);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
  }, []);
  return <div ref={panel} style={position ? { left: position.left, top: position.top } : { left: 12, bottom: 12 }}
    onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
    onKeyDownCapture={() => { suppressClick.current = false; }}
    onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } }}
    className={`fixed z-[55] border border-gray-200 bg-white shadow-xl ${expanded ? "w-[min(720px,calc(100vw-16px))] rounded-xl" : "h-16 w-16 rounded-full"}`}>
    {expanded && <div aria-label="プレイヤーをドラッグして移動" title="ここをつまんで移動" className="flex h-8 touch-none select-none cursor-grab items-center justify-center text-gray-400 active:cursor-grabbing"><GripHorizontal size={22} /></div>}
    <div className={expanded ? "" : "hidden"}>
      <button aria-label="プレイヤーを最小化" title="最小化" onClick={() => onExpanded(false)} className="absolute right-1 top-0 rounded p-1 text-gray-500 hover:bg-gray-100"><ChevronDown size={18} /></button>
      <div className="max-h-[min(65dvh,calc(100dvh-48px))] overflow-y-auto">{children}</div>
    </div>
    {!expanded && <>
      <button aria-label={playing ? "停止" : "再生"} title="タップで再生・停止、ドラッグで移動" onClick={onPlayback} className="absolute inset-0 flex touch-none select-none items-center justify-center rounded-full text-blue-600 hover:bg-blue-50">{playing ? <Pause className="pointer-events-none" size={26} /> : <Play className="pointer-events-none" size={26} />}</button>
      <button data-player-expand aria-label="プレイヤーを開く" title="プレイヤーを開く" onPointerDown={() => { suppressClick.current = false; }} onClick={() => onExpanded(true)} className="absolute -right-7 -top-3 flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-gray-600"><span className="pointer-events-none rounded-full border border-gray-200 bg-white p-1.5 shadow-sm"><Maximize2 size={17} /></span></button>
    </>}
  </div>;
}
