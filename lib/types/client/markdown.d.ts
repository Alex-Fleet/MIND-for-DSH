import { type ReactNode } from 'react';
/**
 * A deliberately small, safe Markdown preview for rule content.
 *
 * It supports the shapes that show up in rules: headings, paragraphs, lists,
 * blockquotes, fenced code, rules, bold, italic, inline code, and http(s)
 * links. Raw HTML is never interpreted.
 */
export declare function MarkdownPreview({ text }: {
    text: string;
}): ReactNode;
