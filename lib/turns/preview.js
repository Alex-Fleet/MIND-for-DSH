import fs from 'node:fs';
import path from 'node:path';
/**
 * One-line fallback for a turn without an LLM index: the first user line in
 * the readable Markdown. Never expose the session id/hash as a title.
 */
export function previewFromMarkdown(markdown, maxChars = 80) {
    // Only conversation sections qualify: the file header contains metadata
    // lines such as "- 开始: ..." that must never become a title.
    for (const heading of ['## 用户', '## 助手']) {
        const start = markdown.indexOf(heading);
        if (start < 0)
            continue;
        const after = markdown.slice(start + heading.length);
        const next = after.search(/\n## /);
        const body = next < 0 ? after : after.slice(0, next);
        for (const line of body.split('\n')) {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('#'))
                continue;
            return trimmed.slice(0, maxChars);
        }
    }
    return null;
}
/** Read only the head of a raw turn and extract its preview. */
export function readTurnPreview(mindRoot, rawRelPath, maxChars = 80) {
    if (rawRelPath === null || rawRelPath === '')
        return null;
    const root = path.resolve(mindRoot);
    const target = path.resolve(root, rawRelPath);
    if (!target.startsWith(root + path.sep))
        return null;
    try {
        const fd = fs.openSync(target, 'r');
        const buffer = Buffer.allocUnsafe(8192);
        const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);
        return previewFromMarkdown(buffer.subarray(0, bytes).toString('utf8'), maxChars);
    }
    catch {
        return null;
    }
}
