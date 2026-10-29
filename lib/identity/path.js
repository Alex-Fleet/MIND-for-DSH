import fs from 'node:fs';
import path from 'node:path';
/**
 * Candidate literal paths for recovering a workspace whose recorded path has
 * been moved or whose session cwd uses a different spelling (symlinks,
 * macOS `/var` vs `/private/var`).
 *
 * The deepest existing ancestor is resolved through `realpath`, and the
 * missing suffix is re-appended.
 */
export function workspacePathCandidates(input) {
    const candidates = new Set();
    const absolute = path.resolve(input);
    candidates.add(absolute);
    let current = absolute;
    const missing = [];
    for (;;) {
        try {
            const real = fs.realpathSync(current);
            candidates.add(path.join(real, ...missing));
            break;
        }
        catch {
            const parent = path.dirname(current);
            if (parent === current)
                break;
            missing.unshift(path.basename(current));
            current = parent;
        }
    }
    return [...candidates];
}
