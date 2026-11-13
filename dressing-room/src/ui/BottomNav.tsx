import { NavLink } from 'react-router-dom';
import { he } from '../i18n/he';
import { IconHanger, IconHeart, IconMirror, IconScissors } from './icons';

const tabs = [
  { to: '/', label: he.nav.tryon, icon: <IconMirror /> },
  { to: '/wardrobe', label: he.nav.wardrobe, icon: <IconHanger /> },
  { to: '/studio', label: he.nav.studio, icon: <IconScissors /> },
  { to: '/looks', label: he.nav.looks, icon: <IconHeart /> },
];

export function BottomNav() {
  return (
    <nav className="safe-b border-t border-line bg-paper">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  isActive ? 'text-rose-deep font-medium' : 'text-muted'
                }`
              }
            >
              {t.icon}
              <span>{t.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
