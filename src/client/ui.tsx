import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react'
import { ApiError, callApi } from './api'
import { MarkdownPreview } from './markdown'

// The DSH client module loader supplies `require`; primitives are provided by
// the shell so menus/buttons match the rest of the app.
declare const require: (id: string) => unknown

interface DshMenuItem {
  id?: string
  label?: ReactNode
  text?: string
  icon?: ReactNode
  type?: 'label' | 'separator'
  submenu?: DshMenuItem[]
}

interface DshMenuProps {
  open: boolean
  anchor?: unknown
  items: DshMenuItem[]
  selectedId?: string
  onSelect?: (id: string) => void
  onClose?: () => void
  side?: 'top' | 'bottom' | 'left' | 'right'
  portal?: boolean
  getAnchorRect?: () => DOMRect | null
  children?: ReactNode
}

interface DshPrimitives {
  Menu: (props: DshMenuProps) => ReactNode
  IconChevronsUpDownOutlineRegular: (props: Record<string, unknown>) => ReactNode
}

let dshPrimitives: DshPrimitives | null = null
try {
  dshPrimitives = require('@deepseek-ai/dsh-client-ui-primitives') as DshPrimitives
} catch {
  // The native select fallback keeps the timeline usable if the shell does
  // not expose the primitives module.
  dshPrimitives = null
}

const DshMenu = dshPrimitives?.Menu
const ChevronsUpDown = dshPrimitives?.IconChevronsUpDownOutlineRegular

function workspaceLabel(name: string): string {
  if (name !== 'default-workspace') return name
  const language = typeof navigator === 'undefined' ? 'zh' : navigator.language
  return language.toLowerCase().startsWith('zh') ? '默认工作区' : 'Default Workspace'
}

/** Display a child without repeating its parent prefix (e.g. "GameExpert / GuanDan"). */
function childWorkspaceLabel(name: string, parent: string): string {
  const label = workspaceLabel(name)
  const prefix = `${parent} / `
  return label.startsWith(prefix) ? label.slice(prefix.length) : label
}

/**
 * Workspace choices as a collapsed tree. Parent groups are native Menu
 * submenus: they stay collapsed until clicked or hovered, and the Menu
 * primitive handles one level of expansion per group.
 */
function workspaceTreeOptions(workspaces: Workspace[]): SelectOption[] {
  const parentNames = ['Archived', 'GameExpert', 'Opensource']
  const pathOf = (workspace: Workspace): string => workspace.paths[0]?.path ?? ''
  const parents = parentNames
    .map(name => workspaces.find(workspace => workspace.displayName === name))
    .filter((workspace): workspace is Workspace => workspace !== undefined)
  const used = new Set<string>()
  const options: SelectOption[] = [{ id: '__all__', label: '全部工作区' }]

  for (const parent of parents) {
    const parentPath = pathOf(parent)
    if (parentPath === '') continue
    const children = workspaces
      .filter(workspace => {
        if (workspace.workspaceId === parent.workspaceId) return false
        return pathOf(workspace).startsWith(parentPath + '/')
      })
      .sort((a, b) => workspaceLabel(a.displayName).localeCompare(workspaceLabel(b.displayName)))
    if (children.length === 0) continue
    used.add(parent.workspaceId)
    for (const child of children) used.add(child.workspaceId)
    options.push({
      id: `__group__${parent.workspaceId}`,
      label: `${parent.displayName} ›`,
      submenu: children.map(child => ({
        id: child.workspaceId,
        label: childWorkspaceLabel(child.displayName, parent.displayName),
      })),
    })
  }

  for (const workspace of workspaces
    .filter(workspace => !used.has(workspace.workspaceId))
    .sort((a, b) => workspaceLabel(a.displayName).localeCompare(workspaceLabel(b.displayName)))) {
    options.push({ id: workspace.workspaceId, label: workspaceLabel(workspace.displayName) })
  }
  return options
}

interface SelectOption {
  id: string
  label: string
  display?: ReactNode
  type?: 'label' | 'separator'
  submenu?: SelectOption[]
}

