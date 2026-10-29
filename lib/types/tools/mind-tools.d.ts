import type { Store } from '../db/store.js';
interface ToolRegistry {
    register(definition: unknown): void;
}
export interface ToolAgentLike {
    id?: string;
    session?: {
        id?: string;
        header?: {
            cwd?: string;
        };
    };
}
export type WorkspaceResolver = (agent: ToolAgentLike | undefined) => string | null;
export interface RememberProposalInput {
    title: string;
    content: string;
    evidence?: string;
    origin?: 'user' | 'agent';
}
/**
 * Create a pending proposal through the same path the UI already reviews.
 * Never writes an active rule; the user must approve it.
 */
export declare function createRememberProposal(store: Store, workspaceId: string, input: RememberProposalInput): {
    id: string;
    title: string;
} | {
    error: string;
};
/**
 * Register the two model-facing retrieval tools.
 *
 * `mind_read_turn` pages through a captured turn by character offset, which
 * keeps working past DSH's 50KB/2000-char read limits. `mind_search` queries
 * the FTS5 turn index and returns raw paths.
 */
export declare function registerMindTools(tools: ToolRegistry, store: Store, mindRoot: string, resolveWorkspaceId: WorkspaceResolver): void;
export {};
