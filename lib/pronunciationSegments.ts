export type PronunciationSegment = {
  text: string;
  isWhitespace: boolean;
};

const SEGMENT_PATTERN =
  /\s+|\p{N}+(?:[,.]\p{N}+)*(?:[\p{L}\p{M}]+)?[%％]?|[\p{L}\p{M}\p{N}]+(?:['’ʼ-][\p{L}\p{M}\p{N}]+)*|[^\s]/gu;

export const segmentPronunciationLine = (
  line: string,
): PronunciationSegment[] =>
  Array.from(line.matchAll(SEGMENT_PATTERN), ([text]) => ({
    text,
    isWhitespace: /^\s+$/u.test(text),
  }));

export const getSpokenSegments = (line: string) =>
  segmentPronunciationLine(line).filter((segment) => !segment.isWhitespace);

const SPOKEN_SYMBOLS = new Set(["&", "+", "=", "$", "£", "€", "¥", "@", "#", "%"]);

export const isPronounceableSegment = (segment: PronunciationSegment) =>
  !segment.isWhitespace &&
  (/\p{L}|\p{N}/u.test(segment.text) || SPOKEN_SYMBOLS.has(segment.text));

export const getPronounceableSegments = (line: string) =>
  segmentPronunciationLine(line).filter(isPronounceableSegment);
