import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Появление при прокрутке: блок всплывает на пружине spring(320, 26).
 * Пока блок не в кадре, маркер в заголовках внутри стоит на паузе (data-reveal без data-in).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  rotate = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  rotate?: number;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const reduce = useReducedMotion();
  const [inView, setInView] = useState(false);
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      data-reveal=""
      data-in={inView || reduce ? '' : undefined}
      initial={reduce ? false : { opacity: 0, y, rotate: rotate ? rotate * 2.2 : 0, scale: rotate ? 0.94 : 1 }}
      whileInView={{ opacity: 1, y: 0, rotate, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      onViewportEnter={() => setInView(true)}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay }}
    >
      {children}
    </Tag>
  );
}
