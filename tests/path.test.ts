import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { workspacePathCandidates } from '../src/identity/path.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('workspacePathCandidates', () => {
  it('resolves a symlinked ancestor for a path that still exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-path-'))
    dirs.push(dir)
    const real = path.join(dir, 'real')
    fs.mkdirSync(real)
    fs.mkdirSync(path.join(real, 'project'))
    const alias = path.join(dir, 'alias')
    fs.symlinkSync(real, alias, 'dir')

    expect(workspacePathCandidates(path.join(alias, 'project'))).toContain(
      fs.realpathSync(path.join(real, 'project')),
    )
  })

  it('resolves the deepest existing ancestor when the target was moved', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-path-'))
    dirs.push(dir)
    const real = path.join(dir, 'real')
    fs.mkdirSync(real)
    const alias = path.join(dir, 'alias')
    fs.symlinkSync(real, alias, 'dir')

    expect(workspacePathCandidates(path.join(alias, 'gone'))).toContain(
      path.join(fs.realpathSync(real), 'gone'),
    )
  })
})
