"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export default function ReaderPanels({ children, header, playerHeight, controlsHeight, side, onHeightChange, widthPercent, onWidthChange }: {
  children: ReactNode; header?: ReactNode; playerHeight: number; side: boolean; onHeightChange: (height: number) => void;
  widthPercent: number | null; onWidthChange: (width: number) => void;
  controlsHeight: number;
}) {
  const [height, setHeight] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y: number; height: number } | null>(null);
  const widthDrag = useRef<{ id: number; x: number; width: number } | null>(null);
  const resizeWidth = (pixels: number) => {
    const viewport = window.innerWidth;
    const minimum = Math.min(260, viewport * 0.4);
    const maximum = Math.min(viewport * 0.7, viewport - Math.min(320, viewport * 0.5));
    onWidthChange(Math.max(minimum, Math.min(maximum, pixels)) / viewport * 100);
  };
  const maximum = () => Math.max(96, (window.visualViewport?.height ?? window.innerHeight) - playerHeight - controlsHeight - 96);
  const resize = (value: number) => setHeight(Math.max(96, Math.min(maximum(), value)));
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const measure = () => onHeightChange(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange]);
  useEffect(() => {
    const fit = () => setHeight(value => value === null ? null : Math.max(96, Math.min(maximum(), value)));
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    fit();
    return () => {
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
    // The viewport limit also changes when the player docks or changes size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerHeight, controlsHeight]);
  useEffect(() => {
    if (widthPercent === null) return;
    const fit = () => resizeWidth(window.innerWidth * widthPercent / 100);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthPercent]);

  return <div ref={panel} data-reader-panels style={{
    "--reader-player-height": `${playerHeight}px`,
    "--reader-controls-height": `${controlsHeight}px`,
    "--reader-panel-default-max": height !== null ? "100dvh" : "50dvh",
    ...(height !== null ? { "--reader-panel-height": `${height}px` } : {}),
  } as CSSProperties}
    className={`reader-detail-panel relative z-40 flex h-[var(--reader-panel-height,auto)] max-h-[min(var(--reader-panel-default-max),calc(100dvh-var(--reader-player-height)-var(--reader-controls-height)-96px))] w-full shrink-0 flex-col overflow-hidden border-t border-gray-300 bg-white ${side ? "reader-detail-panel--side" : ""}`}>
    <div role="separator" aria-label="解説パネルの幅を調整" aria-orientation="vertical" tabIndex={0} aria-valuenow={widthPercent ?? undefined}
      className="reader-width-resize absolute inset-y-0 left-0 z-20 hidden w-2 touch-none cursor-ew-resize select-none hover:bg-blue-400/20 focus-visible:bg-blue-400/20 focus-visible:outline-none"
      onPointerDown={event => {
        if (event.button !== 0 || widthDrag.current) return;
        event.preventDefault();
        widthDrag.current = { id: event.pointerId, x: event.clientX, width: panel.current?.getBoundingClientRect().width ?? 320 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = widthDrag.current;
        if (start?.id === event.pointerId) resizeWidth(start.width + start.x - event.clientX);
      }}
      onPointerUp={event => {
        if (widthDrag.current?.id !== event.pointerId) return;
        widthDrag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { widthDrag.current = null; }} onLostPointerCapture={() => { widthDrag.current = null; }}
      onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const width = panel.current?.getBoundingClientRect().width ?? 320;
        resizeWidth(event.key === "Home" ? 0 : event.key === "End" ? window.innerWidth : width + (event.key === "ArrowLeft" ? 24 : -24));
      }} />
    <div role="separator" aria-label="パネルの高さを調整" aria-orientation="horizontal" tabIndex={0}
      aria-valuemin={96} aria-valuenow={height ?? undefined}
      className="reader-height-resize absolute inset-x-0 -top-1 z-20 h-3 touch-none cursor-ns-resize select-none bg-transparent after:absolute after:inset-x-0 after:top-1 after:h-px after:bg-transparent hover:after:bg-blue-400 focus-visible:outline-none focus-visible:after:bg-blue-500 active:after:bg-blue-500"
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        drag.current = { id: event.pointerId, y: event.clientY, height: panel.current?.getBoundingClientRect().height ?? 240 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start?.id === event.pointerId) resize(start.height + start.y - event.clientY);
      }}
      onPointerUp={event => {
        if (drag.current?.id !== event.pointerId) return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const current = panel.current?.getBoundingClientRect().height ?? 240;
        resize(event.key === "Home" ? 96 : event.key === "End" ? maximum() : current + (event.key === "ArrowUp" ? 24 : -24));
      }}>
    </div>
    {header}
    <div className="flex min-h-0 flex-auto flex-col overflow-hidden">{children}</div>
  </div>;
}
