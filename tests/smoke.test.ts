import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.js'

function fakeContext() {
  const sections: Array<{ name: string; order: number; text: unknown }> = []
  const listeners: Array<{ event: string; listener: (...args: unknown[]) => void }> = []
  const cleanups: Array<() => void> = []
  const ctx = {
    systemPrompt: {
      section: (options: { name: string; order: number; text: unknown }) => {
        sections.push(options)
        return () => {}
      },
      context: () => () => {},
      getSectionOrder: () => 1000,
    },
    tools: { register: () => {} },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.push({ event, listener })
      return () => {}
    },
    // Optional service injection: the fake has no `connection`, so UI routes
    // stay unmounted.
    inject: () => {},
    effect: (factory: () => () => void) => {
      cleanups.push(factory())
    },
  }
  return { ctx, sections, listeners, cleanups }
}

describe('plugin skeleton', () => {
  it('exports the expected identity', () => {
    expect(name).toBe('mind-dsh')
    expect(inject).toContain('systemPrompt')
  })

  it('registers one static section and one session listener', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-dsh-smoke-'))
    const { ctx, sections, listeners, cleanups } = fakeContext()

    apply(ctx as never, { mindRoot: dir })

    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe('mind-dsh:static')
    expect(listeners).toHaveLength(2)
    expect(listeners.map(entry => entry.event)).toEqual(['session/event', 'agent/pre-step'])
    expect(cleanups).toHaveLength(1)

    cleanups[0]?.()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
