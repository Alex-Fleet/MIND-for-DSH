import { describe, expect, it } from 'vitest'
import { redactSecrets } from '../src/security/redact.js'

describe('redactSecrets', () => {
  it('redacts common credential shapes', () => {
    expect(redactSecrets('key sk-abcdefghijklmnopqrstuvwxyz')).toContain('[REDACTED:API_KEY]')
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toContain('[REDACTED:BEARER]')
    expect(redactSecrets('password: supersecret12345')).toContain('[REDACTED:SECRET_ASSIGNMENT]')
    expect(redactSecrets('postgres://user:pass@localhost/db')).toContain('[REDACTED:URL_CREDENTIALS]')
    expect(redactSecrets('密码：这是一个很长的密码')).toContain('[REDACTED:CN_SECRET]')
  })

  it('does not touch ordinary prose', () => {
    expect(redactSecrets('the token budget is small and the password policy is documented')).toBe(
      'the token budget is small and the password policy is documented',
    )
  })
})
