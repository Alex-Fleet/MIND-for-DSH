export interface TurnSummary {
    title: string;
    conclusion: string;
    topics: string[];
}
/**
 * Parse the capture subagent's JSON. Models occasionally wrap the object in a
 * fence or add a sentence, so extract the first balanced-looking object and
 * validate every field; anything malformed returns null and the job retries.
 *
 * The summary is an index only. Memory proposals are owned by the main agent
 * through the `mind_remember` tool, not by this background summarizer.
 */
export declare function parseSummary(raw: string): TurnSummary | null;
