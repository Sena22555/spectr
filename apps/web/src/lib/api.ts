const TOKEN_KEY = 'spectr.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* приватный режим — токен живёт только до перезагрузки */
  }
  memoryToken = token;
}

let memoryToken: string | null = null;

// id посетителя для аналитики: живёт в браузере, по нему видно путь человека до записи
const VISITOR_KEY = 'spectr.vid';
let memoryVisitor: string | null = null;
export function visitorId() {
  if (memoryVisitor) return memoryVisitor;
  try {
    memoryVisitor = localStorage.getItem(VISITOR_KEY);
    if (!memoryVisitor) {
      memoryVisitor = crypto.randomUUID?.() ?? `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VISITOR_KEY, memoryVisitor);
    }
  } catch {
    memoryVisitor ??= `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return memoryVisitor;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = getToken() ?? memoryToken;
  if (__DEMO__) {
    const { demoApi } = await import('../demo/mock');
    return demoApi<T>(path, init, token);
  }
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-visitor': visitorId(),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => null);
  if (res.ok && data === null) throw new ApiError(res.status, 'Сервер вернул неожиданный ответ. Обновите страницу.');
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? 'Сервер не ответил. Проверьте соединение и попробуйте ещё раз.');
  }
  return data as T;
}

/** Заголовки для запросов в обход api() (например, потоковый ответ чата). */
export function apiHeaders(): Record<string, string> {
  const token = getToken() ?? memoryToken;
  return { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-visitor': visitorId() };
}

export async function uploadImage(file: File) {
  if (__DEMO__) return (await import('../demo/mock')).demoUpload(file);
  const form = new FormData();
  form.append('file', file);
  return api<{ url: string }>('/uploads', { method: 'POST', body: form });
}
