/**
 * Project DSH's user-visible workspace titles onto MIND's identity rows.
 * The automatic `default-workspace` title is stored verbatim; the client
 * localizes it with {@link displayWorkspaceName} in the reader's language.
 */
export function syncDshWorkspaceNames(store, records) {
    let changed = 0;
    for (const record of records) {
        const workspacePath = typeof record.path === 'string' ? record.path : '';
        const title = typeof record.title === 'string' ? record.title : '';
        if (workspacePath === '' || title === '')
            continue;
        const match = store.findWorkspaceByActivePath(workspacePath) ??
            store.findWorkspaceByPath(workspacePath);
        if (match === undefined)
            continue;
        store.updateWorkspaceDisplayName(String(match.workspace_id), title);
        changed += 1;
    }
    return changed;
}
/** The label the DSH UI shows for a stored workspace title. */
export function displayWorkspaceName(name, language) {
    if (name !== 'default-workspace')
        return name;
    return language.toLowerCase().startsWith('zh') ? '默认工作区' : 'Default Workspace';
}
