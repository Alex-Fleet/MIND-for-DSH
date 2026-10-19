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

  it('redacts quoted JSON keys, Basic auth and JWTs', () => {
    expect(redactSecrets('{"password": "SUPERSECRETVALUE123456"}')).toContain(
      '[REDACTED:SECRET_ASSIGNMENT]',
    )
    expect(redactSecrets('{"apiKey":"SUPERSECRETVALUE123456"}')).toContain(
      '[REDACTED:SECRET_ASSIGNMENT]',
    )
    expect(redactSecrets('{"access_token":"SUPERSECRETVALUE123456"}')).toContain(
      '[REDACTED:SECRET_ASSIGNMENT]',
    )
    expect(redactSecrets('Authorization: Basic dXNlcjpwYXNzd29yZA==')).toContain(
      '[REDACTED:BASIC_AUTH]',
    )
    expect(
      redactSecrets('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz'),
    ).toContain('[REDACTED:JWT]')
  })

  it('redacts compound and camelCase key names', () => {
    for (const key of [
      'db_password',
      'x-api-key',
      'api_token',
      'secret_key',
      'aws_secret_access_key',
      'session_token',
      'dbPassword',
      'apiToken',
      'secretKey',
      'awsSecretAccessKey',
    ]) {
      expect(redactSecrets(`{"${key}":"SUPERSECRETVALUE123456"}`)).toContain(
        '[REDACTED:SECRET_ASSIGNMENT]',
      )
    }
  })

  it('redacts quoted values containing escaped quotes', () => {
    expect(redactSecrets('{"password": "abcd\\"efghijklmnop"}')).toContain(
      '[REDACTED:SECRET_ASSIGNMENT]',
    )
  })

  it('handles short Basic credentials without destroying prose', () => {
    expect(redactSecrets('Authorization: Basic dXNlcjpwYXNz')).toContain('[REDACTED:BASIC_AUTH]')
    expect(redactSecrets('Authorization: Basic dTpwYXNzd29yZA==')).toContain(
      '[REDACTED:BASIC_AUTH]',
    )
    expect(redactSecrets('Basic configurationmanager is the name')).toBe(
      'Basic configurationmanager is the name',
    )
    expect(redactSecrets('Basic authentication2 flow')).toBe('Basic authentication2 flow')
  })

  it('redacts the whole base64url Basic token, including padding', () => {
    const output = redactSecrets('Authorization: Basic dXNlci1wYXNz_dGVzdA==')
    expect(output).toContain('[REDACTED:BASIC_AUTH]')
    expect(output).not.toContain('dGVzdA')
  })

  it('redacts assigned values with special characters and passphrases', () => {
    const cases: Array<[string, string]> = [
      ['password = "p$ssw0rd123456"', 'p$ssw0rd123456'],
      ['password = "CorrectHorseBatteryStaple"', 'CorrectHorseBatteryStaple'],
      ['password=p@ssw0rd!', 'p@ssw0rd!'],
      ['PASSWORD=p@ssw0rd!', 'p@ssw0rd!'],
      ['USER_PASS=p@ssw0rd!', 'p@ssw0rd!'],
      ['API_KEY=abc123', 'abc123'],
      ['API_KEY="supersecretvalue"', 'supersecretvalue'],
      ['{"password":"abc12"}', 'abc12'],
      ['password = "hunter2"', 'hunter2'],
    ]
    for (const [text, value] of cases) {
      expect(redactSecrets(text)).not.toContain(value)
    }
  })

  it('redacts short Authorization Bearer tokens and PGP private keys', () => {
    expect(redactSecrets('Authorization: Bearer abc123')).toContain('[REDACTED:BEARER]')
    expect(
      redactSecrets('-----BEGIN PGP PRIVATE KEY BLOCK-----\nsecret\n-----END PGP PRIVATE KEY BLOCK-----'),
    ).toContain('[REDACTED:PRIVATE_KEY]')
  })

  it('does not redact ordinary code references', () => {
    expect(redactSecrets('const token = getToken()')).toBe('const token = getToken()')
    expect(redactSecrets('let apiKey = crypto.randomUUID()')).toBe(
      'let apiKey = crypto.randomUUID()',
    )
    expect(redactSecrets('const password = process.env.SECRET')).toBe(
      'const password = process.env.SECRET',
    )
    expect(redactSecrets('API_KEY = getToken()')).toBe('API_KEY = getToken()')
    expect(redactSecrets('const API_KEY = process.env.API_KEY ?? ""')).toBe(
      'const API_KEY = process.env.API_KEY ?? ""',
    )
    expect(redactSecrets('clientSecret = config.clientSecret')).toBe(
      'clientSecret = config.clientSecret',
    )
    expect(redactSecrets('secret = readSecretValue123()')).toBe('secret = readSecretValue123()')
    expect(redactSecrets('passwordHash = bcrypt.hashSync(password123, 10)')).toBe(
      'passwordHash = bcrypt.hashSync(password123, 10)',
    )
  })

  it('does not touch ordinary prose', () => {
    expect(redactSecrets('the token budget is small and the password policy is documented')).toBe(
      'the token budget is small and the password policy is documented',
    )
  })
})
