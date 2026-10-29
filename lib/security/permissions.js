import fs from 'node:fs';
import path from 'node:path';
/** Top-level directories MIND owns inside its root. */
const OWNED_DIRS = ['projects', 'global', 'daily', 'weekly', 'monthly', 'logs', 'index'];
/** Files whose mode MIND manages directly under the root. */
function isOwnedFile(name) {
    return name === 'settings.json' || /^mind\.db(?:-(?:wal|shm))?$/.test(name);
}
/**
 * Harden directories and data files created by older builds.
 *
 * Only MIND-owned top-level directories are touched: a custom mindRoot may
 * point at a shared or pre-existing directory, and recursively chmodding all
 * of it would break unrelated tools.
 */
export function hardenDirectoryTree(root) {
    let changed = 0;
    const chmod = (target, mode) => {
        try {
            fs.chmodSync(target, mode);
            changed += 1;
        }
        catch {
            // A missing or exotic filesystem entry must not abort startup.
        }
    };
    const walk = (dir) => {
        chmod(dir, 0o700);
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isSymbolicLink())
                continue;
            const target = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(target);
            }
            else if (entry.isFile()) {
                chmod(target, 0o600);
            }
        }
    };
    for (const name of OWNED_DIRS) {
        const target = path.join(root, name);
        try {
            // lstat: a symlink named `projects` must not lead us into an unrelated
            // directory tree.
            const stat = fs.lstatSync(target);
            if (stat.isDirectory() && !stat.isSymbolicLink())
                walk(target);
        }
        catch {
            // Not present in this vault version.
        }
    }
    try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (entry.isFile() && isOwnedFile(entry.name))
                chmod(path.join(root, entry.name), 0o600);
        }
    }
    catch {
        // Root unreadable; the Store will surface a clearer error.
    }
    return changed;
}
