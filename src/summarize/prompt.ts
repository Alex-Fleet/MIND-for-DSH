import type { CapturedTurn } from '../capture/types.js'
import { redactSecrets } from '../security/redact.js'

export const SUMMARY_MAX_INPUT_CHARS = 30_000

/**
 * Build the capture subagent prompt.
 *
 * The child sees the readable turn file (hard-wrapped, complete content up to
 * the input cap) and returns one structured index entry. It never writes files
 * and never produces prose outside the JSON object.
 */
export function buildSummaryPrompt(turn: CapturedTurn, markdown: string): string {
  // Cut before redacting, but keep a forward window so a credential that
  // crosses the 30k boundary is still matched. Redacting a whole multi-MB turn
  // can be quadratic on pathological single lines.
  const REDACT_WINDOW_CHARS = 1_000_000
  const window = markdown.length > SUMMARY_MAX_INPUT_CHARS + REDACT_WINDOW_CHARS
    ? markdown.slice(0, SUMMARY_MAX_INPUT_CHARS + REDACT_WINDOW_CHARS)
    : markdown
  const safe = redactSecrets(window)
  const body =
    safe.length > SUMMARY_MAX_INPUT_CHARS
      ? `${safe.slice(0, SUMMARY_MAX_INPUT_CHARS)}\n\n[内容过长已截断；完整原文见 ${turn.sessionId} turn #${turn.turn}]`
      : safe

  return [
    '你是 MIND 的记忆整合器。阅读下面这一轮的原始记录，生成一条可导航的索引。',
    '',
    '要求：',
    '1. title：≤24 个中文字符，说清这一轮在做什么。',
    '2. conclusion：≤120 个中文字符，写结论/决策/根因，不写过程。',
    '3. topics：3-8 个关键词，用于检索。',
    '4. 不要记录密钥、token、密码。',
    '',
    '只输出一个 JSON 对象，不要代码块围栏，不要任何解释：',
    '{"title":"...","conclusion":"...","topics":["..."]}',
    '',
    '===== 原始记录 =====',
    body,
  ].join('\n')
}
