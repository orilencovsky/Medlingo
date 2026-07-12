function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n));
}

interface ProgressBarProps {
  value: number;
  tone?: 'primary' | 'success';
  barTestId?: string;
  fillTestId?: string;
}

export function ProgressBar({ value, tone = 'primary', barTestId, fillTestId }: ProgressBarProps) {
  const pct = clampPercent(value);
  const fillClass = tone === 'success' ? 'bg-success' : 'bg-primary';
  return (
    <div data-testid={barTestId} className="h-1.5 overflow-hidden rounded-sm bg-track">
      <div data-testid={fillTestId} className={`h-full ${fillClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
