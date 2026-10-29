export declare const STANDARD_FILES: readonly ["behavior-standards.md", "programming-standards.md", "checklists-index.md", "exps-index.md", "user-profile.md"];
/**
 * Load the three standards files, re-reading only when their mtimes change.
 * Missing files are skipped; an entirely empty directory yields a short
 * explicit notice instead of silently injecting nothing.
 */
export declare function createStandardsProvider(dir: string): () => string;
