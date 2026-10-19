import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Store } from '../db/store.js'

export interface ResolvedWorkspace {
  workspaceId: string
  workspacePath: string
  volumeUuid: string
  inode: number
  confidence: 'primary' | 'marker' | 'git' | 'low'
  created: boolean
}

interface GitIdentity {
  remote: string | null
  rootCommit: string | null
}

const volumeCache = new Map<number, string>()

/**
 * Resolve a workspace path to a stable logical identity.
 *
 * Primary identity is (volume UUID, inode): rename and same-volume moves keep
 * it. Copy detection compares the old location's inode with the one currently
 * at the old path: if the old path still holds a different directory, this is
 * a copy and forks a new identity. Marker and git identity are fallbacks for
 * copies / cross-volume moves.
 */
export function resolveWorkspace(
  store: Store,
  inputPath: string,
  options: { writeMarker?: boolean } = {},
): ResolvedWorkspace {
  const workspacePath = realpath(inputPath)
  const stat = fs.statSync(workspacePath)
  const volumeUuid = volumeUuidFor(stat.dev, workspacePath)
  const inode = stat.ino

  const existing = store.findActiveLocation(volumeUuid, inode)
  if (existing !== undefined) {
    const locationId = String(existing.location_id)
    const workspaceId = String(existing.workspace_id)
    const oldPath = String(existing.current_path ?? '')
    const oldInode = oldPath === '' ? null : inodeOf(oldPath)

    // Same inode still reachable at a different path is impossible for dirs;
    // treat it as a rebind. If the old path holds a different directory, the
    // current path is a copy and must not inherit the old history.
    if (oldPath !== '' && oldPath !== workspacePath && oldInode !== null && oldInode !== inode) {
      const forkedMarker = readMarker(workspacePath)
      const forked = createWorkspace(store, workspacePath, forkedMarker, gitIdentity(workspacePath))
      bind(store, forked, workspacePath, volumeUuid, inode, 'primary', options.writeMarker === true, forkedMarker)
      return { workspaceId: forked, workspacePath, volumeUuid, inode, confidence: 'primary', created: true }
    }

    store.updateLocationPath(locationId, workspacePath)
    store.recordPath(workspaceId, workspacePath)
    if (options.writeMarker === true) ensureMarker(store, workspaceId, workspacePath, null)
    return { workspaceId, workspacePath, volumeUuid, inode, confidence: 'primary', created: false }
  }

  const marker = readMarker(workspacePath)
  const git = gitIdentity(workspacePath)
  const candidate =
    (marker === null ? undefined : store.findWorkspaceByMarker(marker)) ??
    (git === null ? undefined : store.findWorkspaceByGit(git.remote, git.rootCommit))

  if (candidate !== undefined) {
    const workspaceId = String(candidate.workspace_id)
    const locations = store.listLocations(workspaceId)
    const oldPathStillExists = locations.some(location => {
      const oldPath = String(location.current_path ?? '')
      return oldPath !== '' && oldPath !== workspacePath && inodeOf(oldPath) !== null
    })

    if (oldPathStillExists) {
      // A copy: fork so the two histories never share a row.
      const forked = createWorkspace(store, workspacePath, marker, git)
      bind(store, forked, workspacePath, volumeUuid, inode, marker === null ? 'git' : 'marker', options.writeMarker === true, marker)
      return { workspaceId: forked, workspacePath, volumeUuid, inode, confidence: marker === null ? 'git' : 'marker', created: true }
    }

    for (const location of locations) store.retireLocation(String(location.location_id))
    const confidence = marker === null ? 'git' : 'marker'
    bind(store, workspaceId, workspacePath, volumeUuid, inode, confidence, options.writeMarker === true, marker)
    return { workspaceId, workspacePath, volumeUuid, inode, confidence, created: false }
  }

  const workspaceId = createWorkspace(store, workspacePath, marker, git)
  bind(store, workspaceId, workspacePath, volumeUuid, inode, 'low', options.writeMarker === true, marker)
  return { workspaceId, workspacePath, volumeUuid, inode, confidence: 'low', created: true }
}

