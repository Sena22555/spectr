import { Fragment, type ReactNode } from 'react';
import { RichText } from '../Tex';

// Простой Markdown для ответов помощников: абзацы, списки, **жирный**, `код`, формулы $…$.
// Без сторонних библиотек и без HTML из ответа — только безопасные элементы.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<RichText key={`${key}-t${i++}`} text={text.slice(last, m.index)} />);
    if (m[1]) out.push(<b key={`${key}-b${i++}`}>{m[1]}</b>);
    else out.push(<code key={`${key}-c${i++}`} className="rounded-[4px] bg-ink/[0.07] px-1 font-mono text-[0.92em]">{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<RichText key={`${key}-t${i++}`} text={text.slice(last)} />);
  return out;
}

export function Markdown({ text }: { text: string }) {
  // «P.S.» и ремарки модели не показываем
  const src = text.replace(/\\\(|\\\)|\\\[|\\\]/g, '$').replace(/^#{1,4}\s*/gm, '').replace(/\s*P\.?\s?S\.?[^\n]*/g, '');
  const lines = src.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l${blocks.length}`} className={list.ordered ? 'my-1 list-decimal pl-5' : 'my-1 list-disc pl-5'}>
        {list.items.map((it, k) => (
          <li key={k} className="my-0.5">
            {inline(it, `li${blocks.length}-${k}`)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]!);
      return;
    }
    flush();
    if (line) blocks.push(<p key={`p${idx}`} className="my-1">{inline(line, `p${idx}`)}</p>);
  });
  flush();
  return <Fragment>{blocks}</Fragment>;
}
