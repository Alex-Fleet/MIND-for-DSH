import { Fragment, useMemo, type ReactNode } from 'react'

/**
 * A deliberately small, safe Markdown preview for rule content.
 *
 * It supports the shapes that show up in rules: headings, paragraphs, lists,
 * blockquotes, fenced code, rules, bold, italic, inline code, and http(s)
 * links. Raw HTML is never interpreted.
 */
export function MarkdownPreview({ text }: { text: string }): ReactNode {
  const blocks = useMemo(() => parseBlocks(text), [text])
  return <div className="mind-md">{blocks}</div>
}

function parseBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  let index = 0
  let key = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.trim() === '') {
      index += 1
      continue
    }

    const fence = /^```(.*)$/.exec(line)
    if (fence !== null) {
      const language = fence[1]?.trim() ?? ''
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '')
        index += 1
      }
      index += 1
      nodes.push(
        <pre className="mind-md-code" key={key++}>
          {language === '' ? null : <span className="mind-md-lang">{language}</span>}
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      const level = heading[1]?.length ?? 1
      const content = heading[2] ?? ''
      const Tag = (`h${Math.min(6, level + 2)}`) as 'h3'
      nodes.push(
        <Tag className="mind-md-heading" key={key++}>
          {inline(content)}
        </Tag>,
      )
      index += 1
      continue
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      nodes.push(<hr className="mind-md-rule" key={key++} />)
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        body.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }
      nodes.push(
        <blockquote className="mind-md-quote" key={key++}>
          {inline(body.join('\n'))}
        </blockquote>,
      )
      continue
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*([-*+]|\d+\.)\s+/, ''))
        index += 1
      }
      const ListTag = ordered ? 'ol' : 'ul'
      nodes.push(
        <ListTag className="mind-md-list" key={key++}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </ListTag>,
      )
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index] ?? ''
      if (next.trim() === '' || /^(#{1,6})\s|^```|^>\s?|^\s*([-*+]|\d+\.)\s+/.test(next)) break
      paragraph.push(next)
      index += 1
    }
    nodes.push(
      <p className="mind-md-p" key={key++}>
        {inline(paragraph.join('\n'))}
      </p>,
    )
  }

  return nodes
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>)
    const token = match[0]
    if (match[1] !== undefined) {
      parts.push(
        <code className="mind-md-inline" key={key++}>
          {token.slice(1, -1)}
        </code>,
      )
    } else if (match[2] !== undefined) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else if (match[3] !== undefined) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>)
    } else {
      const label = match[4]?.slice(1, match[4].indexOf(']')) ?? ''
      const href = match[5] ?? ''
      parts.push(
        <a className="mind-md-link" href={href} key={key++} rel="noreferrer noopener" target="_blank">
          {label}
        </a>,
      )
    }
    last = match.index + token.length
  }

  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return parts
}
