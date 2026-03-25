export interface TtsPlaybackPlanInput {
  text: string;
  maxSegmentLength?: number;
}

export interface TtsPlaybackSegment {
  index: number;
  text: string;
  charLength: number;
}

export interface TtsPlaybackPlan {
  sourceText: string;
  plainText: string;
  segments: TtsPlaybackSegment[];
}

const DEFAULT_MAX_SEGMENT_LENGTH = 240;

export function stripMarkdownForTts(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^[\t ]*[-*+]\s+/gm, "")
    .replace(/^[\t ]*\d+\.\s+/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/([.!?])\s*\.\s+/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLongSegment(text: string, maxSegmentLength: number): string[] {
  if (text.length <= maxSegmentLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxSegmentLength) {
    const candidate = remaining.slice(0, maxSegmentLength + 1);
    const breakpoints = [
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("! "),
      candidate.lastIndexOf("? "),
      candidate.lastIndexOf("; "),
      candidate.lastIndexOf(": "),
      candidate.lastIndexOf(", "),
      candidate.lastIndexOf(" "),
    ];
    const breakpoint = breakpoints.find((index) => index >= Math.floor(maxSegmentLength * 0.5)) ?? maxSegmentLength;
    const sliceLength = breakpoint === maxSegmentLength ? maxSegmentLength : breakpoint + 1;
    const part = remaining.slice(0, sliceLength).trim();
    if (part) chunks.push(part);
    remaining = remaining.slice(sliceLength).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function segmentPlainTextForTts(plainText: string, maxSegmentLength: number): string[] {
  if (!plainText) return [];

  const sentences = plainText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [plainText];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .flatMap((sentence) => splitLongSegment(sentence, maxSegmentLength));
}

export function segmentTextForTts(text: string, options: { maxSegmentLength?: number } = {}): string[] {
  const maxSegmentLength = Math.max(1, options.maxSegmentLength ?? DEFAULT_MAX_SEGMENT_LENGTH);
  const plainText = stripMarkdownForTts(text);
  return segmentPlainTextForTts(plainText, maxSegmentLength);
}

export function createTtsPlaybackPlan(input: TtsPlaybackPlanInput): TtsPlaybackPlan {
  const plainText = stripMarkdownForTts(input.text);
  const maxSegmentLength = Math.max(1, input.maxSegmentLength ?? DEFAULT_MAX_SEGMENT_LENGTH);
  const segments = segmentPlainTextForTts(plainText, maxSegmentLength).map((segment, index) => ({
    index,
    text: segment,
    charLength: segment.length,
  }));

  return {
    sourceText: input.text,
    plainText,
    segments,
  };
}
