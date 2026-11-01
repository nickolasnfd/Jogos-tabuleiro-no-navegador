import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Move } from '../engine/types';
import type { StateReply } from '../server/handler';
import { ApiError, call, realtime } from './api';
import type { Creds } from './api';

export interface RoomHook {
  data: StateReply | null;
  error: string | null;
  fatal: string | null;
  toast: string | null;
  act: (m: Move) => Promise<void>;
  send: (op: 'start' | 'rematch' | 'leave') => Promise<void>;
  refresh: () => void;
  /** milissegundos até o prazo atual (ajustado pelo relógio do servidor) */
  msLeft: (deadline: number | null) => number | null;
}

export function useRoom(code: string, creds: Creds | null): RoomHook {
  const [data, setData] = useState<StateReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const skew = useRef(0);
  const revRef = useRef(-1);
  const busy = useRef(false);
  const credsRef = useRef(creds);
  credsRef.current = creds;

  const accept = useCallback((r: StateReply) => {
    skew.current = r.serverNow - Date.now();
    if (r.rev >= revRef.current) {
      revRef.current = r.rev;
      setData(r);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const c = credsRef.current;
      const r = await call({ op: 'state', code, ...(c ? { playerId: c.playerId, secret: c.secret } : {}) });
      accept(r);
      setError(null);
    } catch (e) {
      const ae = e as ApiError;
      if (ae.status === 403 || ae.status === 404) setFatal(ae.message);
      else setError(ae.message);
    } finally {
      busy.current = false;
    }
  }, [code, accept]);

  // polling (rede de segurança) + atualização imediata ao voltar para a aba
  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(), document.hidden ? 4000 : 1500);
    const onVis = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onVis);
    };
  }, [refresh]);

  // tempo real (opcional): avisos de "mudou" via Supabase Realtime Broadcast
  useEffect(() => {
    if (!realtime.url || !realtime.key) return;
    const sb = createClient(realtime.url, realtime.key, { auth: { persistSession: false } });
    const ch = sb
      .channel(`omerta:${code}`)
      .on('broadcast', { event: 'changed' }, () => refresh())
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [code, refresh]);

  // quando o prazo vence, pede ao servidor para aplicar o timeout
  const deadline = data?.view?.deadline ?? null;
  useEffect(() => {
    if (deadline == null) return;
    const wait = Math.max(0, deadline - (Date.now() + skew.current)) + 350;
    const id = setTimeout(() => refresh(), wait);
    return () => clearTimeout(id);
  }, [deadline, data?.rev, refresh]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 3200);
  }, []);

  const act = useCallback(
    async (move: Move) => {
      const c = credsRef.current;
      if (!c) return;
      try {
        accept(await call({ op: 'act', code, playerId: c.playerId, secret: c.secret, move }));
      } catch (e) {
        const ae = e as ApiError;
        if (ae.state) accept(ae.state);
        showToast(ae.message);
      }
    },
    [code, accept, showToast],
  );

  const send = useCallback(
    async (op: 'start' | 'rematch' | 'leave') => {
      const c = credsRef.current;
      if (!c) return;
      try {
        const r = await call<any>({ op, code, playerId: c.playerId, secret: c.secret });
        if (op !== 'leave') accept(r);
      } catch (e) {
        showToast((e as ApiError).message);
      }
    },
    [code, accept, showToast],
  );

  const msLeft = useCallback((dl: number | null) => (dl == null ? null : dl - (Date.now() + skew.current)), []);

  return { data, error, fatal, toast, act, send, refresh, msLeft };
}

/** re-renderiza a cada `ms` (para contagens regressivas) */
export function useTicker(ms = 100) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
