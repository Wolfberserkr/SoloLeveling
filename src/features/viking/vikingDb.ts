// Supabase data layer for Project Viking: a per-user document store in the
// `viking_docs` table (RLS scopes every row to auth.uid()). Cache-first — the
// UI renders instantly from localStorage, then the server copy replaces it.
// Writes are optimistic; a failed write reloads the server copy so the screen
// never shows something that wasn't saved.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { COLLS, emptyData, type Coll, type DocOf, type Settings, type VikingData } from './vikingLogic';

const TABLE = 'viking_docs';
const PAGE = 1000; // PostgREST's default row cap per request
const cacheKey = (uid: string) => `viking_cache_v1_${uid}`;

function readCache(uid: string): VikingData | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    if (raw) return { ...emptyData(), ...(JSON.parse(raw) as VikingData) };
  } catch {
    /* private mode / corrupt cache: start from the server */
  }
  return null;
}
function writeCache(uid: string, d: VikingData) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(d));
  } catch {
    /* quota: the server copy is the source of truth anyway */
  }
}

type Row = { coll: string; doc_id: string; data: unknown };

async function fetchAll(uid: string): Promise<VikingData> {
  const out = emptyData();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('coll, doc_id, data')
      .eq('user_id', uid)
      .order('coll')
      .order('doc_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of (data ?? []) as Row[]) {
      if (r.coll === 'settings') out.settings = r.data as Settings;
      else if ((COLLS as string[]).includes(r.coll)) (out[r.coll as Coll] as Record<string, unknown>)[r.doc_id] = r.data;
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export type SyncState = 'connecting' | 'live' | 'offline';

export function useVikingData(uid: string, onError: (msg: string) => void) {
  const cached = useRef(readCache(uid));
  const [data, setData] = useState<VikingData>(() => cached.current ?? emptyData());
  // With a cache we can render the real screen straight away; without one,
  // the setup card must wait for the server so it doesn't flash at a
  // returning user on a new device.
  const [loaded, setLoaded] = useState(cached.current != null);
  const [sync, setSync] = useState<SyncState>('connecting');
  const dataRef = useRef(data);
  dataRef.current = data;
  const errRef = useRef(onError);
  errRef.current = onError;

  const commit = useCallback((d: VikingData) => {
    dataRef.current = d;
    setData(d);
    writeCache(uid, d);
  }, [uid]);

  const reload = useCallback(async () => {
    try {
      const d = await fetchAll(uid);
      commit(d);
      setLoaded(true);
      setSync('live');
    } catch {
      setSync('offline');
      setLoaded(true);
    }
  }, [uid, commit]);

  useEffect(() => {
    void reload();
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Writes to the same document are chained so they land in order.
  const queues = useRef(new Map<string, Promise<unknown>>());
  function enqueue(key: string, job: () => Promise<{ error: unknown }>): Promise<boolean> {
    const run = (queues.current.get(key) ?? Promise.resolve()).then(job);
    queues.current.set(key, run.catch(() => undefined));
    return run.then(
      ({ error }) => {
        if (error) throw error;
        setSync('live');
        return true;
      },
    ).catch(() => {
      errRef.current('Couldn’t save that. Check your connection and try again.');
      setSync('offline');
      void reload();
      return false;
    });
  }

  function put(coll: 'settings', id: 'settings', doc: Settings): Promise<boolean>;
  function put<C extends Coll>(coll: C, id: string, doc: DocOf[C]): Promise<boolean>;
  function put(coll: Coll | 'settings', id: string, doc: unknown): Promise<boolean> {
    const cur = dataRef.current;
    commit(coll === 'settings'
      ? { ...cur, settings: doc as Settings }
      : { ...cur, [coll]: { ...cur[coll], [id]: doc } });
    return enqueue(`${coll}/${id}`, async () =>
      supabase.from(TABLE).upsert(
        { user_id: uid, coll, doc_id: id, data: doc, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,coll,doc_id' },
      ));
  }

  function del(coll: Coll, id: string): Promise<boolean> {
    const cur = dataRef.current;
    const next = { ...cur[coll] };
    delete next[id];
    commit({ ...cur, [coll]: next });
    return enqueue(`${coll}/${id}`, async () =>
      supabase.from(TABLE).delete().eq('user_id', uid).eq('coll', coll).eq('doc_id', id));
  }

  return { data, loaded, sync, put, del };
}
