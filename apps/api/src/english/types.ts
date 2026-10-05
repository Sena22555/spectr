// Типы «СпектрLingo». Уровни как в учебниках: Starter (с нуля) → A1 → A2 → B1 (ОГЭ, база ЕГЭ).

export type Word = [en: string, ru: string, emoji?: string];
export type Phrase = [en: string, ru: string];
/** предложение с пропуском «___» (в скобках — подсказка), варианты, номер верного, перевод */
export type Gap = [sentence: string, options: string[], answer: number, ru: string];
export type Level = 'Starter' | 'A1' | 'A2' | 'B1';

export interface Unit {
  id: string;
  title: string;
  ru: string;
  level: Level;
  grades: [number, number];
  icon: string;
  words: Word[];
  phrases: Phrase[];
  grammar: { title: string; rule: string[]; gaps: Gap[] };
}
