"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, GripHorizontal, Maximize2, Pause, Play } from "lucide-react";

export default function FloatingPlayer({ expanded, onExpanded, playing, onPlayback, children }: {
  expanded: boolean; onExpanded: (value: boolean) => void; playing: boolean; onPlayback: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const clamp = (left: number, top: number) => {
    const rect = panel.current?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
    return { left: Math.max(x + 8, Math.min(left, x + (viewport?.width ?? window.innerWidth) - (rect?.width ?? 64) - 8)), top: Math.max(y + 8, Math.min(top, y + (viewport?.height ?? window.innerHeight) - (rect?.height ?? 64) - 8)) };
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
    className={`fixed z-[55] border border-gray-200 bg-white shadow-xl ${expanded ? "w-[min(720px,calc(100vw-16px))] rounded-xl" : "h-16 w-16 rounded-full"}`}>
    <div aria-label="プレイヤーをドラッグして移動" title="ここをつまんで移動" className={`flex touch-none select-none items-center justify-center text-gray-400 ${expanded ? "h-6 cursor-grab active:cursor-grabbing" : "absolute left-3 right-3 top-0 h-5 cursor-grab"}`}
      onPointerDown={(e) => { if (e.button !== 0) return; const r = panel.current!.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); }}
      onPointerMove={(e) => { const d = drag.current; if (d) setPosition(clamp(d.left + e.clientX - d.x, d.top + e.clientY - d.y)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}><GripHorizontal size={18} /></div>
    <div className={expanded ? "" : "hidden"}>
      <button aria-label="プレイヤーを最小化" title="最小化" onClick={() => onExpanded(false)} className="absolute right-1 top-0 rounded p-1 text-gray-500 hover:bg-gray-100"><ChevronDown size={18} /></button>
      <div className="max-h-[min(65dvh,calc(100dvh-48px))] overflow-y-auto">{children}</div>
    </div>
    {!expanded && <>
      <button aria-label={playing ? "停止" : "再生"} onClick={onPlayback} className="absolute bottom-1 left-2 right-2 flex h-10 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50">{playing ? <Pause size={24} /> : <Play size={24} />}</button>
      <button aria-label="プレイヤーを開く" title="プレイヤーを開く" onClick={() => onExpanded(true)} className="absolute -right-1 -top-1 rounded-full border border-gray-200 bg-white p-1 text-gray-600 shadow-sm"><Maximize2 size={13} /></button>
    </>}
  </div>;
}
