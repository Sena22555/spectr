import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken, setToken } from './api';
import { isMiniApp, miniAppLogin } from './platform';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<User>;
  register(data: { name: string; email: string; password: string; phone?: string }): Promise<User>;
  verifyEmail(code: string): Promise<User>;
  resendCode(): Promise<void>;
  requestReset(email: string): Promise<void>;
  confirmReset(data: { email: string; code: string; password: string }): Promise<User>;
  logout(): void;
  refresh(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [miniAppTried, setMiniAppTried] = useState(!isMiniApp || Boolean(getToken()));

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => api<{ user: User }>('/auth/me').then((r) => r.user),
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
  });

  // токен протух — выходим
  useEffect(() => {
    if (me.isError) {
      setToken(null);
      setTokenState(null);
    }
  }, [me.isError]);

  // В Telegram/VK входим автоматически по подписанным данным платформы
  useEffect(() => {
    if (miniAppTried) return;
    miniAppLogin().then((res) => {
      if (res) {
        setToken(res.token);
        setTokenState(res.token);
        qc.setQueryData(['me', res.token], res.user);
      }
      setMiniAppTried(true);
    });
  }, [miniAppTried, qc]);

  const accept = useCallback(
    (res: { token: string; user: User }) => {
      setToken(res.token);
      setTokenState(res.token);
      qc.setQueryData(['me', res.token], res.user);
      return res.user;
    },
    [qc],
  );

  const value = useMemo<AuthState>(
    () => ({
      user: token ? (me.data ?? null) : null,
      loading: !miniAppTried || (Boolean(token) && me.isPending),
      login: (email, password) =>
        api<{ token: string; user: User }>('/auth/login', { method: 'POST', json: { email, password } }).then(accept),
      register: (data) => api<{ token: string; user: User }>('/auth/register', { method: 'POST', json: data }).then(accept),
      verifyEmail: (code) =>
        api<{ user: User }>('/auth/email/verify', { method: 'POST', json: { code } }).then((r) => {
          qc.setQueryData(['me', token], r.user);
          return r.user;
        }),
      resendCode: () => api('/auth/email/send', { method: 'POST', json: {} }).then(() => undefined),
      requestReset: (email) => api('/auth/reset/request', { method: 'POST', json: { email } }).then(() => undefined),
      confirmReset: (data) => api<{ token: string; user: User }>('/auth/reset/confirm', { method: 'POST', json: data }).then(accept),
      logout: () => {
        setToken(null);
        setTokenState(null);
        qc.clear();
      },
      refresh: () => {
        qc.invalidateQueries({ queryKey: ['me'] });
      },
    }),
    [token, me.data, me.isPending, miniAppTried, accept, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
