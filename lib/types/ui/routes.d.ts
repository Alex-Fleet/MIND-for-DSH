import type { Context } from '@deepseek-ai/cordis';
import { type UiDeps } from './handler.js';
/**
 * Mount the MIND UI API on DSH's authenticated `/api` channel.
 *
 * Exact Fetch routes are the transport-safe choice: the Web page and the
 * desktop app both forward `/api/*` to the Host, while the shared `/api`
 * interceptor is already owned by the API Gateway. Connection admits only the
 * owner peer for these routes.
 *
 * Streaming request bodies keep a large authenticated upload from being
 * materialized before the size check; the reader stops at 512 KiB.
 */
export declare function registerUiRoutes(ctx: Context, deps: UiDeps, enabled: boolean): void;
