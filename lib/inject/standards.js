import fs from 'node:fs';
import path from 'node:path';
export const STANDARD_FILES = [
    'behavior-standards.md',
    'programming-standards.md',
    'checklists-index.md',
    'exps-index.md',
    'user-profile.md',
];
/**
 * Load the three standards files, re-reading only when their mtimes change.
 * Missing files are skipped; an entirely empty directory yields a short
 * explicit notice instead of silently injecting nothing.
 */
export function createStandardsProvider(dir) {
    let cachedMtime = -1;
    let cached = '';
    return () => {
        let latest = 0;
        for (const file of STANDARD_FILES) {
            try {
                latest = Math.max(latest, fs.statSync(path.join(dir, file)).mtimeMs);
            }
            catch {
                // missing file: handled below
            }
        }
        if (latest === cachedMtime)
            return cached;
        const parts = [];
        for (const file of STANDARD_FILES) {
            try {
                const text = fs.readFileSync(path.join(dir, file), 'utf8').trim();
                if (text !== '')
                    parts.push(`<!-- ${file} -->\n${text}`);
            }
            catch {
                // skip missing file
            }
        }
        cachedMtime = latest;
        cached =
            parts.length === 0
                ? `[MIND] 未找到规范文件。请把 behavior-standards.md / programming-standards.md / checklists-index.md / exps-index.md / user-profile.md 放到 ${dir}。`
                : parts.join('\n\n---\n\n');
        return cached;
    };
}
