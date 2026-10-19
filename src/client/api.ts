export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface Envelope {
  ok?: boolean
  value?: unknown
  error?: { code?: string; message?: string }
}

/**
 * Call one Host endpoint. The desktop shell forwards `/api/*` to the local
 * Host, so a document-relative URL works in both the Web and desktop builds.
 */
export async function callApi<T>(endpoint: string, payload: unknown = {}, signal?: AbortSignal): Promise<T> {
  let response: Response
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }
  if (signal !== undefined) init.signal = signal
  try {
    response = await fetch(`/api/mind.${endpoint}`, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('network', '无法连接 MIND Host')
  }

  let body: Envelope | null = null
  try {
    body = (await response.json()) as Envelope
  } catch {
    body = null
  }
  if (!response.ok) {
    throw new ApiError(body?.error?.code ?? `http-${response.status}`, body?.error?.message ?? `HTTP ${response.status}`)
  }
  if (body === null || body.ok !== true) {
    throw new ApiError(body?.error?.code ?? 'unknown', body?.error?.message ?? 'MIND Host 返回了无效响应')
  }
  return body.value as T
}
