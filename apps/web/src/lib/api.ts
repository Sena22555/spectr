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

export async function uploadImage(file: File) {
  if (__DEMO__) return (await import('../demo/mock')).demoUpload(file);
  const form = new FormData();
  form.append('file', file);
  return api<{ url: string }>('/uploads', { method: 'POST', body: form });
}
