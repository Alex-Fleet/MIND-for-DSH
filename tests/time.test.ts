import { describe, expect, it } from 'vitest'
import { beijingDateOf, beijingTimeOf, localDateOf } from '../src/time.js'

describe('Beijing time', () => {
  it('uses a +08:00 offset', () => {
    expect(beijingTimeOf('2026-10-19T07:41:00.000Z')).toBe('15:41')
    expect(beijingDateOf('2026-10-19T16:30:00.000Z')).toBe('2026-10-20')
  })

  it('rolls the local date at 04:00 Beijing time', () => {
    // 03:59 Beijing on 10-20 still belongs to 10-19.
    expect(localDateOf(Date.parse('2026-10-19T19:59:00Z'))).toBe('2026-10-19')
    // 04:00 Beijing starts 10-20.
    expect(localDateOf(Date.parse('2026-10-19T20:00:00Z'))).toBe('2026-10-20')
  })
})
