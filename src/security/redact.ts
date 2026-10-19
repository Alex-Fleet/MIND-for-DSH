/**
 * Redact credential-shaped strings from model-facing text.
 *
 * The vault keeps the original raw file locally (mode 0600); this function is
 * applied to summaries, proposals, snapshots, increments, and tool output so a
 * secret copied into a conversation cannot be echoed back to a model.
 */
const PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  {
    kind: 'PRIVATE_KEY',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { kind: 'BEARER', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi },
  { kind: 'API_KEY', pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'GITHUB_TOKEN', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { kind: 'AWS_KEY', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'GOOGLE_KEY', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'SLACK_TOKEN', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    kind: 'SECRET_ASSIGNMENT',
    pattern: /\b(?:api[_-]?key|apikey|secret|token|password|passwd|pwd)\s*[:=]\s*(["']?)[A-Za-z0-9._~+/=-]{12,}\1/gi,
  },
  {
    kind: 'ENV_SECRET',
    pattern: /\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*[^\s"']{8,}/g,
  },
  { kind: 'URL_CREDENTIALS', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/gi },
  { kind: 'CN_SECRET', pattern: /(密码|密钥|令牌|口令)\s*[:：=]\s*\S{6,}/g },
]

export function redactSecrets(text: string): string {
  let output = text
  for (const { kind, pattern } of PATTERNS) {
    output = output.replace(pattern, `[REDACTED:${kind}]`)
  }
  return output
}
