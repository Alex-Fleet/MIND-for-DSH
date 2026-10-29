/**
 * Harden directories and data files created by older builds.
 *
 * Only MIND-owned top-level directories are touched: a custom mindRoot may
 * point at a shared or pre-existing directory, and recursively chmodding all
 * of it would break unrelated tools.
 */
export declare function hardenDirectoryTree(root: string): number;