function findSelectOption(options: SelectOption[], id: string): SelectOption | undefined {
  for (const option of options) {
    if (option.id === id) return option
    const nested = option.submenu === undefined ? undefined : findSelectOption(option.submenu, id)
    if (nested !== undefined) return nested
  }
  return undefined
}

/** Native-select fallback: groups have no value of their own, so flatten leaves. */
function flattenSelectOptions(options: SelectOption[]): SelectOption[] {
  const flat: SelectOption[] = []
  for (const option of options) {
    if (option.type !== undefined) continue
    if (option.submenu !== undefined) {
      flat.push(...flattenSelectOptions(option.submenu))
    } else {
      flat.push(option)
    }
  }
  return flat
}

function menuItems(options: SelectOption[]): DshMenuItem[] {
  return options.map(option => {
    if (option.type === 'label') return { type: 'label', text: option.label }
    if (option.type === 'separator') return { type: 'separator' }
    return {
      id: option.id,
      label: option.display ?? option.label,
      ...(option.submenu === undefined ? {} : { submenu: menuItems(option.submenu) }),
    }
  })
}

/**
 * One dropdown for every UI selection: the shell Menu primitive when
 * available, with a native select only as a last-resort fallback.
 */
function DshSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id?: string
  label: string
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const selected = findSelectOption(options, value)

  if (DshMenu === undefined) {
    return (
      <div className="mind-select-root">
        <select
          aria-label={label}
          className="mind-select-fallback"
          onChange={event => onChange(event.target.value)}
          value={value}
        >
          {flattenSelectOptions(options).map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="mind-select-root">
      <DshMenu
        anchor={
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={label}
            className="mind-select-trigger"
            id={id}
            onClick={() => setOpen(current => !current)}
            type="button"
          >
            <span className="mind-select-value">{selected?.label ?? label}</span>
            {ChevronsUpDown === undefined ? (
              <span aria-hidden="true" className="mind-select-caret">
                ⌄
              </span>
            ) : (
              <ChevronsUpDown />
            )}
          </button>
        }
        items={menuItems(options)}
        onClose={() => setOpen(false)}
        onSelect={next => {
          if (typeof next !== 'string' || next === '') return
          onChange(next)
          setOpen(false)
        }}
        open={open}
        portal
        selectedId={value}
        side="bottom"
      />
    </div>
  )
}

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

interface ReportText {
  path: string
  content: string
}

interface PeriodRow {
  workspaceId: string
  kind: string
  period: string
  title: string
  reportPath: string
}

interface PeriodsPage {
  workspaceId: string
  kind: string
  rows: PeriodRow[]
  truncated: boolean
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

type Tab = 'timeline' | 'reports' | 'current' | 'workspaces' | 'proposals' | 'settings'

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

  useEffect(() => {
    const element = viewport.current
    if (element === null) return
    const onScroll = (): void => {
      if (onNearEnd !== undefined && element.scrollHeight - (element.scrollTop + element.clientHeight) < 400) {
        onNearEnd()
      }
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [onNearEnd])

  // Keep the list in normal flow. The old absolute-positioned virtual rows
  // measured the expanded detail asynchronously; scrolling could unmount the
  // measured node and leave the reserved height stale, causing rows to overlap.
  // Timeline pages are bounded (50 days per page), so normal flow is simpler
  // and stable.
  return (
    <div className="mind-scroll mind-timeline-scroll" ref={viewport}>
      <div className="mind-timeline-flow">
        {items.map(item => {
          const key = timelineKey(item)
          const expanded = key === expandedKey
          return (
            <div className="mind-timeline-item" key={key}>
              <div className="mind-timeline-summary">{renderRow(item, expanded)}</div>
              {expanded ? <div className="mind-timeline-detail">{renderDetail(item)}</div> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReportBlock({ path }: { path: string }): ReactNode {
  const [open, setOpen] = useState(false)
  const state = useAsync<ReportText | null>(
    signal => (open ? callApi<ReportText>('report', { path }, signal) : Promise.resolve(null)),
    [path, open],
  )

  return (
    <div className="mind-report-block">
      <button
        aria-expanded={open}
        className="mind-btn mind-btn-ghost mind-report-toggle"
        onClick={() => setOpen(value => !value)}
        type="button"
      >
        <Chevron open={open} />
        日报
      </button>
      {open ? (
        state.loading ? (
          <div className="mind-state">加载日报…</div>
        ) : state.error !== null ? (
          <ErrorBox message={state.error} onRetry={state.reload} />
        ) : state.data === null ? null : (
          <div className="mind-report-body">
            <MarkdownPreview text={state.data.content} />
          </div>
        )
      ) : null}
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
      {row.reportPath === null ? null : <ReportBlock path={row.reportPath} />}
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
  return `${row.date}\u0000${row.workspaceId}`
}

function Timeline(): ReactNode {
  const [rows, setRows] = useState<TimelineRow[]>([])
  const [next, setNext] = useState<TimelineCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [expandedTurn, setExpandedTurn] = useState<string | null>(null)
  const [workspaceFilter, setWorkspaceFilter] = useState('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const inFlight = useRef(false)
  const requestId = useRef(0)

  useEffect(() => {
    let active = true
    callApi<WorkspacesPage>('workspaces', { limit: 200 })
      .then(page => {
        if (active) setWorkspaces(page.rows)
      })
      .catch(() => {
        // The selector is optional; the timeline still works without it.
      })
    return () => {
      active = false
    }
  }, [])

  const loadPage = useCallback(
    async (before: TimelineCursor | null, replace: boolean) => {
      const id = ++requestId.current
      inFlight.current = true
      if (replace) setLoading(true)
      setError(null)
      try {
        const payload: Record<string, unknown> = before === null ? { limit: 50 } : { before, limit: 50 }
        if (workspaceFilter !== '') payload.workspaceId = workspaceFilter
        const page = await callApi<TimelinePage>('timeline', payload)
        if (id !== requestId.current) return
        setRows(previous => (replace ? page.rows : mergeUnique(previous, page.rows)))
        setNext(page.next)
      } catch (caught) {
        if (id !== requestId.current) return
        setError(messageOf(caught))
      } finally {
        if (id === requestId.current) {
          inFlight.current = false
          setLoading(false)
        }
      }
    },
    [workspaceFilter],
  )

  useEffect(() => {
    // A workspace switch invalidates the old page and any in-flight response.
    inFlight.current = false
    setRows([])
    setNext(null)
    setExpandedKey(null)
    setExpandedTurn(null)
    void loadPage(null, true)
  }, [loadPage])

  const loadMore = useCallback(() => {
    if (next === null || inFlight.current) return
    void loadPage(next, false)
  }, [next, loadPage])

  const workspaceOptions = useMemo(() => workspaceTreeOptions(workspaces), [workspaces])

  return (
    <div className="mind-main">
      <div className="mind-list-wrap">
        <div className="mind-timeline-bar">
          <span className="mind-timeline-bar-label">工作区</span>
          <DshSelect
            label="工作区"
            onChange={next => setWorkspaceFilter(next === '__all__' ? '' : next)}
            options={workspaceOptions}
            value={workspaceFilter === '' ? '__all__' : workspaceFilter}
          />
        </div>
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
                  <div className="mind-row-title mind-day-title">
                    <span className="mind-day-workspace">{workspaceLabel(row.workspaceName)}</span>
                    <span className="mind-day-date">{` - ${row.date}`}</span>
                  </div>
                  <div className="mind-row-sub">{row.title === '' ? '（无摘要）' : row.title}</div>
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
  const seen = new Set(previous.map(row => `${row.date}\u0000${row.workspaceId}`))
  const merged = [...previous]
  for (const row of incoming) {
    const key = `${row.date}\u0000${row.workspaceId}`
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
            {turn === null ? `${workspaceLabel(row.workspaceName)} · ${row.turnCount} turns` : `Turn #${turn.turnSeq} · ${timeOf(turn.occurredAt)}`}
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
  rule: '规则',
  user: '规则',
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

  const rules =
    state.data?.entries.rows.filter(entry => entry.layer === 'rule' || entry.layer === 'user') ?? []

  return (
    <>
      <div className="mind-scroll">
        <div className="mind-page mind-page-body">
          {rules.length === 0 ? (
            <div className="mind-empty">还没有规则。批准提案后会出现在这里。</div>
          ) : (
            <>
              <div className="mind-section-title">规则</div>
              {rules.map(entry => (
                <div
                  className={`mind-row mind-item${entry.enabled ? '' : ' mind-disabled'}`}
                  key={entry.id}
                  onClick={() => setEditing(entry)}
                >
                  <RowIcon kind="rule" />
                  <div className="mind-row-main">
                    <div className="mind-row-title">
                      {entry.title}
                      {entry.enabled ? null : <span className="mind-pill">已停用</span>}
                    </div>
                    <div className="mind-item-content">{entry.content}</div>
                  </div>
                  <div className="mind-row-meta">
                    v{entry.version} ·{' '}
                    {entry.workspaceId === null ? (
                      <span className="mind-row-workspace-name mind-row-workspace-missing">
                        未归属项目（请选择）
                      </span>
                    ) : (
                      <span className="mind-row-workspace-name" title={workspaceLabel(entry.workspaceName)}>
                        {workspaceLabel(entry.workspaceName)}
                      </span>
                    )}{' '}
                    · {dateOf(entry.updatedAt)}
                  </div>
                </div>
              ))}
            </>
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
      name: workspaceLabel(workspace.displayName),
    }))
    if (entry.workspaceId !== null && !options.some(option => option.id === entry.workspaceId)) {
      options.push({ id: entry.workspaceId, name: workspaceLabel(entry.workspaceName) })
    }
    return options
  }, [entry.workspaceId, entry.workspaceName, workspaces])

  const save = async (): Promise<void> => {
    if (title.trim() === '') {
      setError('标题不能为空')
      return
    }
    if (workspaceId === '') {
      setError('请先选择规则所属项目')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await callApi('saveEntry', {
        id: entry.id,
        layer: 'rule',
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
          <span style={{ flex: 1 }}>编辑规则</span>
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
              项目
            </label>
            <DshSelect
              id="mind-workspace"
              label="请选择项目"
              onChange={setWorkspaceId}
              options={[
                ...(workspaceId === ''
                  ? [{ id: '', label: '请选择项目' }]
                  : []),
                ...workspaceOptions.map(workspace => ({
                  id: workspace.id,
                  label: workspace.name,
                })),
              ]}
              value={workspaceId}
            />
            {workspaceOptions.length === 0 ? (
              <div className="mind-setting-desc">
                还没有工作区。先在 DSH 里打开一个目录对话，再设置规则。
              </div>
            ) : null}
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
          <button
            className="mind-btn mind-btn-primary"
            disabled={saving || workspaceId === '' || workspaceOptions.length === 0}
            onClick={() => void save()}
            type="button"
          >
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
                <div className="mind-row-title">{workspaceLabel(workspace.displayName)}</div>
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
  const workspaceState = useAsync(signal => callApi<WorkspacesPage>('workspaces', {}, signal), [])
  const [acting, setActing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [targets, setTargets] = useState<Record<string, string>>({})

  useEffect(() => {
    if (state.data !== null) onPendingChange(state.data.pendingCount)
  }, [state.data, onPendingChange])

  const act = async (proposal: Proposal, action: 'approve' | 'reject'): Promise<void> => {
    setActing(proposal.id)
    setActionError(null)
    try {
      const workspaceId = proposal.workspaceId ?? targets[proposal.id]
      await callApi('resolveProposal', {
        id: proposal.id,
        action,
        ...(workspaceId === undefined || workspaceId === '' ? {} : { workspaceId }),
      })
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
              {proposal.workspaceId === null ? (
                <div className="mind-proposal-target">
                  <DshSelect
                    label="选择项目"
                    onChange={next =>
                      setTargets(current => ({ ...current, [proposal.id]: next }))
                    }
                    options={
                      workspaceState.data?.rows.map(workspace => ({
                        id: workspace.workspaceId,
                        label: workspaceLabel(workspace.displayName),
                      })) ?? []
                    }
                    value={targets[proposal.id] ?? ''}
                  />
                </div>
              ) : null}
              <div className="mind-proposal-meta">
                {workspaceLabel(proposal.workspaceName)} · {dateOf(proposal.createdAt)}
                {proposal.sourceTurn === null ? '' : ` · ${proposal.sourceTurn}`}
              </div>
            </div>
            <div className="mind-proposal-actions">
              <button
                className="mind-btn mind-btn-primary"
                disabled={
                  acting === proposal.id ||
                  (proposal.workspaceId === null && (targets[proposal.id] ?? '') === '')
                }
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

function ReportsPage(): ReactNode {
  const workspaces = useAsync(
    signal => callApi<WorkspacesPage>('workspaces', { limit: 500 }, signal),
    [],
  )
  const [workspaceId, setWorkspaceId] = useState('')
  const [selected, setSelected] = useState<PeriodRow | null>(null)

  useEffect(() => {
    setSelected(null)
  }, [workspaceId])

  const periods = useAsync<PeriodsPage | null>(
    signal =>
      workspaceId === ''
        ? Promise.resolve(null)
        : callApi<PeriodsPage>('reports', { workspaceId, kind: 'month', limit: 200 }, signal),
    [workspaceId],
  )
  const report = useAsync<ReportText | null>(
    signal =>
      selected === null
        ? Promise.resolve(null)
        : callApi<ReportText>('report', { path: selected.reportPath }, signal),
    [selected],
  )

  useEffect(() => {
    if (selected === null && periods.data !== null && periods.data.rows.length > 0) {
      setSelected(periods.data.rows[0] ?? null)
    }
  }, [periods.data, selected])

  const options = workspaceTreeOptions(workspaces.data?.rows ?? [])

  return (
    <div className="mind-main">
      <div className="mind-list-wrap">
        <div className="mind-timeline-bar">
          <span className="mind-timeline-bar-label">工作区</span>
          <DshSelect
            label="工作区"
            onChange={setWorkspaceId}
            options={options}
            value={workspaceId}
          />
        </div>
        {workspaceId === '' ? (
          <div className="mind-empty">先选择一个工作区，再查看月报。</div>
        ) : periods.loading ? (
          <div className="mind-state">加载报告…</div>
        ) : periods.error !== null ? (
          <ErrorBox message={periods.error} onRetry={periods.reload} />
        ) : periods.data === null || periods.data.rows.length === 0 ? (
          <div className="mind-empty">这个工作区还没有月报。</div>
        ) : (
          <div className="mind-report-layout">
            <div className="mind-report-list">
              {periods.data.rows.map(period => (
                <button
                  className="mind-report-list-item"
                  data-active={selected?.period === period.period}
                  key={period.period}
                  onClick={() => setSelected(period)}
                  type="button"
                >
                  <span className="mind-report-period">{period.period}</span>
                  <span className="mind-report-sub">{period.title}</span>
                </button>
              ))}
            </div>
            <div className="mind-report-view">
              {selected === null ? (
                <div className="mind-empty">选择一个月份查看月报。</div>
              ) : report.loading ? (
                <div className="mind-state">加载中…</div>
              ) : report.error !== null ? (
                <ErrorBox message={report.error} onRetry={report.reload} />
              ) : report.data === null ? null : (
                <MarkdownPreview text={report.data.content} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'timeline', label: '时间线' },
  { id: 'reports', label: '报告' },
  { id: 'current', label: '规则' },
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
      {tab === 'reports' ? <ReportsPage /> : null}
      {tab === 'current' ? <CurrentPage /> : null}
      {tab === 'workspaces' ? <WorkspacesPage /> : null}
      {tab === 'proposals' ? <ProposalsPage onPendingChange={setPending} /> : null}
      {tab === 'settings' ? <SettingsPage /> : null}
    </div>
  )
}
