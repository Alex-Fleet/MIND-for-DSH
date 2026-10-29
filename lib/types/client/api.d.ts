export declare class ApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/**
 * Call one Host endpoint. The desktop shell forwards `/api/*` to the local
 * Host, so a document-relative URL works in both the Web and desktop builds.
 */
export declare function callApi<T>(endpoint: string, payload?: unknown, signal?: AbortSignal): Promise<T>;
