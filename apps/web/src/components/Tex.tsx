import { Fragment, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

// KaTeX грузится отдельным файлом и только когда на странице есть формулы,
// чтобы главная открывалась быстро. Пока он грузится, формула видна как текст.
type Katex = typeof import('katex').default;
let katexPromise: Promise<Katex> | null = null;
let katexReady: Katex | null = null;
function loadKatex() {
  katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => {
    katexReady = m.default;
    return m.default;
  });
  return katexPromise;
}

function useKatex() {
  const [k, setK] = useState<Katex | null>(katexReady);
  useEffect(() => {
    if (k) return;
    let alive = true;
    loadKatex().then((m) => alive && setK(() => m));
    return () => {
      alive = false;
    };
  }, [k]);
  return k;
}

/** Формула TeX. block — отдельной строкой. */
export function Tex({ tex, block, className }: { tex: string; block?: boolean; className?: string }) {
  const katex = useKatex();
  const html = useMemo(() => {
    if (!katex) return null;
    try {
      return katex.renderToString(tex, { displayMode: Boolean(block), throwOnError: false, strict: 'ignore' });
    } catch {
      return null;
    }
  }, [katex, tex, block]);
  if (!html) return <span className={clsx(block ? 'block py-1' : 'inline', 'font-mono text-[0.92em] text-muted', className)}>{tex}</span>;
  return <span className={clsx(block ? 'block overflow-x-auto overflow-y-hidden py-1' : 'inline', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Текст с вставками $формул$ и `кода`. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => text.split(/(\$[^$]+\$|`[^`]+`)/g).filter(Boolean), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith('$') && p.length > 2 ? (
          <Tex key={i} tex={p.slice(1, -1)} />
        ) : p.startsWith('`') && p.length > 2 ? (
          <code key={i} className="rounded-[4px] bg-ink/[0.07] px-1.5 py-0.5 font-mono text-[0.92em]">
            {p.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}
