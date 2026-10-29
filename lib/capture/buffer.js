/**
 * Per-session turn accumulator.
 *
 * `turn/end` carries only `{ turn, reason }`; the messages and tool events
 * arrive before it. Buffering them per session lets the capture layer persist
 * a complete turn when the end marker arrives.
 */
export class TurnBuffer {
    open = new Map();
    push(session, event) {
        const sessionId = String(session.id);
        if (event.type === 'turn/start') {
            const data = asRecord(event.data);
            const turn = numberOr(data?.turn, 0);
            const previous = this.open.get(sessionId);
            this.open.set(sessionId, {
                sessionId,
                turn,
                startedAt: numberOr(event.time, Date.now()),
                origin: session.header?.origin === 'subagent' ? 'subagent' : 'main',
                workspacePath: session.header?.cwd ?? null,
                events: [],
            });
            // A new turn arrived before the previous end marker: close it as unknown.
            return previous === undefined ? null : finalize(previous, 'aborted_unknown');
        }
        const current = this.open.get(sessionId);
        if (current === undefined)
            return null;
        if (event.type === 'turn/end') {
            const data = asRecord(event.data);
            const reason = asRecord(data?.reason);
            const kind = typeof reason?.kind === 'string' ? reason.kind : 'unknown';
            this.open.delete(sessionId);
            return finalize(current, kind, numberOr(event.time, Date.now()));
        }
        current.events.push({
            type: event.type,
            seq: typeof event.seq === 'number' ? event.seq : null,
            occurredAt: numberOr(event.time, Date.now()),
            data: event.data,
        });
        return null;
    }
    /** Close every open turn (shutdown / hot reload) without losing it. */
    flushAll() {
        const turns = [];
        for (const open of this.open.values()) {
            turns.push(finalize(open, 'aborted_unknown'));
        }
        this.open.clear();
        return turns;
    }
    size() {
        return this.open.size;
    }
}
function finalize(open, reason, endedAt = Date.now()) {
    return {
        sessionId: open.sessionId,
        turn: open.turn,
        startedAt: open.startedAt,
        endedAt,
        endReason: reason,
        origin: open.origin,
        workspacePath: open.workspacePath,
        events: open.events,
    };
}
function asRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function numberOr(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
