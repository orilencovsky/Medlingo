import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Home, Clock, Stethoscope, Library, ClipboardCheck } from 'lucide-react';
import { drillEnabled } from '../lib/flags';
import { getProfile } from '../data/profile';

const NAV_ITEM_CLASSES = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
    isActive ? 'bg-primary-tint text-primary' : 'text-ink-muted hover:bg-primary-tint'
  }`;

export function AppShell() {
  const { t } = useTranslation();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { getProfile().then((p) => setIsAdmin(!!p?.isAdmin)); }, []);
  return (
    <div className="min-h-dvh bg-bg lg:flex lg:items-start lg:gap-6 lg:p-6">
      <aside className="hidden lg:sticky lg:top-6 lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:gap-1">
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
        {isAdmin && (
          <NavLink to="/admin/dictionary" className={NAV_ITEM_CLASSES}>
            <ClipboardCheck className="size-4" />
            {t('nav.dictionaryAdmin')}
          </NavLink>
        )}
        {drillEnabled() && (
          <NavLink to="/drill" className={NAV_ITEM_CLASSES}>
            <Stethoscope className="size-4" />
            {t('nav.drill')}
          </NavLink>
        )}
      </aside>
      <div className="lg:min-w-0 lg:flex-1">
        <Outlet />
      </div>
    </div>
  );
}
