import { useEffect, useRef } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-600.css';
import '@fontsource/schibsted-grotesk/latin-700.css';
import '@fontsource/schibsted-grotesk/latin-800.css';
import './ascend.css';
import { msUntilMidnight } from '@/lib/dates';
import { setPortal } from '@/lib/portal';
import { levelInfo, weekdayOf, dailyCount, ASCEND, type Theme } from './logic';
import { useAscend } from './store';
import { newDraft } from './drafts';
import { Bar, Celebrations, Floats, Icon, Toasts, fmt, statVar, totalXp, type IconName } from './ui';
import { SheetHost, fmtClock, timerRemaining, useFocusTicker } from './sheets';
import { CharacterScreen } from './screens/Character';
import { QuestsScreen } from './screens/Quests';
import { SkillsScreen } from './screens/Skills';
import { RewardsScreen } from './screens/Rewards';
import { StatsScreen } from './screens/Stats';
import { SettingsScreen } from './screens/Settings';

const ROUTES: Array<{ path: string; label: string; icon: IconName }> = [
  { path: '/ascend', label: 'Character', icon: 'user' },
  { path: '/ascend/quests', label: 'Quests', icon: 'list' },
  { path: '/ascend/skills', label: 'Skills', icon: 'branch' },
  { path: '/ascend/rewards', label: 'Rewards', icon: 'ticket' },
  { path: '/ascend/stats', label: 'Stats', icon: 'bars' },
];
const THEME_ICON: Record<Theme, IconName> = { system: 'auto', light: 'sun', dark: 'moon' };
const THEME_LABEL: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };

/** Ascend — the gamified life RPG. Shares the sign-in with the System but
 *  none of its UI or data: everything lives in the ascend_* tables. */
export function AscendApp({ userId }: { userId: string }) {
  const status = useAscend((s) => s.status);
  const loadedFor = useAscend((s) => s.uid);
  const error = useAscend((s) => s.error);
  const init = useAscend((s) => s.init);
  const theme = useAscend((s) => s.data.settings.theme);
  const syncToday = useAscend((s) => s.syncToday);
  const tz = useAscend((s) => s.tz);
  const root = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => { setPortal('ascend'); void init(userId); }, [init, userId]);

  // The day rolls over at local midnight in the player's timezone; re-check
  // on wake too, since a sleeping phone never fires the timer.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const arm = () => { t = setTimeout(() => { syncToday(); arm(); }, msUntilMidnight(tz) + 1000); };
    const wake = () => { if (document.visibilityState === 'visible') { syncToday(); clearTimeout(t); arm(); } };
    arm();
    document.addEventListener('visibilitychange', wake);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', wake); };
  }, [syncToday, tz]);

  useEffect(() => { root.current?.scrollTo({ top: 0 }); }, [location.pathname]);

  // Match the phone's status bar to the theme while Ascend is open.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content');
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    meta?.setAttribute('content', dark ? '#0B0D11' : '#F4F5F7');
    return () => { if (prev) meta?.setAttribute('content', prev); };
  }, [theme]);

  useFocusTicker();

  return (
    <div className="ascend-root" ref={root} data-theme={theme === 'system' ? undefined : theme}>
      {status === 'ready' && loadedFor === userId ? (
        <div className="shell">
          <Sidebar />
          <div style={{ minWidth: 0 }}>
            <TopBar />
            <main className="main">
              <Routes>
                <Route index element={<CharacterScreen />} />
                <Route path="quests" element={<QuestsScreen />} />
                <Route path="skills" element={<SkillsScreen />} />
                <Route path="rewards" element={<RewardsScreen />} />
                <Route path="stats" element={<StatsScreen />} />
                <Route path="settings" element={<SettingsScreen />} />
                <Route path="*" element={<Navigate to="/ascend" replace />} />
              </Routes>
            </main>
          </div>
          <TabBar />
          <Fab />
          <SheetHost />
          <Celebrations rootRef={root} />
          <Floats />
        </div>
      ) : (
        <div className="loading">
          <span className="brand" style={{ margin: 0 }}><span className="brand-mark"><Icon name="up" /></span>Ascend</span>
          {status === 'error' ? (
            <>
              <p>{error}</p>
              <button className="btn primary" onClick={() => void init(userId)}>Try again</button>
            </>
          ) : <p>Loading your character…</p>}
        </div>
      )}
      <Toasts />
    </div>
  );
}

