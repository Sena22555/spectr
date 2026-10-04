import type { Widget } from '../../../lib/practice';
import { RefractionLab } from './RefractionLab';
import { BinaryLab, MotionLab, OhmLab, PercentLab, QuadraticLab } from './OtherLabs';

export function Lab({ widget }: { widget: Widget }) {
  switch (widget) {
    case 'refraction':
      return <RefractionLab />;
    case 'binary':
      return <BinaryLab />;
    case 'motion':
      return <MotionLab />;
    case 'ohm':
      return <OhmLab />;
    case 'quadratic':
      return <QuadraticLab />;
    case 'percent':
      return <PercentLab />;
  }
}

export const LAB_TITLE: Record<Widget, string> = {
  refraction: 'Призма Ньютона',
  binary: 'Двоичный переключатель',
  motion: 'Разгон и торможение',
  ohm: 'Цепь с резисторами',
  quadratic: 'Парабола и корни',
  percent: 'Два изменения подряд',
};
