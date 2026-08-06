import type { Region } from '../lib/anatomyRegions';

interface BodyFigureProps {
  region: Region | 'all';
  onSelect?: (r: Region) => void;
}

// Schematic zones only — this is a filter-state indicator, not an anatomical
// drawing. Shapes just need to read as head, torso, belly, limbs at ~9rem.
const ZONES: Array<{ zone: Exclude<Region, 'skeleton'>; d: string }> = [
  { zone: 'head_neck', d: 'M50 5a13 13 0 1 1 0 26a13 13 0 0 1 0-26M45 30h10v11h-10z' },
  { zone: 'chest', d: 'M33 43q17 -6 34 0v33q-17 5 -34 0z' },
  { zone: 'abdomen', d: 'M35 80q15 -4 30 0v29q-15 5 -30 0z' },
  {
    zone: 'limbs',
    d: 'M31 44l-11 5v55l8 2 7-38zM69 44l11 5v55l-8 2-7-38z' +
      'M37 113h11v82l-9 3zM63 113h-11v82l9 3z',
  },
];

// The skeleton spans the whole body, so selecting it lights every zone; 'all'
// lights none. Purely decorative (aria-hidden) — the region chips remain the
// accessible control; clicking a zone is just a pointer shortcut to the same
// selection.
export function BodyFigure({ region, onSelect }: BodyFigureProps) {
  const active = (zone: Region) => region === zone || region === 'skeleton';
  return (
    <svg viewBox="0 0 100 200" aria-hidden="true" className="h-36 shrink-0">
      {ZONES.map(({ zone, d }) => (
        <path
          key={zone}
          d={d}
          data-testid={`body-zone-${zone}`}
          data-active={active(zone) || undefined}
          onClick={onSelect && (() => onSelect(zone))}
          className={`cursor-pointer stroke-border transition-colors ${
            active(zone) ? 'fill-primary/50' : 'fill-primary-tint'
          }`}
        />
      ))}
    </svg>
  );
}
