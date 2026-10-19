import { describe, expect, it } from 'vitest'
import { parseSummary } from '../src/summarize/parse.js'

describe('parseSummary', () => {
  it('parses a plain JSON object', () => {
    const summary = parseSummary(
      '{"title":"修复注入","conclusion":"根因是竞态","topics":["注入","竞态"],"durable":[{"layer":"project","title":"注入时序","conclusion":"需要加锁"}],"worthRemembering":true}',
    )
    expect(summary?.title).toBe('修复注入')
    expect(summary?.topics).toEqual(['注入', '竞态'])
    expect(summary?.durable[0]?.layer).toBe('project')
  })

  it('strips a code fence and surrounding prose', () => {
    const summary = parseSummary('结果如下：\n```json\n{"title":"t","conclusion":"c"}\n```\n完成。')
    expect(summary?.title).toBe('t')
  })

  it('rejects malformed JSON', () => {
    expect(parseSummary('not json')).toBeNull()
    expect(parseSummary('{"title":')).toBeNull()
    expect(parseSummary('')).toBeNull()
  })

  it('drops invalid durable layers and empty entries', () => {
    const summary = parseSummary(
      '{"title":"t","conclusion":"c","durable":[{"layer":"rule","title":"x","conclusion":"y"},{"layer":"user","title":"","conclusion":"z"}]}',
    )
    expect(summary?.durable).toEqual([])
  })

  it('defaults worthRemembering to true', () => {
    expect(parseSummary('{"title":"t","conclusion":"c"}')?.worthRemembering).toBe(true)
  })
})
