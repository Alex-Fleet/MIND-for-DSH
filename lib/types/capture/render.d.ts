import type { CapturedTurn } from './types.js';
/**
 * Render one turn as a multi-line Markdown file.
 *
 * Every line is hard-wrapped so DSH's read tool (2000 chars/line) never
 * truncates the middle of a long tool result.
 */
export declare function renderTurnMarkdown(turn: CapturedTurn, wrapWidth: number): string;
/** Concatenate the text-bearing blocks of a message or content array. */
export declare function extractText(value: unknown): string;
/** Split every physical line into chunks no longer than `width` characters. */
export declare function hardWrap(text: string, width: number): string;
export declare function turnMachineLine(turn: CapturedTurn): string;
