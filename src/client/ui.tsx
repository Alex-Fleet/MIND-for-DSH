import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react'
import { ApiError, callApi } from './api'
import { MarkdownPreview } from './markdown'

// ---------------------------------------------------------------------------
// Wire types (the Host handler is the source of truth)
// ---------------------------------------------------------------------------

interface TimelineRow {
  date: string
  workspaceId: string
  workspaceName: string
  title: string
  turnCount: number
  reportPath: string | null
}

interface TimelineCursor {
  date: string
  workspaceId: string
}

interface TimelinePage {
  rows: TimelineRow[]
  next: TimelineCursor | null
}

interface DayTurn {
  turnId: string
  sessionId: string
  turnSeq: number
  origin: string
  occurredAt: string
  title: string | null
  conclusion: string | null
  preview: string | null
  indexed: boolean
  rawPath: string | null
}

interface DayPage {
  date: string
  workspaceId: string
  rows: DayTurn[]
  truncated: boolean
}

interface TurnChunk {
  turnId: string
  chunk: string
  offset: number
  total: number
  next: number | null
  rawPath: string
}

interface CurrentEntry {
  id: string
  workspaceId: string | null
  workspaceName: string
  layer: string
  title: string
  content: string
  enabled: boolean
  version: number
  updatedAt: string
  sourcePath: string | null
}

interface CurrentPage {
  rows: CurrentEntry[]
  truncated: boolean
}

interface WorkspacePath {
  path: string
  inode: number | null
  volumeUuid: string | null
  confidence: string
  lastSeen: string
}

interface Workspace {
  workspaceId: string
  displayName: string
  createdAt: string
  turnCount: number
  lastTurnAt: string | null
  paths: WorkspacePath[]
}

interface WorkspacesPage {
  rows: Workspace[]
  truncated: boolean
}

interface Proposal {
  id: string
  workspaceId: string | null
  workspaceName: string
  layer: string
  title: string
  content: string
  status: string
  sourceTurn: string | null
  createdAt: string
  reviewedAt: string | null
}

interface ProposalsPage {
  rows: Proposal[]
  pendingCount: number
  truncated: boolean
}

interface Settings {
  captureEnabled: boolean
  injectEnabled: boolean
  uiEnabled: boolean
  mindRoot: string
  standardsDir: string
  workerIntervalMs: number
  dayBoundaryMinutes: number
  wrapWidth: number
  maxAttempts: number
  turnCount: number
  pendingProposals: number
}

type Tab = 'timeline' | 'current' | 'workspaces' | 'proposals' | 'settings'

// ---------------------------------------------------------------------------
// Generic UI state
// ---------------------------------------------------------------------------

interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState(previous => ({ data: previous.data, error: null, loading: true }))
    loader(controller.signal)
      .then(data => {
        if (active) setState({ data, error: null, loading: false })
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return
        setState({ data: null, error: messageOf(error), loading: false })
      })
    return () => {
      active = false
      controller.abort()
    }
    // The caller owns the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision])

  const reload = useCallback(() => setRevision(value => value + 1), [])
  return { ...state, reload }
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

function timeOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(date)
}

function dateOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(date)
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }): ReactNode {
  return (
    <div className="mind-error">
      <div>{message}</div>
      {onRetry === undefined ? null : (
        <button className="mind-btn" onClick={onRetry} type="button">
          重试
        </button>
      )}
    </div>
  )
}

type IconKind = 'calendar' | 'project' | 'whiteboard' | 'user' | 'rule' | 'workspace' | 'proposal'

const ICON_PATHS: Record<IconKind, ReactNode> = {
  calendar: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="5" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  project: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  workspace: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  whiteboard: (
    <>
      <rect height="14" rx="2" width="18" x="3" y="4" />
      <path d="M8 21h8M12 18v3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  rule: (
    <>
      <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" />
      <path d="M9.5 12l1.8 1.8 3.5-3.6" />
    </>
  ),
  proposal: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10c.8.8 1 1.5 1 2h6c0-.5.2-1.2 1-2a6 6 0 0 0-4-10Z" />
    </>
  ),
}

