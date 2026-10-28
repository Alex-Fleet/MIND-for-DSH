import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/db/store.js'
import { createRememberProposal } from '../src/tools/mind-tools.js'

function withStore(run: (store: Store) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-remember-'))
  const store = new Store(path.join(dir, 'mind.db'))
  try {
    run(store)
  } finally {
    store.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('createRememberProposal', () => {
  it('writes a pending proposal and never an active rule', () => {
    withStore(store => {
      const result = createRememberProposal(store, 'ws1', {
        title: '规则',
        content: '内容',
        evidence: '用户要求',
        origin: 'user',
      })
      expect('id' in result).toBe(true)

      const pending = store.listProposalsPage('pending', 10)
      expect(pending).toHaveLength(1)
      expect(pending[0]).toMatchObject({
        workspace_id: 'ws1',
        layer: 'rule',
        title: '规则',
      })
      expect(String(pending[0].content)).toContain('来源：用户要求')
      expect(store.listCognitionEntries('ws1', 'rule')).toHaveLength(0)
    })
  })

  it('deduplicates identical proposals', () => {
    withStore(store => {
      const input = { title: '规则', content: '内容', origin: 'user' as const }
      createRememberProposal(store, 'ws1', input)
      createRememberProposal(store, 'ws1', input)
      expect(store.listProposalsPage('pending', 10)).toHaveLength(1)
    })
  })

  it('rejects empty content', () => {
    withStore(store => {
      const result = createRememberProposal(store, 'ws1', { title: '规则', content: '   ' })
      expect('error' in result).toBe(true)
      expect(store.listProposalsPage('pending', 10)).toHaveLength(0)
    })
  })
})
