export type TimedWord = {
  wordIndex: number;
  text: string;
  startChar: number;
  endChar: number;
  startMs: number;
  endMs: number;
  status: "matched" | "adjusted";
};

export type TimedLine = {
  lineId: number;
  startMs: number | null;
  endMs: number | null;
  status: "matched" | "partial" | "unmatched";
  words: TimedWord[];
};

export type UnitAlignment = {
  schemaVersion: 1;
  source: {
    tool: "mfa";
    audioDurationMs: number;
  };
  lines: TimedLine[];
  review: {
    matchedWords: number;
    totalScriptWords: number;
    unmatchedScriptWords: { lineId: number; text: string }[];
    unusedMfaWords: string[];
  };
};

export const inspectAlignmentTiming = (
  alignment: UnitAlignment,
  audioDurationSeconds?: number,
): string[] => {
  const warnings: string[] = [];
  const words = alignment.lines.flatMap((line) => line.words);
  const jsonEnd = alignment.source.audioDurationMs;
  const audioEnd = audioDurationSeconds ? audioDurationSeconds * 1000 : null;
  if (audioEnd && Math.abs(audioEnd - jsonEnd) > 500) {
    warnings.push(`音声とJSONの長さが${(Math.abs(audioEnd - jsonEnd) / 1000).toFixed(2)}秒異なります（音声${(audioEnd / 1000).toFixed(2)}秒／JSON${(jsonEnd / 1000).toFixed(2)}秒）。`);
  }
  const limit = audioEnd ?? jsonEnd;
  const outside = words.filter((word) => word.startMs < 0 || word.endMs > limit + 50);
  if (outside.length) warnings.push(`音声範囲外の単語${outside.length}語: ${outside.slice(0, 5).map((word) => word.text).join("、")}`);
  const invalid = words.filter((word) => !Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.endMs <= word.startMs);
  if (invalid.length) warnings.push(`時刻が不正、または長さが0以下の単語が${invalid.length}語あります。`);
  const reversed = words.filter((word, index) => index > 0 && word.startMs < words[index - 1].endMs - 30);
  if (reversed.length) warnings.push(`時刻の逆転・重複が${reversed.length}箇所あります。`);
  const unusual = words.filter((word) => word.endMs - word.startMs > 1500 || word.endMs - word.startMs < 20);
  if (unusual.length) warnings.push(`極端に長い・短い区間${unusual.length}語（要確認）: ${unusual.slice(0, 5).map((word) => word.text).join("、")}`);
  return warnings;
};

type ScriptToken = {
  lineId: number;
  text: string;
  startChar: number;
  endChar: number;
  normalized: string;
};

type MfaToken = {
  text: string;
  startMs: number;
  endMs: number;
  normalized: string;
};

