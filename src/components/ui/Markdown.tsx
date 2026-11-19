/**
 * Safe "markdown-lite" renderer (no HTML injection):
 *   paragraphs (blank line), "- " / "* " bullets, "1. " numbered lists, **bold**, *italic*,
 *   [[term-id]] / [[term-id|label]] glossary links (with hover definition).
 */
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { content } from '@/content';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[2]) out.push(<TermLink key={k} id={m[2]} label={m[3]} />);
    else if (m[4]) out.push(<strong key={k}>{inline(m[4], k)}</strong>);
    else if (m[5]) out.push(<em key={k}>{m[5]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function TermLink({ id, label }: { id: string; label?: string }) {
  const t = content.termById.get(id);
  const text = label ?? t?.term ?? id.replace(/-/g, ' ');
  if (!t) return <span>{text}</span>;
  return (
    <Tooltip content={<span><strong>{t.term}:</strong> {t.plain}</span>}>
      <Link to={`/dictionary/${t.id}`} className="font-medium text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid">{text}</Link>
    </Tooltip>
  );
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className={cn('prose-study', className)}>
      {blocks.map((b, bi) => {
        const lines = b.split('\n').filter((l) => l.trim() !== '');
        if (lines.length && lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ''), `${bi}-${li}`)}</li>)}</ul>;
        if (lines.length && lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
          return <ol key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''), `${bi}-${li}`)}</li>)}</ol>;
        // mixed: paragraph lines followed by bullets
        const firstBullet = lines.findIndex((l) => /^\s*[-*]\s+/.test(l));
        if (firstBullet > 0 && lines.slice(firstBullet).every((l) => /^\s*[-*]\s+/.test(l)))
          return (
            <Fragment key={bi}>
              <p>{inline(lines.slice(0, firstBullet).join(' '), `${bi}p`)}</p>
              <ul>{lines.slice(firstBullet).map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ''), `${bi}-${li}`)}</li>)}</ul>
            </Fragment>
          );
        return <p key={bi}>{inline(lines.join(' '), `${bi}`)}</p>;
      })}
    </div>
  );
}

/** Plain text (strip markdown-lite) — for text-to-speech and search. */
export function plainText(md: string): string {
  return md
    .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([a-z0-9-]+)\]\]/g, (_, id: string) => content.termById.get(id)?.term ?? id.replace(/-/g, ' '))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .trim();
}
