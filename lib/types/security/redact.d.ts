export interface RedactionSegment {
    originalStart: number;
    originalEnd: number;
    redactedStart: number;
    redactedEnd: number;
    /** True when the segment is a replacement marker, not copied text. */
    redacted: boolean;
}
export interface RedactedText {
    text: string;
    segments: RedactionSegment[];
}
/**
 * Redact and retain a mapping between original and redacted character
 * offsets. Chunked readers use the mapping to keep a credential that crosses
 * a chunk boundary inside one redaction marker.
 */
export declare function redactWithSegments(input: string): RedactedText;
export declare function redactSecrets(text: string): string;
