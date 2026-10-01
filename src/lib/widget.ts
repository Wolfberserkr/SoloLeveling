// Bridge to the Android home-screen Ascend widget (android/…/AscendWidget*).
// The widget can't run the web app, so the app hands it two things:
//  • a snapshot of today's dailies + level, re-sent whenever Ascend data changes;
//  • the current access token, so a tap on the widget can complete a quest.
// The widget never refreshes the token itself (that would rotate the refresh
// token out from under the web app); once it expires a tap opens the app.
// On the web every call is a no-op.
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Session } from '@supabase/supabase-js';

interface AscendWidgetPlugin {
  sync(opts: { snapshot: string }): Promise<void>;
  setSession(opts: { url: string; anonKey: string; accessToken: string; expiresAt: number }): Promise<void>;
  clear(): Promise<void>;
}

const native = Capacitor.getPlatform() === 'android';
const plugin = native ? registerPlugin<AscendWidgetPlugin>('AscendWidget') : null;

export const isNativeApp = native;

export interface WidgetSnapshot {
  tz: string;
  level: number;
  title: string;
  xp: number;
  dailies: Array<{ id: string; title: string; xp: number; days: number[]; color: string }>;
  doneDate: string;
  doneIds: string[];
}

let last = '';
export function syncWidget(s: WidgetSnapshot): void {
  if (!plugin) return;
  const json = JSON.stringify(s);
  if (json === last) return;
  last = json;
  plugin.sync({ snapshot: json }).catch(() => {});
}

export function syncWidgetSession(session: Session | null, url: string, anonKey: string): void {
  if (!plugin) return;
  if (!session) {
    last = '';
    plugin.clear().catch(() => {});
    return;
  }
  plugin
    .setSession({ url, anonKey, accessToken: session.access_token, expiresAt: session.expires_at ?? 0 })
    .catch(() => {});
}

/** Widget taps open thesystem://ascend/… — route the app there, both on cold
 *  start and when it is already running. */
export function listenForDeepLinks(go: (path: string) => void): () => void {
  if (!native) return () => {};
  const route = (url: string | undefined) => {
    if (!url?.startsWith('thesystem://')) return;
    const path = '/' + url.slice('thesystem://'.length).replace(/^\/+/, '');
    go(path);
  };
  let cancelled = false;
  const handle = import('@capacitor/app').then(({ App }) => {
    void App.getLaunchUrl().then((r) => { if (!cancelled) route(r?.url); });
    return App.addListener('appUrlOpen', (e) => route(e.url));
  });
  return () => {
    cancelled = true;
    void handle.then((h) => h.remove());
  };
}
