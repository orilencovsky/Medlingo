import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from '../LanguagePicker';
import { supabase } from '../../lib/supabase';

interface PageHeaderProps {
  title: string;
  displayName?: string;
}

function initial(name?: string): string {
  return name ? name.trim().charAt(0).toUpperCase() : '';
}

export function PageHeader({ title, displayName }: PageHeaderProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
          {title.charAt(0)}
        </div>
        <h1 className="text-lg font-extrabold text-ink">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <LanguagePicker />
        {displayName && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              data-testid="page-header-avatar"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
            >
              {initial(displayName)}
            </button>
            {menuOpen && (
              <div className="absolute end-0 z-10 mt-2 w-40 rounded-md border border-border bg-surface py-1 shadow-raised">
                <button
                  type="button"
                  data-testid="page-header-signout"
                  onClick={() => supabase.auth.signOut()}
                  className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-primary-tint"
                >
                  {t('common.signOut')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
