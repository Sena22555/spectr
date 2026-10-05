// Имя для публичных таблиц (турнир, вызовы): запоминаем, чтобы не вводить каждый раз.
const NICK_KEY = 'spectr.nick';

export function savedNick() {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNick(name: string) {
  try {
    localStorage.setItem(NICK_KEY, name.trim());
  } catch {
    /* ignore */
  }
}