function RowIcon({ kind }: { kind: IconKind }): ReactNode {
  return (
    <div className="mind-icon-tile" data-kind={kind}>
      <svg
        aria-hidden="true"
        fill="none"
        height={20}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
        width={20}
      >
        {ICON_PATHS[kind]}
      </svg>
    </div>
  )
}

function Switch({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (value: boolean) => void
}): ReactNode {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className="mind-switch"
      data-on={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className="mind-switch-knob" />
    </button>
  )
}

function layerIcon(layer: string): IconKind {
  return layer === 'project' || layer === 'whiteboard' || layer === 'user' || layer === 'rule' ? layer : 'project'
}

// ---------------------------------------------------------------------------
// Virtual list
// ---------------------------------------------------------------------------

function VirtualRows<T>({
  items,
  rowHeight,
  render,
  onNearEnd,
}: {
  items: T[]
  rowHeight: number
  render: (item: T, index: number) => ReactNode
  onNearEnd?: () => void
}): ReactNode {
  const viewport = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: 20 })

  const recalc = useCallback(() => {
    const element = viewport.current
    if (element === null) return
    const start = Math.max(0, Math.floor(element.scrollTop / rowHeight) - 4)
    const end = Math.min(items.length, Math.ceil((element.scrollTop + element.clientHeight) / rowHeight) + 6)
    setRange(previous => (previous.start === start && previous.end === end ? previous : { start, end }))
    if (onNearEnd !== undefined && element.scrollHeight - (element.scrollTop + element.clientHeight) < 400) {
      onNearEnd()
    }
  }, [items.length, rowHeight, onNearEnd])

  useEffect(() => {
    recalc()
    const element = viewport.current
    if (element === null) return
    const onScroll = (): void => recalc()
    element.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(onScroll)
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [recalc])

  return (
    <div className="mind-scroll" ref={viewport}>
      <div className="mind-spacer" style={{ height: items.length * rowHeight }}>
        {items.slice(range.start, range.end).map((item, offset) => {
          const index = range.start + offset
          return (
            <div
              className="mind-row-abs"
              key={index}
              style={{ top: index * rowHeight, height: rowHeight }}
            >
              {render(item, index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function Chevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="mind-chevron"
      data-open={open}
      fill="none"
      height={16}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      width={16}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function VirtualTimeline({
  items,
  expandedKey,
  onNearEnd,
  renderRow,
  renderDetail,
}: {
  items: TimelineRow[]
  expandedKey: string | null
  onNearEnd?: () => void
  renderRow: (row: TimelineRow, expanded: boolean) => ReactNode
  renderDetail: (row: TimelineRow) => ReactNode
}): ReactNode {
  const viewport = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const [detailHeight, setDetailHeight] = useState(0)
  const [range, setRange] = useState({ start: 0, end: 20 })

  const heights = items.map(item => 72 + (timelineKey(item) === expandedKey ? detailHeight : 0))
  const offsets: number[] = []
  let total = 0
  for (const height of heights) {
    offsets.push(total)
    total += height
  }

  const recalc = useCallback(() => {
    const element = viewport.current
    if (element === null) return
    const top = element.scrollTop
    let start = 0
    for (let index = 0; index < heights.length; index++) {
      if ((offsets[index] ?? 0) + (heights[index] ?? 0) >= top) {
        start = Math.max(0, index - 3)
        break
      }
    }
    let end = start
    let used = 0
    for (let index = start; index < heights.length; index++) {
      used += heights[index] ?? 0
      end = index + 1
      if (used > element.clientHeight + 320) break
    }
    setRange(previous => (previous.start === start && previous.end === end ? previous : { start, end }))
    if (onNearEnd !== undefined && element.scrollHeight - (top + element.clientHeight) < 400) {
      onNearEnd()
    }
  }, [items, expandedKey, detailHeight, onNearEnd])

  useEffect(() => {
    recalc()
    const element = viewport.current
    if (element === null) return
    const onScroll = (): void => recalc()
    element.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(onScroll)
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [recalc])

  // useLayoutEffect measures before paint, so the first expanded frame does
  // not overlap the rows below it.
  useLayoutEffect(() => {
    const element = detailRef.current
    if (element === null) {
      setDetailHeight(0)
      return
    }
    const update = (): void => setDetailHeight(element.getBoundingClientRect().height)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [expandedKey, items.length])

  return (
    <div className="mind-scroll mind-timeline-scroll" ref={viewport}>
      <div className="mind-spacer" style={{ height: total }}>
        {items.slice(range.start, range.end).map((item, offset) => {
          const index = range.start + offset
          const key = timelineKey(item)
          const expanded = key === expandedKey
          return (
            <div
              className="mind-row-abs"
              key={key}
              style={{ height: heights[index] ?? 72, top: offsets[index] ?? 0 }}
            >
              <div style={{ height: 72 }}>{renderRow(item, expanded)}</div>
              {expanded ? <div ref={detailRef}>{renderDetail(item)}</div> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayInline({
  row,
  expandedTurn,
  onToggleTurn,
}: {
  row: TimelineRow
  expandedTurn: string | null
  onToggleTurn: (turnId: string) => void
}): ReactNode {
  const state = useAsync(
    signal => callApi<DayPage>('day', { workspaceId: row.workspaceId, date: row.date }, signal),
    [row.workspaceId, row.date],
  )

  return (
    <div className="mind-inline">
      {state.loading ? (
        <div className="mind-state">加载中…</div>
      ) : state.error !== null ? (
        <ErrorBox message={state.error} onRetry={state.reload} />
      ) : state.data === null || state.data.rows.length === 0 ? (
        <div className="mind-empty">这一天没有记录。</div>
      ) : (
        state.data.rows.map(item => (
          <div className="mind-inline-item" key={item.turnId}>
            <div
              className="mind-inline-turn"
              data-expanded={expandedTurn === item.turnId}
              onClick={() => onToggleTurn(item.turnId)}
            >
              <span className="mind-turn-time">{timeOf(item.occurredAt)}</span>
              <span className="mind-inline-title">{item.title ?? item.preview ?? '未摘要'}</span>
              {item.indexed ? null : <span className="mind-origin">未摘要</span>}
              <Chevron open={expandedTurn === item.turnId} />
            </div>
            {item.conclusion === null || item.conclusion === '' ? null : (
              <div className="mind-inline-conclusion">{item.conclusion}</div>
            )}
            {expandedTurn === item.turnId ? (
              <div className="mind-inline-raw">
                <TurnContent turn={item} />
              </div>
            ) : null}
          </div>
        ))
      )}
      {state.data?.truncated ? <div className="mind-state">当天记录过多，仅显示前 300 条。</div> : null}
    </div>
  )
}

function timelineKey(row: TimelineRow): string {
  return `${row.date} ${row.workspaceId}`
}

function Timeline(): ReactNode {
  const [rows, setRows] = useState<TimelineRow[]>([])
  const [next, setNext] = useState<TimelineCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [expandedTurn, setExpandedTurn] = useState<string | null>(null)
  const inFlight = useRef(false)

  const loadPage = useCallback(async (before: TimelineCursor | null, replace: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    if (replace) setLoading(true)
    setError(null)
    try {
      const page = await callApi<TimelinePage>('timeline', before === null ? { limit: 50 } : { before, limit: 50 })
      setRows(previous => (replace ? page.rows : mergeUnique(previous, page.rows)))
      setNext(page.next)
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage(null, true)
  }, [loadPage])

  const loadMore = useCallback(() => {
    if (next === null || inFlight.current) return
    void loadPage(next, false)
  }, [next, loadPage])

  return (
    <div className="mind-main">
      <div className="mind-list-wrap">
        {loading && rows.length === 0 ? (
          <div className="mind-state">加载中…</div>
        ) : error !== null ? (
          <ErrorBox message={error} onRetry={() => void loadPage(null, true)} />
        ) : rows.length === 0 ? (
          <div className="mind-empty">还没有记忆。开始一轮对话就会自动记录。</div>
        ) : (
          <VirtualTimeline
            items={rows}
            expandedKey={expandedKey}
            onNearEnd={loadMore}
            renderRow={(row, isExpanded) => (
              <div
                className="mind-row"
                data-expanded={isExpanded}
                onClick={() => {
                  setExpandedKey(current => (current === timelineKey(row) ? null : timelineKey(row)))
                  setExpandedTurn(null)
                }}
              >
                <RowIcon kind="calendar" />
                <div className="mind-row-main">
                  <div className="mind-row-title">{row.title === '' ? '（无标题）' : row.title}</div>
                  <div className="mind-row-sub">
                    {row.date} · {row.workspaceName}
                  </div>
                </div>
                <div className="mind-row-meta">{row.turnCount} turns</div>
                <Chevron open={isExpanded} />
              </div>
            )}
            renderDetail={row => (
              <DayInline
                row={row}
                expandedTurn={expandedTurn}
                onToggleTurn={turnId => setExpandedTurn(current => (current === turnId ? null : turnId))}
              />
            )}
          />
        )}
      </div>
    </div>
  )
}

function mergeUnique(previous: TimelineRow[], incoming: TimelineRow[]): TimelineRow[] {
  const seen = new Set(previous.map(row => `${row.date} ${row.workspaceId}`))
  const merged = [...previous]
  for (const row of incoming) {
    const key = `${row.date} ${row.workspaceId}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(row)
    }
  }
  return merged
}

function DayDetail({ row, onClose }: { row: TimelineRow; onClose: () => void }): ReactNode {
  const state = useAsync(
    signal => callApi<DayPage>('day', { workspaceId: row.workspaceId, date: row.date }, signal),
    [row.workspaceId, row.date],
  )
  const [turn, setTurn] = useState<DayTurn | null>(null)

  return (
    <aside className="mind-detail">
      <div className="mind-detail-header">
        <button
          className="mind-btn mind-btn-ghost mind-back"
          onClick={turn === null ? onClose : () => setTurn(null)}
          type="button"
        >
          返回
        </button>
        <div className="mind-detail-title">
          {turn === null ? row.date : (turn.title ?? turn.turnId)}
          <div className="mind-detail-sub">
            {turn === null ? `${row.workspaceName} · ${row.turnCount} turns` : `Turn #${turn.turnSeq} · ${timeOf(turn.occurredAt)}`}
          </div>
        </div>
        <button className="mind-btn mind-btn-ghost" onClick={onClose} type="button">
          关闭
        </button>
      </div>
      <div className="mind-detail-body">
        {turn !== null ? (
          <TurnContent turn={turn} />
        ) : state.loading ? (
          <div className="mind-state">加载中…</div>
        ) : state.error !== null ? (
          <ErrorBox message={state.error} onRetry={state.reload} />
        ) : state.data === null || state.data.rows.length === 0 ? (
          <div className="mind-empty">这一天没有记录。</div>
        ) : (
          <>
            {state.data.rows.map(item => (
              <div className="mind-row mind-turn-row" key={item.turnId} onClick={() => setTurn(item)}>
                <div className="mind-turn-top">
                  <span className="mind-turn-time">{timeOf(item.occurredAt)}</span>
                  <span className="mind-turn-title">{item.title ?? item.turnId}</span>
                  {item.origin === 'subagent' ? <span className="mind-origin">subagent</span> : null}
                  {item.indexed ? null : <span className="mind-origin">未摘要</span>}
                </div>
                {item.conclusion === null ? null : <div className="mind-turn-conclusion">{item.conclusion}</div>}
              </div>
            ))}
            {state.data.truncated ? <div className="mind-state">当天记录过多，仅显示前 300 条。</div> : null}
          </>
        )}
      </div>
    </aside>
  )
}

function TurnContent({ turn }: { turn: DayTurn }): ReactNode {
  const [text, setText] = useState('')
  const [total, setTotal] = useState(0)
  const [next, setNext] = useState<number | null>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  const load = useCallback(
    async (from: number, append: boolean) => {
      const request = ++generation.current
      setLoading(true)
      setError(null)
      try {
        const chunk = await callApi<TurnChunk>('turn', { turnId: turn.turnId, offset: from, max: 20_000 })
        if (request !== generation.current) return
        setText(previous => (append ? previous + chunk.chunk : chunk.chunk))
        setTotal(chunk.total)
        setNext(chunk.next)
      } catch (caught) {
        if (request !== generation.current) return
        setError(messageOf(caught))
      } finally {
        if (request === generation.current) setLoading(false)
      }
    },
    [turn.turnId],
  )

  useEffect(() => {
    setText('')
    setTotal(0)
    setNext(0)
    setError(null)
    void load(0, false)
    // Invalidate a response for the previous turn.
    return () => {
      generation.current += 1
    }
  }, [load])

  const loaded = next === null ? total : next

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {error !== null ? (
        <ErrorBox message={error} onRetry={() => void load(0, false)} />
      ) : loading && text === '' ? (
        <div className="mind-state">加载中…</div>
      ) : (
        <pre className="mind-raw">{text}</pre>
      )}
      <div className="mind-chunk-footer">
        <span>
          已加载 {loaded} / {total} 字符
        </span>
        <span style={{ flex: 1 }} />
        {next === null ? null : (
          <button className="mind-btn" disabled={loading} onClick={() => void load(next, true)} type="button">
            {loading ? '加载中…' : '加载更多'}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Current cognition
// ---------------------------------------------------------------------------

const LAYER_TITLES: Record<string, string> = {
  project: '项目笔记',
  whiteboard: '白板',
  user: '用户规则',
  rule: '规则',
}

function CurrentPage(): ReactNode {
  const state = useAsync(async signal => {
    const [entries, workspaces] = await Promise.all([
      callApi<CurrentPage>('current', { limit: 500 }, signal),
      callApi<WorkspacesPage>('workspaces', { limit: 500 }, signal),
    ])
    return { entries, workspaces }
  }, [])
  const [editing, setEditing] = useState<CurrentEntry | null>(null)

  if (state.loading) {
    return (
      <div className="mind-scroll">
        <div className="mind-page mind-page-body">
          <div className="mind-state">加载中…</div>
        </div>
      </div>
    )
  }
  if (state.error !== null) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (state.data === null) {
    return (
      <div className="mind-scroll">
        <div className="mind-page mind-page-body">
          <div className="mind-empty">没有当前认知。</div>
        </div>
      </div>
    )
  }

  const groups = ['project', 'whiteboard', 'user', 'rule'].map(layer => ({
    layer,
    title: LAYER_TITLES[layer] ?? layer,
    items: state.data?.entries.rows.filter(entry => entry.layer === layer) ?? [],
  }))

  return (
    <>
      <div className="mind-scroll">
        <div className="mind-page mind-page-body">
          {groups.every(group => group.items.length === 0) ? (
            <div className="mind-empty">还没有当前认知。批准提案后会出现在这里。</div>
          ) : (
            groups.map(group =>
              group.items.length === 0 ? null : (
                <Fragment key={group.layer}>
                  <div className="mind-section-title">{group.title}</div>
                  {group.items.map(entry => (
                    <div
                      className={`mind-row mind-item${entry.enabled ? '' : ' mind-disabled'}`}
                      key={entry.id}
                      onClick={() => setEditing(entry)}
                    >
                      <RowIcon kind={layerIcon(entry.layer)} />
                      <div className="mind-row-main">
                        <div className="mind-row-title">
                          {entry.title}
                          {entry.enabled ? null : <span className="mind-pill">已停用</span>}
                        </div>
                        <div className="mind-item-content">{entry.content}</div>
                      </div>
                      <div className="mind-row-meta">
                        v{entry.version} · {entry.workspaceName} · {dateOf(entry.updatedAt)}
                      </div>
                    </div>
                  ))}
                </Fragment>
              ),
            )
          )}
          {state.data.entries.truncated ? <div className="mind-state">条目过多，仅显示前 500 条。</div> : null}
        </div>
      </div>
      {editing === null ? null : (
        <EntryEditor
          entry={editing}
          workspaces={state.data.workspaces.rows}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            state.reload()
          }}
        />
      )}
    </>
  )
}

function EntryEditor({
  entry,
  workspaces,
  onClose,
  onSaved,
}: {
  entry: CurrentEntry
  workspaces: Workspace[]
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const [title, setTitle] = useState(entry.title)
  const [content, setContent] = useState(entry.content)
  const [enabled, setEnabled] = useState(entry.enabled)
  const [workspaceId, setWorkspaceId] = useState(entry.workspaceId ?? '')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workspaceOptions = useMemo(() => {
    const options = workspaces.map(workspace => ({
      id: workspace.workspaceId,
      name: workspace.displayName,
    }))
    if (entry.workspaceId !== null && !options.some(option => option.id === entry.workspaceId)) {
      options.push({ id: entry.workspaceId, name: entry.workspaceName })
    }
    return options
  }, [entry.workspaceId, entry.workspaceName, workspaces])

  const save = async (): Promise<void> => {
    if (title.trim() === '') {
      setError('标题不能为空')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await callApi('saveEntry', {
        id: entry.id,
        layer: entry.layer,
        title: title.trim(),
        content,
        enabled,
        workspaceId: workspaceId === '' ? null : workspaceId,
      })
      onSaved()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mind-modal-mask" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="mind-modal" role="dialog" aria-modal="true">
        <div className="mind-modal-header">
          <span style={{ flex: 1 }}>编辑{LAYER_TITLES[entry.layer] ?? '条目'}</span>
          <span className="mind-setting-desc">v{entry.version}</span>
        </div>
        <div className="mind-modal-body">
          <div className="mind-field">
            <label className="mind-field-label" htmlFor="mind-title">
              标题
            </label>
            <input
              className="mind-input"
              id="mind-title"
              onChange={event => setTitle(event.target.value)}
              value={title}
            />
          </div>
          <div className="mind-field">
            <label className="mind-field-label" htmlFor="mind-workspace">
              类型
            </label>
            <select
              className="mind-select"
              id="mind-workspace"
              onChange={event => setWorkspaceId(event.target.value)}
              value={workspaceId}
            >
              <option value="">全局</option>
              {workspaceOptions.map(workspace => (
                <option key={workspace.id} value={workspace.id}>
                  项目 · {workspace.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mind-field">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mind-field-label" style={{ flex: 1 }}>
                内容
              </span>
              <div className="mind-segmented">
                <button data-active={!preview} onClick={() => setPreview(false)} type="button">
                  编辑
                </button>
                <button data-active={preview} onClick={() => setPreview(true)} type="button">
                  预览
                </button>
              </div>
            </div>
            {preview ? (
              <div className="mind-preview">
                <MarkdownPreview text={content} />
              </div>
            ) : (
              <textarea
                className="mind-textarea"
                onChange={event => setContent(event.target.value)}
                value={content}
              />
            )}
          </div>
          <div className="mind-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <span className="mind-field-label" style={{ flex: 1 }}>
              启用（停用后不参与每轮注入）
            </span>
            <Switch checked={enabled} label="启用" onChange={setEnabled} />
          </div>
          {error === null ? null : <ErrorBox message={error} />}
        </div>
        <div className="mind-modal-footer">
          <button className="mind-btn" disabled={saving} onClick={onClose} type="button">
            取消
          </button>
          <button className="mind-btn mind-btn-primary" disabled={saving} onClick={() => void save()} type="button">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

function WorkspacesPage(): ReactNode {
  const state = useAsync(signal => callApi<WorkspacesPage>('workspaces', {}, signal), [])
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (id: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(id)
    } catch {
      setCopied(null)
    }
  }

  if (state.loading) return <div className="mind-state">加载中…</div>
  if (state.error !== null) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (state.data === null || state.data.rows.length === 0) {
    return <div className="mind-empty">还没有工作区。在 DSH 里打开一个目录对话后会自动登记。</div>
  }

  return (
    <div className="mind-scroll">
      <div className="mind-page mind-page-body">
        {state.data.truncated ? <div className="mind-state">工作区过多，仅显示前 200 个。</div> : null}
        {state.data.rows.map(workspace => {
          const primary = workspace.paths[0]
          return (
            <div className="mind-row mind-item" key={workspace.workspaceId}>
              <RowIcon kind="workspace" />
              <div className="mind-row-main">
                <div className="mind-row-title">{workspace.displayName}</div>
                <div className="mind-row-sub mind-mono">{primary?.path ?? '（无活动路径）'}</div>
                <div className="mind-row-sub mind-mono">
                  {workspace.workspaceId}
                  {primary === undefined ? '' : ` · inode ${primary.inode ?? '?'} · ${primary.confidence}`}
                </div>
              </div>
              <div className="mind-row-meta">
                {workspace.turnCount} turns
                {workspace.lastTurnAt === null ? '' : ` · ${dateOf(workspace.lastTurnAt)}`}
              </div>
              <button className="mind-btn" onClick={() => void copy(workspace.workspaceId)} type="button">
                {copied === workspace.workspaceId ? '已复制' : '复制 ID'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

function ProposalsPage({ onPendingChange }: { onPendingChange: (count: number) => void }): ReactNode {
  const state = useAsync(signal => callApi<ProposalsPage>('proposals', { status: 'pending', limit: 200 }, signal), [])
  const [acting, setActing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (state.data !== null) onPendingChange(state.data.pendingCount)
  }, [state.data, onPendingChange])

  const act = async (proposal: Proposal, action: 'approve' | 'reject'): Promise<void> => {
    setActing(proposal.id)
    setActionError(null)
    try {
      await callApi('resolveProposal', { id: proposal.id, action })
      state.reload()
    } catch (caught) {
      setActionError(messageOf(caught))
    } finally {
      setActing(null)
    }
  }

  if (state.loading) return <div className="mind-state">加载中…</div>
  if (state.error !== null) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (state.data === null || state.data.rows.length === 0) return <div className="mind-empty">没有待审提案。</div>

  return (
    <div className="mind-scroll">
      <div className="mind-page mind-page-body">
        {actionError === null ? null : <ErrorBox message={actionError} />}
        {state.data.truncated ? <div className="mind-state">待审提案过多，仅显示前 200 条。</div> : null}
        {state.data.rows.map(proposal => (
          <div className="mind-row mind-item" key={proposal.id}>
            <RowIcon kind="proposal" />
            <div className="mind-row-main">
              <div className="mind-row-title">{proposal.title}</div>
              <div className="mind-proposal-content">{proposal.content}</div>
              <div className="mind-proposal-meta">
                {proposal.workspaceName} · {dateOf(proposal.createdAt)}
                {proposal.sourceTurn === null ? '' : ` · ${proposal.sourceTurn}`}
              </div>
            </div>
            <div className="mind-proposal-actions">
              <button
                className="mind-btn mind-btn-primary"
                disabled={acting === proposal.id}
                onClick={() => void act(proposal, 'approve')}
                type="button"
              >
                批准
              </button>
              <button
                className="mind-btn"
                disabled={acting === proposal.id}
                onClick={() => void act(proposal, 'reject')}
                type="button"
              >
                拒绝
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsPage(): ReactNode {
  const state = useAsync(signal => callApi<Settings>('settings', {}, signal), [])
  const [local, setLocal] = useState<Settings | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (state.data !== null) setLocal(state.data)
  }, [state.data])

  const toggle = async (key: 'captureEnabled' | 'injectEnabled', value: boolean): Promise<void> => {
    setSaving(key)
    setActionError(null)
    try {
      const updated = await callApi<Settings>('updateSettings', { [key]: value })
      setLocal(updated)
    } catch (caught) {
      setActionError(messageOf(caught))
    } finally {
      setSaving(null)
    }
  }

  if (state.loading && local === null) return <div className="mind-state">加载中…</div>
  if (state.error !== null && local === null) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (local === null) return <div className="mind-empty">没有设置。</div>

  return (
    <div className="mind-scroll">
      <div className="mind-page mind-page-body">
        {actionError === null ? null : <ErrorBox message={actionError} />}
        <div className="mind-section-title">通用</div>
        <div className="mind-setting">
          <div className="mind-setting-main">
            <div className="mind-setting-label">捕获</div>
            <div className="mind-setting-desc">每轮结束后自动把原始对话写入 MIND。</div>
          </div>
          <Switch
            checked={local.captureEnabled}
            disabled={saving !== null}
            label="捕获"
            onChange={value => void toggle('captureEnabled', value)}
          />
        </div>
        <div className="mind-setting">
          <div className="mind-setting-main">
            <div className="mind-setting-label">注入</div>
            <div className="mind-setting-desc">把规范、当前认知和时间轴注入模型上下文。</div>
          </div>
          <Switch
            checked={local.injectEnabled}
            disabled={saving !== null}
            label="注入"
            onChange={value => void toggle('injectEnabled', value)}
          />
        </div>
        <div className="mind-section-title">存储</div>
        <div className="mind-setting">
          <div className="mind-setting-main">
            <div className="mind-setting-label">MIND 根目录</div>
            <div className="mind-setting-value mind-mono">{local.mindRoot}</div>
          </div>
        </div>
        <div className="mind-setting">
          <div className="mind-setting-main">
            <div className="mind-setting-label">规范目录</div>
            <div className="mind-setting-value mind-mono">{local.standardsDir}</div>
          </div>
        </div>
        <div className="mind-section-title">统计</div>
        <div className="mind-setting">
          <div className="mind-setting-main">
            <div className="mind-setting-label">
              {local.turnCount} turns · {local.pendingProposals} 条待审提案
            </div>
            <div className="mind-setting-desc">
              日界 {String(Math.floor(local.dayBoundaryMinutes / 60)).padStart(2, '0')}:
              {String(local.dayBoundaryMinutes % 60).padStart(2, '0')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'timeline', label: '时间线' },
  { id: 'current', label: '当前' },
  { id: 'workspaces', label: '工作区' },
  { id: 'proposals', label: '提案' },
  { id: 'settings', label: '设置' },
]

export function MindApp(): ReactNode {
  const [tab, setTab] = useState<Tab>('timeline')
  const [pending, setPending] = useState(0)
  const [gate, setGate] = useState<'loading' | 'ready' | 'disabled'>('loading')

  useEffect(() => {
    let active = true
    callApi<Settings>('settings', {})
      .then(settings => {
        if (active) setGate(settings.uiEnabled ? 'ready' : 'disabled')
      })
      .catch(() => {
        // An older host without the settings route still gets the UI.
        if (active) setGate('ready')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (gate !== 'ready') return
    let active = true
    callApi<ProposalsPage>('proposals', { status: 'pending', limit: 1 })
      .then(page => {
        if (active) setPending(page.pendingCount)
      })
      .catch(() => {
        // The badge is advisory; the Proposals tab reports its own errors.
      })
    return () => {
      active = false
    }
  }, [gate])

  if (gate === 'loading') {
    return (
      <div className="mind-root">
        <div className="mind-page">
          <div className="mind-state">加载中…</div>
        </div>
      </div>
    )
  }
  if (gate === 'disabled') {
    return (
      <div className="mind-root">
        <div className="mind-page">
          <div className="mind-empty">记忆 UI 已在配置中停用（uiEnabled=false）。</div>
        </div>
      </div>
    )
  }

  return (
    <div className="mind-root">
      <div className="mind-head">
        <div className="mind-page">
          <div className="mind-page-head">
            <div className="mind-title">记忆</div>
          </div>
          <div className="mind-tabs">
            {TABS.map(item => (
              <button
                className="mind-tab"
                data-active={tab === item.id}
                key={item.id}
                onClick={() => setTab(item.id)}
                type="button"
              >
                {item.label}
                {item.id === 'proposals' && pending > 0 ? <span className="mind-badge">{pending}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
      {tab === 'timeline' ? <Timeline /> : null}
      {tab === 'current' ? <CurrentPage /> : null}
      {tab === 'workspaces' ? <WorkspacesPage /> : null}
      {tab === 'proposals' ? <ProposalsPage onPendingChange={setPending} /> : null}
      {tab === 'settings' ? <SettingsPage /> : null}
    </div>
  )
}
