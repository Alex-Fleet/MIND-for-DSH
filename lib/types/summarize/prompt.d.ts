import type { CapturedTurn } from '../capture/types.js';
export declare const SUMMARY_MAX_INPUT_CHARS = 30000;
/**
 * Build the capture subagent prompt.
 *
 * The child sees the readable turn file (hard-wrapped, complete content up to
 * the input cap) and returns one structured index entry. It never writes files
 * and never produces prose outside the JSON object.
 */
export declare function buildSummaryPrompt(turn: CapturedTurn, markdown: string): string;
