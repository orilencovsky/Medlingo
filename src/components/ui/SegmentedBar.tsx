function clamp(n: number, max: number): number {
  return Math.min(max, Math.max(0, n));
}

interface SegmentedBarProps {
  coveredPct: number;
  masteredPct: number;
}

export function SegmentedBar({ coveredPct, masteredPct }: SegmentedBarProps) {
  const covered = clamp(coveredPct, 100);
  const mastered = clamp(masteredPct, covered);
  return (
    <div data-testid="overall-progress-bar" className="relative h-3 overflow-hidden rounded-sm bg-track">
      <div
        data-testid="overall-progress-covered"
        className="absolute inset-y-0 start-0 rounded-sm bg-primary-soft"
        style={{ width: `${covered}%` }}
      />
      <div
        data-testid="overall-progress-mastered"
        className="absolute inset-y-0 start-0 rounded-sm bg-primary"
        style={{ width: `${mastered}%` }}
      />
    </div>
  );
}