function ThemeButton({ wide }: { wide?: boolean }) {
  const theme = useAscend((s) => s.data.settings.theme);
  const save = useAscend((s) => s.saveSettings);
  const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const onClick = () => void save({ theme: next });
  return wide
    ? <button className="navbtn" onClick={onClick}><Icon name={THEME_ICON[theme]} />{THEME_LABEL[theme]}</button>
    : <button className="iconbtn" onClick={onClick} aria-label={`${THEME_LABEL[theme]} (tap to switch)`} title={THEME_LABEL[theme]}><Icon name={THEME_ICON[theme]} /></button>;
}

function FocusPill() {
  const timer = useAscend((s) => s.timer);
  const sheet = useAscend((s) => s.sheet);
  const data = useAscend((s) => s.data);
  const openSheet = useAscend((s) => s.openSheet);
  if (!timer || sheet?.kind === 'focus') return null;
  const q = data.quests.find((x) => x.id === timer.questId);
  return (
    <button className="focus-pill" style={statVar(data, q?.statId)} onClick={() => openSheet({ kind: 'focus' })}>
      <Icon name="timer" /><span className="num">{fmtClock(timerRemaining(timer))}</span>
    </button>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <NavLink className="brand" to="/ascend" end><span className="brand-mark"><Icon name="up" /></span>Ascend</NavLink>
      <FocusPill />
      <ThemeButton />
      <NavLink className="iconbtn" to="/ascend/settings" aria-label="Settings"><Icon name="gear" /></NavLink>
    </header>
  );
}

function Sidebar() {
  const data = useAscend((s) => s.data);
  const L = levelInfo(totalXp(data));
  const navigate = useNavigate();
  return (
    <aside className="side" aria-label="Ascend navigation">
      <NavLink className="brand" to="/ascend" end><span className="brand-mark"><Icon name="up" /></span>Ascend</NavLink>
      {ROUTES.map((r) => (
        <NavLink key={r.path} to={r.path} end={r.path === '/ascend'} className={({ isActive }) => `navbtn${isActive ? ' active' : ''}`}><Icon name={r.icon} />{r.label}</NavLink>
      ))}
      <div className="side-foot">
        <FocusPill />
        <div className="side-lvl">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>Level {L.level}</b><span className="num muted">{fmt(L.xp)} XP</span></div>
          <Bar pct={L.pct} />
        </div>
        <ThemeButton wide />
        <NavLink to="/ascend/settings" className={({ isActive }) => `navbtn${isActive ? ' active' : ''}`}><Icon name="gear" />Settings</NavLink>
        <button className="navbtn" onClick={() => { setPortal('system'); navigate('/'); }}><Icon name="swap" />Switch to the System</button>
      </div>
    </aside>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Ascend navigation">
      {ROUTES.map((r) => (
        <NavLink key={r.path} to={r.path} end={r.path === '/ascend'} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}><Icon name={r.icon} /><span>{r.label}</span></NavLink>
      ))}
    </nav>
  );
}

function Fab() {
  const location = useLocation();
  const today = useAscend((s) => s.today);
  const data = useAscend((s) => s.data);
  const openSheet = useAscend((s) => s.openSheet);
  if (location.pathname.startsWith('/ascend/settings')) return null;
  const onQuests = location.pathname.startsWith('/ascend/quests');
  const tab = new URLSearchParams(location.search).get('tab');
  const kind = onQuests ? (tab === 'side' ? 'side' : tab === 'main' ? 'main' : tab === 'bosses' ? 'boss' : tab === 'done' ? 'side' : 'daily') : 'daily';
  const wd = weekdayOf(today);
  const days = kind === 'daily' && dailyCount(data, wd) < ASCEND.daily.max ? [wd] : [];
  return (
    <button className="fab" aria-label="Add a quest" onClick={() => openSheet({ kind: 'quest', draft: newDraft(kind, days) })}><Icon name="plus" /></button>
  );
}
