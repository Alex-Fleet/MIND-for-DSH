import { beijingTimeOf } from '../time.js';
import { redactSecrets } from '../security/redact.js';
/**
 * One-line "what just happened" increment for the current turn.
 *
 * This is intentionally tiny (<200 chars): it is appended to the accepted
 * user batch once per turn instead of forcing the whole snapshot to change.
 */
export function buildIncrement(store, workspaceId, localDate) {
    // Subagent turns are raw-only; only main turns form the per-turn increment.
    const last = store.getLastMainTurn(workspaceId, localDate);
    if (last === undefined)
        return null;
    const time = beijingTimeOf(String(last.occurred_at ?? ''));
    const title = String(last.title ?? '(未摘要)');
    const rawPath = String(last.raw_rel_path ?? '');
    return redactSecrets(`[MIND] ${time} ${title}${rawPath === '' ? '' : ` · ${rawPath}`}`).slice(0, 200);
}
