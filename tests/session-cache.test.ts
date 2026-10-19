import { describe, expect, it } from 'vitest'
import { SessionWorkspaceCache } from '../src/identity/session-cache.js'

describe('SessionWorkspaceCache', () => {
  it('never lends a cwd-less session another session workspace', () => {
    const calls: string[] = []
    const cache = new SessionWorkspaceCache(cwd => {
      calls.push(cwd)
      return { id: `ws:${cwd}`, path: cwd }
    })

    expect(cache.get('session-a', '/tmp/a')).toBe('ws:/tmp/a')
    expect(cache.get('session-b', null)).toBeNull()
    expect(cache.get('session-a', null)).toBe('ws:/tmp/a')
    expect(calls).toEqual(['/tmp/a'])
  })

  it('re-resolves when the same session reports a different cwd', () => {
    const cache = new SessionWorkspaceCache(cwd => ({ id: `ws:${cwd}`, path: cwd }))
    expect(cache.get('s', '/tmp/a')).toBe('ws:/tmp/a')
    expect(cache.get('s', '/tmp/b')).toBe('ws:/tmp/b')
    expect(cache.get('s', '/tmp/b')).toBe('ws:/tmp/b')
  })

  it('does not cache or share an unknown session identity', () => {
    const cache = new SessionWorkspaceCache(cwd => ({ id: `ws:${cwd}`, path: cwd }))
    expect(cache.get('unknown', '/tmp/a')).toBe('ws:/tmp/a')
    expect(cache.get('unknown', null)).toBeNull()
    expect(cache.get('', null)).toBeNull()
  })
})
