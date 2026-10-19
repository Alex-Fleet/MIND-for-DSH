import { describe, expect, it } from 'vitest'
import { previewFromMarkdown } from '../src/turns/preview.js'

describe('turn preview', () => {
  it('uses the first user line and ignores file metadata', () => {
    const markdown = [
      '# Turn session-1 / #1',
      '',
      '- 开始: 2026-10-19T01:00:00Z',
      '- 结束原因: completed',
      '',
      '## 用户',
      '',
      '给 UI 加一个记忆入口',
      '',
      '## 助手',
      '',
      '好的',
    ].join('\n')
    expect(previewFromMarkdown(markdown)).toBe('给 UI 加一个记忆入口')
  })

  it('falls back to the assistant section', () => {
    expect(previewFromMarkdown('## 助手\n\nassistant text\n')).toBe('assistant text')
  })

  it('never turns metadata into a title', () => {
    expect(previewFromMarkdown('# Turn s / #1\n\n- 开始: 2026-10-19T01:00:00Z\n')).toBeNull()
  })
})
