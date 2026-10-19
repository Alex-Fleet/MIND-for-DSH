import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/index.js'

describe('plugin skeleton', () => {
  it('exports the expected identity', () => {
    expect(name).toBe('mind-dsh')
    expect(inject).toContain('systemPrompt')
  })

  it('registers one static section on apply', () => {
    const sections: Array<{ name: string; order: number; text: unknown }> = []
    const ctx = {
      systemPrompt: {
        section: (options: { name: string; order: number; text: unknown }) => {
          sections.push(options)
          return () => {}
        },
        context: () => () => {},
        getSectionOrder: () => 1000,
      },
    }

    apply(ctx as never)

    expect(sections).toHaveLength(1)
    expect(sections[0]?.name).toBe('mind-dsh:static')
    expect(sections[0]?.order).toBe(1000)
  })
})
