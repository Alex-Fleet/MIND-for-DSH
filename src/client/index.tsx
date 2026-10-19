import type { ReactNode } from 'react'
import { injectStyles } from './styles'
import { MindApp } from './ui'

export const inject = ['slots'] as const

interface SlotsService {
  inject(name: string, factory: () => (() => void) | void): void
  register(options: Record<string, unknown>, component: (props: never) => unknown): () => void
}

interface ClientContext {
  slots: SlotsService
  effect(factory: () => () => void, label?: string): void
}

/**
 * Browser half of MIND for DSH.
 *
 * The sidebar entry and the global main panel share the id `mind`, so the
 * sidebar shell selects the panel without extra wiring.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => injectStyles(), 'mind-dsh: styles')
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: 'mind' }, MindApp as (props: never) => unknown),
  )
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: 'mind', order: 30, label: '记忆' },
      MindIcon as (props: never) => unknown,
    ),
  )
}

function MindIcon({ size = 16 }: { size?: number }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h9A1.5 1.5 0 0 1 17 4.5V21l-6-3-6 3V4.5Z" />
      <path d="M9 8h4" />
      <path d="M9 11.5h4" />
    </svg>
  )
}
