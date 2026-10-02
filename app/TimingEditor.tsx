"use client";
import { useState } from "react";
import type { UnitAlignment } from "@/lib/mfaAlignment";
import { editLineTiming, timingBoundaryWarnings } from "@/lib/timingEdits";

const formatTime = (ms: number) => {
  const centiseconds = Math.round(ms / 10);
  return `${Math.floor(centiseconds / 6000)}:${((centiseconds % 6000) / 100).toFixed(2).padStart(5, "0")}`;
};
const parseTime = (value: string) => {
  const match = value.trim().match(/^(\d+):([0-5]?\d(?:\.\d{1,3})?)$/);
  return match ? (Number(match[1]) * 60 + Number(match[2])) * 1000 : NaN;
};

export default function TimingEditor({ alignment, lineId, onLine, currentTime, onChange, onSeek, onSave, onCancel, onReset }: {
  alignment: UnitAlignment; lineId: number | null; currentTime: () => number;
  onLine: (id: number) => void; onChange: (value: UnitAlignment) => void;
  onSeek: (seconds: number) => void; onSave: () => Promise<void>; onCancel: () => void; onReset: () => void;
}) {
  const [wordIndex, setWordIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<UnitAlignment[]>([]);
  const line = alignment.lines.find((item) => item.lineId === lineId);
  const lineIndex = alignment.lines.findIndex((item) => item.lineId === lineId);
  const previousLine = alignment.lines[lineIndex - 1];
  const nextLine = alignment.lines[lineIndex + 1];
  const word = line?.words.find((item) => item.wordIndex === wordIndex);
  const start = word?.startMs ?? line?.startMs;
  const end = word?.endMs ?? line?.endMs;
  const suggestNeighbor = (neighborId: number, boundary: "start" | "end", ms: number) => {
    try {
      const neighbor = alignment.lines.find((item) => item.lineId === neighborId);
      if (neighbor?.startMs == null) throw new Error("隣の行には時間情報がありません。");
      // Keep the other boundary fixed: changing one shared boundary should not
      // propagate a translation of the entire neighboring line.
      const next = boundary === "start"
        ? editLineTiming(alignment, neighborId, ms, neighbor.endMs ?? undefined)
        : editLineTiming(alignment, neighborId, neighbor.startMs, ms);
      setHistory((items) => [...items.slice(-49), alignment]);
      onChange(next); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "隣の行の変更に失敗しました。"); }
  };
  const apply = (boundary: "start" | "end", ms: number) => {
    if (!line || start == null || end == null) return;
    if (Math.round(ms) === (boundary === "start" ? start : end)) return;
    try {
      let next: UnitAlignment;
      if (word) {
        const a = boundary === "start" ? ms : word.startMs;
        const b = boundary === "end" ? ms : word.endMs;
        if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a || b > alignment.source.audioDurationMs) throw new Error("開始 < 終了となる、音声内の時間を指定してください。");
        next = { ...alignment, lines: alignment.lines.map((item) => item.lineId !== line.lineId ? item : {
          ...item, words: item.words.map((w) => w.wordIndex !== word.wordIndex ? w : { ...w, startMs: Math.round(a), endMs: Math.round(b), status: "adjusted" }),
        }) };
      } else next = boundary === "start" ? editLineTiming(alignment, line.lineId, ms) : editLineTiming(alignment, line.lineId, line.startMs!, ms);
      setHistory((items) => [...items.slice(-49), alignment]);
      onChange(next); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "時間の変更に失敗しました。"); }
  };
  return <section className="mb-2 max-h-[38vh] overflow-y-auto border-b border-gray-200 pb-2 text-xs" aria-label="タイミング編集">
    <div className="flex flex-wrap items-center gap-2">
      <strong>タイミング編集</strong>
      <button disabled={!previousLine || saving} onClick={() => { onLine(previousLine.lineId); setWordIndex(null); setError(""); }} className="rounded border px-2 py-1 disabled:opacity-40">前の行</button>
      <button disabled={!nextLine || saving} onClick={() => { onLine(nextLine.lineId); setWordIndex(null); setError(""); }} className="rounded border px-2 py-1 disabled:opacity-40">次の行</button>
      <select aria-label="編集する行" value={lineId ?? ""} onChange={(e) => { onLine(Number(e.target.value)); setWordIndex(null); setError(""); }} className="min-w-0 max-w-56 rounded border p-1">
        <option value="" disabled>行を選択</option>
        {alignment.lines.map((item, i) => <option key={item.lineId} value={item.lineId}>{i + 1}行: {item.words.map((w) => w.text).join(" ").slice(0, 40)}</option>)}
      </select>
      <select aria-label="行または単語を編集" value={word ? wordIndex! : "line"} onChange={(e) => setWordIndex(e.target.value === "line" ? null : Number(e.target.value))} className="max-w-40 rounded border p-1">
        <option value="line">行全体</option>
        {line?.words.map((w) => <option key={w.wordIndex} value={w.wordIndex}>{w.text}</option>)}
      </select>
    </div>
    {line && start != null && end != null ? <>
      {(["start", "end"] as const).map((boundary) => <div key={`${lineId}:${wordIndex}:${boundary}`} className="mt-1 flex flex-wrap items-center gap-1">
        <span className="w-8">{boundary === "start" ? "開始" : "終了"}</span>
        <input aria-label={`${boundary === "start" ? "開始" : "終了"}時刻（分:秒）`} type="text" placeholder="0:00.00" key={boundary === "start" ? start : end} defaultValue={formatTime(boundary === "start" ? start : end)} onBlur={(e) => {
          const ms = parseTime(e.target.value);
          if (!Number.isFinite(ms)) { setError("時刻は 分:秒 で入力してください（例: 1:23.45）。"); return; }
          apply(boundary, ms);
        }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} className="w-24 rounded border px-1 py-0.5 tabular-nums" />
        <button onClick={() => apply(boundary, currentTime() * 1000)} className="rounded bg-blue-50 px-2 py-1 text-blue-700">現在位置に設定</button>
        <button onClick={() => apply(boundary, (boundary === "start" ? start : end) - 100)} className="rounded border px-2 py-1">−0.1秒</button>
        <button onClick={() => apply(boundary, (boundary === "start" ? start : end) + 100)} className="rounded border px-2 py-1">＋0.1秒</button>
        <button title="設定した時刻へシークします。時間データは変更しません。" onClick={() => onSeek((boundary === "start" ? start : end) / 1000)} className="px-2 py-1 text-gray-500">音声をここへ移動</button>
      </div>)}
      {timingBoundaryWarnings(alignment, line.lineId).map((message) => <p key={message} className="mt-1 text-amber-700">要確認: {message}</p>)}
      {previousLine?.endMs != null && line.startMs != null && previousLine.endMs !== line.startMs && <button
        className="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-800"
        onClick={() => suggestNeighbor(previousLine.lineId, "end", line.startMs!)}
      >前の行の終了を {formatTime(line.startMs)} にそろえる</button>}
      {nextLine?.startMs != null && line.endMs != null && nextLine.startMs !== line.endMs && <button
        className="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-800"
        onClick={() => suggestNeighbor(nextLine.lineId, "start", line.endMs!)}
      >次の行の開始を {formatTime(line.endMs)} にそろえる</button>}
    </> : <p className="my-2 text-gray-500">時間情報のある行を選んでください。</p>}
    {error && <p role="alert" className="mt-1 text-red-600">{error}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      <button disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await onSave(); } catch (e) { setError(e instanceof Error ? e.message : "保存に失敗しました。"); } finally { setSaving(false); } }} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">{saving ? "保存中…" : "保存して閉じる"}</button>
      <button disabled={saving} onClick={onCancel}>キャンセル</button>
      <button title="1操作ずつ戻します。繰り返し押せます（最大50操作）。" disabled={!history.length || saving} onClick={() => { onChange(history[history.length - 1]); setHistory((items) => items.slice(0, -1)); setError(""); }} className="disabled:opacity-40">取り消し</button>
      <button disabled={saving} onClick={() => { if (confirm("すべての時間修正を元のMFAデータに戻しますか？ 保存するまで確定しません。")) { setHistory((items) => [...items.slice(-49), alignment]); onReset(); } }} className="text-gray-500">元のMFAに戻す</button>
    </div>
  </section>;
}
