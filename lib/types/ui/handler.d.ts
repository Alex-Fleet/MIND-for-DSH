import type { PersistedSettings, ResolvedConfig } from '../config.js';
import type { Store } from '../db/store.js';
export declare const UI_ENDPOINTS: readonly ["timeline", "day", "turn", "current", "workspaces", "reports", "report", "proposals", "resolveProposal", "settings", "updateSettings", "saveEntry"];
export type UiEndpoint = (typeof UI_ENDPOINTS)[number];
export interface UiDeps {
    store: Store;
    config: ResolvedConfig;
    saveSettings: (settings: PersistedSettings) => void;
    /** Pull renamed DSH workspace titles into MIND before reading names. */
    refreshWorkspaceNames?: () => void;
}
export interface UiErrorBody {
    code: string;
    message: string;
}
export type UiResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: UiErrorBody;
};
/** Dispatch one UI request without touching HTTP framing. */
export declare function handleUiRequest(deps: UiDeps, endpoint: string, payload: unknown): Promise<UiResult>;
