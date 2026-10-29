/**
 * One-line fallback for a turn without an LLM index: the first user line in
 * the readable Markdown. Never expose the session id/hash as a title.
 */
export declare function previewFromMarkdown(markdown: string, maxChars?: number): string | null;
/** Read only the head of a raw turn and extract its preview. */
export declare function readTurnPreview(mindRoot: string, rawRelPath: string | null, maxChars?: number): string | null;
