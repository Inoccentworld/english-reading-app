import type { UnitAlignment } from "./mfaAlignment";

// Keep the original spacing between words; never fabricate equal-length words.
export function editLineTiming(alignment: UnitAlignment, lineId: number, startMs: number, endMs?: number): UnitAlignment {
  const line = alignment.lines.find((item) => item.lineId === lineId);
  if (!line || line.startMs === null || line.endMs === null) throw new Error("この行には時間情報がありません。");
  const end = endMs ?? line.endMs + startMs - line.startMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(end) || startMs < 0 || end <= startMs || end > alignment.source.audioDurationMs) {
    throw new Error("開始・終了を音声の範囲内で指定してください（開始 < 終了）。");
  }
  const scale = endMs === undefined ? 1 : (end - startMs) / (line.endMs - line.startMs);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("元の行の時間範囲が不正です。");
  const map = (time: number) => Math.round(startMs + (time - line.startMs!) * scale);
  return { ...alignment, lines: alignment.lines.map((item) => item.lineId !== lineId ? item : {
    ...item, startMs: Math.round(startMs), endMs: Math.round(end),
    words: item.words.map((word) => ({ ...word, startMs: map(word.startMs), endMs: map(word.endMs), status: "adjusted" })),
  }) };
}

export function timingBoundaryWarnings(alignment: UnitAlignment, lineId: number): string[] {
  const index = alignment.lines.findIndex((line) => line.lineId === lineId);
  const line = alignment.lines[index];
  if (!line || line.startMs === null || line.endMs === null) return [];
  const previous = alignment.lines[index - 1];
  const next = alignment.lines[index + 1];
  const warnings: string[] = [];
  if (previous?.endMs != null && previous.endMs > line.startMs) warnings.push("前の行と重なっています。前の行の終了点も確認してください。");
  if (next?.startMs != null && next.startMs < line.endMs) warnings.push("次の行と重なっています。この行の終了点か、次の行の開始点も確認してください。");
  if (line.words.some((word) => word.startMs < line.startMs! || word.endMs > line.endMs! || word.endMs <= word.startMs)) warnings.push("行の範囲外・長さが不正な単語があります。単語の時間も確認してください。");
  if (line.words.some((word, i) => i > 0 && word.startMs < line.words[i - 1].endMs)) warnings.push("単語同士が重なっています。隣の単語の開始・終了も確認してください。");
  return warnings;
}