function createWorkspace(store: Store, workspacePath: string, marker: string | null, git: GitIdentity | null): string {
  const workspaceId = crypto.randomUUID()
  store.upsertWorkspaceIdentity({
    workspaceId,
    displayName: path.basename(workspacePath) || workspacePath,
    markerId: marker,
    gitRemote: git?.remote ?? null,
    gitRootCommit: git?.rootCommit ?? null,
  })
  return workspaceId
}

function bind(
  store: Store,
  workspaceId: string,
  workspacePath: string,
  volumeUuid: string,
  inode: number,
  confidence: string,
  writeMarkerFile: boolean,
  markerId: string | null,
): void {
  store.upsertLocation({
    locationId: `${workspaceId}:${volumeUuid}:${inode}`,
    workspaceId,
    volumeUuid,
    inode,
    currentPath: workspacePath,
    confidence,
  })
  store.recordPath(workspaceId, workspacePath)
  if (writeMarkerFile) ensureMarker(store, workspaceId, workspacePath, markerId)
}

function ensureMarker(store: Store, workspaceId: string, workspacePath: string, markerId: string | null): void {
  const value = markerId ?? workspaceId
  if (markerId === null) {
    store.upsertWorkspaceIdentity({
      workspaceId,
      displayName: path.basename(workspacePath) || workspacePath,
      markerId: value,
    })
  }
  writeMarker(workspacePath, value)
}

function realpath(inputPath: string): string {
  try {
    return fs.realpathSync(inputPath)
  } catch {
    return path.resolve(inputPath)
  }
}

function inodeOf(target: string): number | null {
  try {
    return fs.statSync(target).ino
  } catch {
    return null
  }
}

function volumeUuidFor(dev: number, workspacePath: string): string {
  const cached = volumeCache.get(dev)
  if (cached !== undefined) return cached
  let uuid: string | null = null
  if (process.platform === 'darwin') {
    try {
      const output = execFileSync('diskutil', ['info', workspacePath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const match = output.match(/Volume UUID:\s+([0-9A-Fa-f-]+)/)
      if (match?.[1] !== undefined) uuid = match[1]
    } catch {
      // fall through to the device id
    }
  }
  const value = uuid ?? `dev:${dev}`
  volumeCache.set(dev, value)
  return value
}

function readMarker(workspacePath: string): string | null {
  try {
    const value = fs.readFileSync(path.join(workspacePath, '.mind', 'workspace-id'), 'utf8').trim()
    return value === '' ? null : value
  } catch {
    return null
  }
}

function writeMarker(workspacePath: string, workspaceId: string): void {
  try {
    fs.mkdirSync(path.join(workspacePath, '.mind'), { recursive: true })
    fs.writeFileSync(path.join(workspacePath, '.mind', 'workspace-id'), `${workspaceId}\n`, 'utf8')
  } catch {
    // optional enhancement only
  }
}

/** Git identity only for a workspace that is the repository root. */
function gitIdentity(workspacePath: string): GitIdentity | null {
  try {
    const root = execFileSync('git', ['-C', workspacePath, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (root === '' || realpath(root) !== workspacePath) return null

    let remote: string | null = null
    try {
      remote = normalizeRemote(
        execFileSync('git', ['-C', root, 'config', '--get', 'remote.origin.url'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim(),
      )
    } catch {
      // no origin
    }

    let rootCommit: string | null = null
    try {
      const first = execFileSync('git', ['-C', root, 'rev-list', '--max-parents=0', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      rootCommit = first.split('\n')[0] === '' ? null : (first.split('\n')[0] ?? null)
    } catch {
      // no commits
    }

    return { remote, rootCommit }
  } catch {
    return null
  }
}

function normalizeRemote(remote: string): string | null {
  const value = remote.trim()
  if (value === '') return null
  return value
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '')
    .toLowerCase()
}
