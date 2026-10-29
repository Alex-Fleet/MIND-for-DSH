/**
 * Candidate literal paths for recovering a workspace whose recorded path has
 * been moved or whose session cwd uses a different spelling (symlinks,
 * macOS `/var` vs `/private/var`).
 *
 * The deepest existing ancestor is resolved through `realpath`, and the
 * missing suffix is re-appended.
 */
export declare function workspacePathCandidates(input: string): string[];
