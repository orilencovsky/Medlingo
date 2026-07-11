import { LanguagePicker } from '../LanguagePicker';

interface PageHeaderProps {
  title: string;
  displayName?: string;
}

function initial(name?: string): string {
  return name ? name.trim().charAt(0).toUpperCase() : '';
}

export function PageHeader({ title, displayName }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
          {title.charAt(0)}
        </div>
        <span className="text-lg font-extrabold text-ink">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <LanguagePicker />
        {displayName && (
          <div
            data-testid="page-header-avatar"
            className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
          >
            {initial(displayName)}
          </div>
        )}
      </div>
    </div>
  );
}
