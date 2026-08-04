import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Home, Clock, Stethoscope, Library, ClipboardCheck, PersonStanding, Menu, X,
} from 'lucide-react';
import { drillEnabled } from '../lib/flags';
import { getProfile } from '../data/profile';

const NAV_ITEM_CLASSES = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
    isActive ? 'bg-primary-tint text-primary' : 'text-ink-muted hover:bg-primary-tint'
  }`;

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { getProfile().then((p) => setIsAdmin(!!p?.isAdmin)); }, []);
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  const navLinks = (
    <>
      <NavLink to="/" end className={NAV_ITEM_CLASSES}>
        <Home className="size-4" />
        {t('nav.home')}
      </NavLink>
      <NavLink to="/review" className={NAV_ITEM_CLASSES}>
        <Clock className="size-4" />
        {t('nav.review')}
      </NavLink>
      <NavLink to="/dictionary" className={NAV_ITEM_CLASSES}>
        <Library className="size-4" />
        {t('nav.dictionary')}
      </NavLink>
      <NavLink to="/anatomy" className={NAV_ITEM_CLASSES}>
        <PersonStanding className="size-4" />
        {t('nav.anatomy')}
      </NavLink>
      {isAdmin && (
        <NavLink to="/admin/dictionary" className={NAV_ITEM_CLASSES}>
          <ClipboardCheck className="size-4" />
          {t('nav.dictionaryAdmin')}
        </NavLink>
      )}
      {isAdmin && (
        <NavLink to="/admin/anatomy" className={NAV_ITEM_CLASSES}>
          <ClipboardCheck className="size-4" />
          {t('nav.anatomyAdmin')}
        </NavLink>
      )}
      {drillEnabled() && (
        <NavLink to="/drill" className={NAV_ITEM_CLASSES}>
          <Stethoscope className="size-4" />
          {t('nav.drill')}
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-dvh bg-bg lg:flex lg:items-start lg:gap-6 lg:p-6">
      <div ref={menuRef} className="relative flex justify-end border-b border-border bg-surface px-4 py-2 lg:hidden">
        <button
          type="button"
          data-testid="mobile-nav-toggle"
          aria-label={t('nav.menu')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-primary-tint"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        {menuOpen && (
          <nav
            data-testid="mobile-nav-menu"
            className="absolute end-4 top-12 z-10 flex w-56 flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-raised"
          >
            {navLinks}
          </nav>
        )}
      </div>
      <aside className="hidden lg:sticky lg:top-6 lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:gap-1">
        {navLinks}
      </aside>
      <div className="lg:min-w-0 lg:flex-1">
        <Outlet />
      </div>
    </div>
  );
}
