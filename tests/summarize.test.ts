import { describe, expect, it } from 'vitest'
import { parseSummary } from '../src/summarize/parse.js'

describe('parseSummary', () => {
  it('parses the index fields', () => {
    const summary = parseSummary(
      '{"title":"修复注入","conclusion":"根因是竞态","topics":["注入","竞态"]}',
    )
    expect(summary).toEqual({
      title: '修复注入',
      conclusion: '根因是竞态',
      topics: ['注入', '竞态'],
    })
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

  it('ignores legacy rules/durable fields instead of turning them into proposals', () => {
    const summary = parseSummary(
      '{"title":"t","conclusion":"c","durable":[{"layer":"user","title":"rule","conclusion":"z"}],"rules":[{"title":"x","conclusion":"y"}],"worthRemembering":true}',
    )
    expect(summary).toEqual({ title: 't', conclusion: 'c', topics: [] })
    expect(summary).not.toHaveProperty('rules')
    expect(summary).not.toHaveProperty('worthRemembering')
  })
})