const WORD_PATTERN =
  /[\p{L}\p{N}]+(?:(?:['’]|-(?!-))[\p{L}\p{N}]+)*/gu;

const normalizeToken = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");

const tokenDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[right.length];
};

const isNearMatch = (left: string, right: string) => {
  if (left === right) return true;
  const longest = Math.max(left.length, right.length);
  return longest >= 5 && tokenDistance(left, right) <= 1;
};

const readMfaWords = (value: unknown): { durationMs: number; words: MfaToken[] } => {
  if (!value || typeof value !== "object") {
    throw new Error("JSONの内容を読み取れません。");
  }
  const root = value as {
    end?: unknown;
    tiers?: { words?: { entries?: unknown } };
  };
  const entries = root.tiers?.words?.entries;
  if (!Array.isArray(entries)) {
    throw new Error("MFA JSONにwords.entriesがありません。");
  }

  const words = entries.flatMap((entry, index) => {
    if (
      !Array.isArray(entry) ||
      entry.length < 3 ||
      typeof entry[0] !== "number" ||
      typeof entry[1] !== "number" ||
      typeof entry[2] !== "string"
    ) {
      throw new Error(`MFA JSONの単語${index + 1}件目が不正です。`);
    }
    const text = entry[2];
    let parts = text.split(/--|[—–]/u).filter(Boolean);
    const attachedArticle = text.match(/^(.+)[’']a$/iu);
    if (parts.length === 1 && attachedArticle) {
      parts = [attachedArticle[1], "a"];
    }
    const startMs = Math.round(entry[0] * 1000);
    const endMs = Math.round(entry[1] * 1000);
    const totalWeight = parts.reduce(
      (sum, part) => sum + Math.max(normalizeToken(part).length, 1),
      0,
    );
    let consumedWeight = 0;
    return parts.map((part) => {
      const partStartMs = Math.round(
        startMs + ((endMs - startMs) * consumedWeight) / totalWeight,
      );
      consumedWeight += Math.max(normalizeToken(part).length, 1);
      const partEndMs = Math.round(
        startMs + ((endMs - startMs) * consumedWeight) / totalWeight,
      );
      return {
        startMs: partStartMs,
        endMs: partEndMs,
        text: part,
        normalized: normalizeToken(part),
      };
    });
  }).filter((word) => word.normalized);

  return {
    durationMs: typeof root.end === "number" ? Math.round(root.end * 1000) : 0,
    words,
  };
};

export const convertMfaAlignment = (
  sourceLines: string[],
  mfaJson: unknown,
): UnitAlignment => {
  const scriptTokens: ScriptToken[] = [];
  sourceLines.forEach((line, lineId) => {
    for (const match of line.matchAll(WORD_PATTERN)) {
      const text = match[0];
      const startChar = match.index ?? 0;
      scriptTokens.push({
        lineId,
        text,
        startChar,
        endChar: startChar + text.length,
        normalized: normalizeToken(text),
      });
    }
  });

  const { durationMs, words: mfaWords } = readMfaWords(mfaJson);
  const rows = scriptTokens.length + 1;
  const columns = mfaWords.length + 1;
  const scores = Array.from({ length: rows }, () => new Uint16Array(columns));
  const moves = Array.from({ length: rows }, () => new Uint8Array(columns));

  for (let i = 1; i < rows; i += 1) {
    scores[i][0] = i;
    moves[i][0] = 1;
  }
  for (let j = 1; j < columns; j += 1) {
    scores[0][j] = j;
    moves[0][j] = 2;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const same = isNearMatch(
        scriptTokens[i - 1].normalized,
        mfaWords[j - 1].normalized,
      );
      const diagonal = scores[i - 1][j - 1] + (same ? 0 : 2);
      const deleteScript = scores[i - 1][j] + 1;
      const skipMfa = scores[i][j - 1] + 1;
      const best = Math.min(diagonal, deleteScript, skipMfa);
      scores[i][j] = best;
      moves[i][j] = best === diagonal ? 0 : best === deleteScript ? 1 : 2;
    }
  }

  const matches = new Map<number, number>();
  const usedMfa = new Set<number>();
  let i = scriptTokens.length;
  let j = mfaWords.length;
  while (i > 0 || j > 0) {
    const move = moves[i][j];
    if (i > 0 && j > 0 && move === 0) {
      if (isNearMatch(scriptTokens[i - 1].normalized, mfaWords[j - 1].normalized)) {
        matches.set(i - 1, j - 1);
        usedMfa.add(j - 1);
      }
      i -= 1;
      j -= 1;
    } else if (i > 0 && (j === 0 || move === 1)) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const lines: TimedLine[] = sourceLines.map((_, lineId) => ({
    lineId,
    startMs: null,
    endMs: null,
    status: "unmatched",
    words: [],
  }));
  const unmatchedScriptWords: { lineId: number; text: string }[] = [];

  scriptTokens.forEach((token, tokenIndex) => {
    const mfaIndex = matches.get(tokenIndex);
    if (mfaIndex === undefined) {
      unmatchedScriptWords.push({ lineId: token.lineId, text: token.text });
      return;
    }
    const mfaWord = mfaWords[mfaIndex];
    const line = lines[token.lineId];
    line.words.push({
      wordIndex: line.words.length,
      text: token.text,
      startChar: token.startChar,
      endChar: token.endChar,
      startMs: mfaWord.startMs,
      endMs: mfaWord.endMs,
      status: token.normalized === mfaWord.normalized ? "matched" : "adjusted",
    });
  });

  lines.forEach((line, lineId) => {
    const expected = scriptTokens.filter((token) => token.lineId === lineId).length;
    if (line.words.length) {
      line.startMs = line.words[0].startMs;
      line.endMs = line.words[line.words.length - 1].endMs;
      line.status = line.words.length === expected ? "matched" : "partial";
    }
  });

  return {
    schemaVersion: 1,
    source: { tool: "mfa", audioDurationMs: durationMs },
    lines,
    review: {
      matchedWords: matches.size,
      totalScriptWords: scriptTokens.length,
      unmatchedScriptWords,
      unusedMfaWords: mfaWords
        .filter((_, index) => !usedMfa.has(index))
        .map((word) => word.text),
    },
  };
};
