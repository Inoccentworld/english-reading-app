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
