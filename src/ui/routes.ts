import type { Context } from '@deepseek-ai/cordis'
import { handleUiRequest, UI_ENDPOINTS, type UiDeps } from './handler.js'

/** 512 KiB accepts 100k CJK characters (UTF-8) with room to spare. */
const MAX_BODY_BYTES = 512 * 1024

interface ConnectionFetchService {
  register(route: {
    path: string
    methods: readonly string[]
    requestBody: 'buffered' | 'streaming'
    fetch(request: Request): Promise<Response>
  }): () => Promise<void>
}

interface ConnectionService {
  fetch: ConnectionFetchService
}

/**
 * Mount the MIND UI API on DSH's authenticated `/api` channel.
 *
 * Exact Fetch routes are the transport-safe choice: the Web page and the
 * desktop app both forward `/api/*` to the Host, while the shared `/api`
 * interceptor is already owned by the API Gateway. Connection admits only the
 * owner peer for these routes.
 *
 * Streaming request bodies keep a large authenticated upload from being
 * materialized before the size check; the reader stops at 512 KiB.
 */
export function registerUiRoutes(ctx: Context, deps: UiDeps, enabled: boolean): void {
  ctx.inject(['connection'], child => {
    const connection = (child as unknown as { connection: ConnectionService }).connection
    const endpoints = enabled ? UI_ENDPOINTS : (['settings'] as const)
    for (const endpoint of endpoints) {
      child.effect(
        () => {
          const dispose = connection.fetch.register({
            path: `/api/mind.${endpoint}`,
            methods: ['POST'],
            requestBody: 'streaming',
            fetch: request => serve(deps, endpoint, request),
          })
          return () => {
            void dispose()
          }
        },
        `mind-dsh: ui route ${endpoint}`,
      )
    }
  })
}

async function serve(deps: UiDeps, endpoint: string, request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ ok: false, error: { code: 'bad-request', message: 'POST required' } }, 405)
  }
  const mediaType = (request.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return json({ ok: false, error: { code: 'bad-request', message: 'content-type must be application/json' } }, 415)
  }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ ok: false, error: { code: 'bad-request', message: 'request body is too large' } }, 413)
  }

  let body: unknown = {}
  try {
    const text = await readBody(request)
    if (text === null) {
      return json({ ok: false, error: { code: 'bad-request', message: 'request body is too large' } }, 413)
    }
    if (text !== '') body = JSON.parse(text)
  } catch {
    return json({ ok: false, error: { code: 'bad-request', message: 'malformed JSON body' } }, 400)
  }

  return json(await handleUiRequest(deps, endpoint, body), 200)
}

/** Read a request body with a hard byte cap; null means the cap was hit. */
async function readBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader()
  if (reader === undefined) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value === undefined) continue
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
