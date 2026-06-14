import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

const TABS = [
  { to: '/', label: 'Status', icon: '◈' },
  { to: '/training', label: 'Training', icon: '⚔' },
  { to: '/dungeons', label: 'Dungeons', icon: '⬡' },
  { to: '/books', label: 'Library', icon: '✦' },
  { to: '/skills', label: 'Skills', icon: '✶' },
  { to: '/more', label: 'System', icon: '☰' },
];

export function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-accent-cyan/25 bg-bg-base/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2 font-sys text-[0.6rem] uppercase tracking-widest"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-glow"
                    className="absolute -top-px h-0.5 w-10 bg-accent-cyan"
                    style={{ boxShadow: '0 0 10px #4ecbff' }}
                  />
                )}
                <span
                  className={`text-lg leading-none ${isActive ? 'text-accent-cyan glow-text' : 'text-slate-500'}`}
                >
                  {tab.icon}
                </span>
                <span className={isActive ? 'text-accent-cyan' : 'text-slate-500'}>
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
