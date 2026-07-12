# Clinical Calm Foundation + Dashboard Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Clinical Calm" design-token layer and a small shared `ui/` component set on Tailwind v4, then redesign HomePage into a dashboard hub that surfaces every feature (overall progress, stats, daily review, AI drill, units) using those components.

**Architecture:** Tokens live as CSS custom properties in a Tailwind v4 `@theme` block (auto-generates utility classes like `bg-primary`, `rounded-lg`). A new `src/components/ui/` holds small, single-purpose, presentational components (Button, Card, StatTile, ProgressBar, SegmentedBar, PageHeader, SectionTitle). `StatsStrip` is refactored to compose `StatTile`. A new pure module `src/pages/homeMetrics.ts` computes the dashboard's overall-progress numbers so `HomePage.tsx` stays focused on layout. No data/backend changes anywhere in this plan.

**Tech Stack:** React 19, Tailwind v4 (`@theme`, CSS-based config, no `tailwind.config.js`), `lucide-react` (new dependency, added in Task 1), Vitest + Testing Library, TypeScript, react-i18next.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-ui-redesign-design.md`. This plan implements that spec's **"Design direction / tokens"**, **"Shared component set"**, and **"Dashboard hub"** sections only. The spec's "Other pages" section (Auth/Onboarding/Unit/Review/Drill restyle) is intentionally deferred to a follow-up plan once these components exist and are proven — restyling six more pages in one plan would be unreviewable as a single unit; this plan already produces a complete, demoable, fully-tested deliverable (the dashboard) on its own.
- Colors: `--color-primary #0f766e`, `--color-primary-strong #155e63`, `--color-primary-tint #ecfdf5`, `--color-primary-soft #99d2cc`, `--color-ink #0f172a`, `--color-ink-muted #475569`, `--color-ink-subtle #64748b`, `--color-bg #f1f5f6`, `--color-surface #ffffff`, `--color-border #e2e8f0`, `--color-track #eef2f4`, `--color-amber #f59e0b`, `--color-info #0369a1`, `--color-info-bg #f0f9ff`.
- Radius: `--radius-sm 8px`, `--radius-md 12px`, `--radius-lg 16px`, `--radius-xl 20px` (overrides Tailwind's built-in scale for `rounded-sm/md/lg/xl` app-wide — deliberate, part of the redesign).
- Shadow: `--shadow-card 0 1px 2px rgba(15,23,42,.04)`, `--shadow-raised 0 6px 16px rgba(15,118,110,.25)`.
- Icons: `lucide-react`. RTL: use Tailwind **logical** properties only (`inset-inline-start`/`start-*`, `ms-*`/`me-*`, `ps-*`/`pe-*`) — never physical `left/right` (this codebase already lints for this via `stylelint-use-logical`; keep it true in new files too).
- Mastery definition (reused, do not redefine): a card counts as **mastered** when `state === 'review' && stability >= 7` (existing `KNOWN_STABILITY_DAYS` constant).
- Overall-progress metric (new, spec-defined): `entryIds` = distinct entry ids across **published** units only; `total = |entryIds|`; `covered` = entries with `reps > 0`; `mastered` = entries meeting the mastery definition above. This is a **different, unit-scoped** number from the existing stat-tile "mastered"/"learned" counts (which stay dictionary-wide and unchanged) — both are intentionally shown.
- Existing `data-testid`s that other tests depend on must be preserved exactly: `stats-strip`, `stat-due`, `home-review-card`, `home-unit-card`, `unit-progress-bar`, `unit-progress-fill`, `unit-progress-text`.
- Test runner: `npx vitest run <file>` from repo root `/Users/ori/Desktop/Medlingo`. Full suite currently at 83 passing tests, 21 files — must stay ≥ that (growing as tasks add tests) with zero regressions. `npx tsc -b` must stay clean after every task.
- Follow existing style: named exports, `data-testid` attributes on anything a test touches, camelCase.

---

### Task 1: Design tokens + `lucide-react`

**Files:**
- Modify: `src/index.css`
- Modify: `package.json` (via `npm install`)

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utility classes `bg-primary`, `bg-primary-strong`, `bg-primary-tint`, `bg-primary-soft`, `text-ink`, `text-ink-muted`, `text-ink-subtle`, `bg-bg`, `bg-surface`, `border-border`, `bg-track`, `bg-amber`, `text-info`, `bg-info-bg` (and their `text-*`/`border-*` counterparts), `rounded-sm/md/lg/xl` (redefined), `shadow-card`, `shadow-raised`. The `lucide-react` package, importable as `import { IconName } from 'lucide-react'`. Every later task in this plan depends on these class names existing exactly as spelled.

This task has no application behavior to unit-test (it's CSS config + a dependency add) — verification is a build + typecheck + full-suite-stays-green pass instead of a red/green cycle.

- [ ] **Step 1: Install lucide-react**

Run: `npm install lucide-react`
Expected: `package.json` gains `"lucide-react"` under `dependencies`; `package-lock.json` updates; exit code 0.

- [ ] **Step 2: Add the design tokens**

Replace the entire contents of `src/index.css` with:

```css
@import "tailwindcss";

@theme {
  /* Primary (teal) */
  --color-primary: #0f766e;
  --color-primary-strong: #155e63;
  --color-primary-tint: #ecfdf5;
  --color-primary-soft: #99d2cc;

  /* Ink (slate) */
  --color-ink: #0f172a;
  --color-ink-muted: #475569;
  --color-ink-subtle: #64748b;

  /* Surface */
  --color-bg: #f1f5f6;
  --color-surface: #ffffff;
  --color-border: #e2e8f0;
  --color-track: #eef2f4;

  /* Accent */
  --color-amber: #f59e0b;
  --color-info: #0369a1;
  --color-info-bg: #f0f9ff;

  /* Radius (overrides Tailwind's built-in sm/md/lg/xl scale app-wide) */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;

  /* Shadow */
  --shadow-card: 0 1px 2px rgba(15, 23, 42, .04);
  --shadow-raised: 0 6px 16px rgba(15, 118, 110, .25);
}
```

- [ ] **Step 3: Verify the build and typecheck are clean**

Run: `npx tsc -b`
Expected: exit 0, no output.

Run: `npm run build`
Expected: `vite build` completes successfully (exit 0). This is the real verification for this task — Tailwind v4 fails the build on malformed `@theme` CSS, and a broken `lucide-react` import anywhere would fail here too (though nothing imports it yet).

- [ ] **Step 4: Verify the existing suite is unaffected**

Run: `npx vitest run`
Expected: same pass count as before this task (83 passed, 21 files) — this task changes no application code paths, only adds unused-so-far tokens/dependency.

- [ ] **Step 5: Commit**

```bash
git add src/index.css package.json package-lock.json
git commit -m "feat: add Clinical Calm design tokens and lucide-react"
```

---

### Task 2: `Button` + `LinkButton`

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Button.test.tsx`

**Interfaces:**
- Consumes: `--color-primary`/`--color-primary-strong`/`--color-primary-tint`/`--color-surface` tokens (Task 1). `Link` from `react-router`.
- Produces: `Button({ variant?: 'primary'|'secondary'|'ghost', size?: 'md'|'sm', icon?: ReactNode, className?, children, ...nativeButtonProps })` — renders a native `<button>`. `LinkButton({ to, variant?, size?, icon?, className?, children, ...rest })` — renders a `react-router` `Link` styled identically. Both exported by name from `src/components/ui/Button.tsx`. Later tasks import `Button`/`LinkButton` from `'../components/ui/Button'` (relative to `src/pages/`) or `'./Button'` (relative to `src/components/ui/`).

Note on the spec: the spec describes a single polymorphic `Button` with an `as` prop; this plan splits it into `Button` (native button) and `LinkButton` (router link) sharing the same class-name logic. Same visual/behavioral outcome, simpler and more type-safe than a discriminated-union polymorphic component — a deliberate, documented deviation.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/Button.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Button, LinkButton } from './Button';

describe('Button', () => {
  it('renders children and calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByText('Save'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies the primary variant class by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByText('Save')).toHaveClass('bg-primary');
  });

  it('applies the secondary variant class', () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByText('Cancel')).toHaveClass('border-primary');
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Save</Button>);
    await userEvent.click(screen.getByText('Save'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('LinkButton', () => {
  it('renders as a router link with the primary styling', () => {
    render(<MemoryRouter><LinkButton to="/review">Start</LinkButton></MemoryRouter>);
    const link = screen.getByText('Start');
    expect(link).toHaveAttribute('href', '/review');
    expect(link).toHaveClass('bg-primary');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/Button.test.tsx`
Expected: FAIL — module `./Button` not found.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-strong',
  secondary: 'border border-primary text-primary bg-surface hover:bg-primary-tint',
  ghost: 'text-primary hover:bg-primary-tint',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none';

function buttonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ''}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button className={buttonClassName(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

interface LinkButtonProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}

export function LinkButton({ to, variant = 'primary', size = 'md', icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link to={to} className={buttonClassName(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/Button.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/Button.test.tsx
git commit -m "feat: add Button and LinkButton design-system components"
```

---

### Task 3: `Card`

**Files:**
- Create: `src/components/ui/Card.tsx`
- Create: `src/components/ui/Card.test.tsx`

**Interfaces:**
- Consumes: `--color-surface`/`--color-border`/`--radius-lg`/`--shadow-card`/`--shadow-raised` tokens (Task 1).
- Produces: `Card({ interactive?: boolean, muted?: boolean, className?, children, ...divProps })` — named export from `src/components/ui/Card.tsx`. Renders a `<div>`; forwards `data-testid` and any other native div attribute via `...rest`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/Card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children inside a surface container', () => {
    render(<Card data-testid="c">Hello</Card>);
    expect(screen.getByTestId('c')).toHaveTextContent('Hello');
    expect(screen.getByTestId('c')).toHaveClass('bg-surface');
  });

  it('dims when muted', () => {
    render(<Card data-testid="c" muted>Locked</Card>);
    expect(screen.getByTestId('c')).toHaveClass('opacity-70');
  });

  it('adds a hover affordance when interactive', () => {
    render(<Card data-testid="c" interactive>Click me</Card>);
    expect(screen.getByTestId('c')).toHaveClass('hover:shadow-raised');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/Card.test.tsx`
Expected: FAIL — module `./Card` not found.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/Card.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  muted?: boolean;
  children: ReactNode;
}

export function Card({ interactive = false, muted = false, className, children, ...rest }: CardProps) {
  const classes = [
    'rounded-lg border border-border bg-surface p-4 shadow-card',
    interactive ? 'transition-shadow hover:shadow-raised' : '',
    muted ? 'opacity-70' : '',
    className ?? '',
  ].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/Card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Card.tsx src/components/ui/Card.test.tsx
git commit -m "feat: add Card design-system component"
```

---

### Task 4: `StatTile`

**Files:**
- Create: `src/components/ui/StatTile.tsx`
- Create: `src/components/ui/StatTile.test.tsx`

**Interfaces:**
- Consumes: `--color-primary`/`--color-ink`/`--color-ink-subtle`/`--radius-md` tokens (Task 1). `Link` from `react-router`. `lucide-react` (test only, to pass a real icon).
- Produces: `StatTile({ icon: ReactNode, value: number|string, label: string, emphasis?: boolean, to?: string, 'data-testid'?: string })` — named export. Renders a `Link` (with `href`) when `to` is given, otherwise a plain `<div>` (no `href` attribute at all — Task 7's StatsStrip refactor depends on this exact behavior to preserve its existing "not a link when dueCount is 0" test).

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/StatTile.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Flame } from 'lucide-react';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('renders icon, value, and label', () => {
    render(<StatTile icon={<Flame data-testid="icon" />} value={5} label="Day streak" data-testid="tile" />);
    expect(screen.getByTestId('tile')).toHaveTextContent('5');
    expect(screen.getByTestId('tile')).toHaveTextContent('Day streak');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders as a link when `to` is given', () => {
    render(
      <MemoryRouter>
        <StatTile icon={<Flame />} value={12} label="Due today" to="/review" data-testid="tile" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tile')).toHaveAttribute('href', '/review');
  });

  it('renders as a div, not a link, without `to`', () => {
    render(<StatTile icon={<Flame />} value={5} label="Streak" data-testid="tile" />);
    expect(screen.getByTestId('tile')).not.toHaveAttribute('href');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/StatTile.test.tsx`
Expected: FAIL — module `./StatTile` not found.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/StatTile.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface StatTileProps {
  icon: ReactNode;
  value: number | string;
  label: string;
  emphasis?: boolean;
  to?: string;
  'data-testid'?: string;
}

const BASE_CLASSES = 'flex flex-col items-center gap-1 rounded-md border border-border bg-surface p-3 text-center';

export function StatTile({ icon, value, label, emphasis = false, to, ...rest }: StatTileProps) {
  const classes = `${BASE_CLASSES} ${emphasis ? 'border-primary' : ''}`.trim();
  const content = (
    <>
      <span className={emphasis ? 'text-primary' : 'text-ink-subtle'}>{icon}</span>
      <span className={`text-lg font-bold ${emphasis ? 'text-primary' : 'text-ink'}`}>{value}</span>
      <span className="text-xs text-ink-subtle">{label}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <div className={classes} {...rest}>
      {content}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/StatTile.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/StatTile.tsx src/components/ui/StatTile.test.tsx
git commit -m "feat: add StatTile design-system component"
```

---

### Task 5: `ProgressBar` + `SegmentedBar`

**Files:**
- Create: `src/components/ui/ProgressBar.tsx`
- Create: `src/components/ui/ProgressBar.test.tsx`
- Create: `src/components/ui/SegmentedBar.tsx`
- Create: `src/components/ui/SegmentedBar.test.tsx`

**Interfaces:**
- Consumes: `--color-primary`/`--color-primary-soft`/`--color-track`/`--radius-sm` tokens (Task 1).
- Produces: `ProgressBar({ value: number, tone?: 'primary'|'success', barTestId?: string, fillTestId?: string })` — single fill, clamped to [0,100]. `SegmentedBar({ coveredPct: number, masteredPct: number })` — two nested fills in one track (`mastered` drawn over `covered`), fixed testids `overall-progress-bar` (track), `overall-progress-covered`, `overall-progress-mastered`. Both named exports. Task 9 (HomePage) uses `ProgressBar` with `barTestId="unit-progress-bar"`/`fillTestId="unit-progress-fill"` for per-unit bars (preserving the existing testids) and `SegmentedBar` for the new overall-progress card.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/ProgressBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('sets the fill width from value', () => {
    render(<ProgressBar value={57} barTestId="bar" fillTestId="fill" />);
    expect(screen.getByTestId('bar')).toBeInTheDocument();
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '57%' });
  });

  it('clamps values above 100', () => {
    render(<ProgressBar value={140} fillTestId="fill" />);
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '100%' });
  });

  it('clamps negative values to 0', () => {
    render(<ProgressBar value={-10} fillTestId="fill" />);
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '0%' });
  });

  it('uses the success tone color at 100%', () => {
    render(<ProgressBar value={100} tone="success" fillTestId="fill" />);
    expect(screen.getByTestId('fill')).toHaveClass('bg-green-600');
  });
});
```

Create `src/components/ui/SegmentedBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentedBar } from './SegmentedBar';

describe('SegmentedBar', () => {
  it('renders both segments at their given widths', () => {
    render(<SegmentedBar coveredPct={62} masteredPct={21} />);
    expect(screen.getByTestId('overall-progress-covered')).toHaveStyle({ width: '62%' });
    expect(screen.getByTestId('overall-progress-mastered')).toHaveStyle({ width: '21%' });
  });

  it('clamps mastered to never exceed covered', () => {
    render(<SegmentedBar coveredPct={30} masteredPct={80} />);
    expect(screen.getByTestId('overall-progress-mastered')).toHaveStyle({ width: '30%' });
  });

  it('clamps covered to 100 max', () => {
    render(<SegmentedBar coveredPct={150} masteredPct={10} />);
    expect(screen.getByTestId('overall-progress-covered')).toHaveStyle({ width: '100%' });
  });

  it('renders 0/0 for a brand new user', () => {
    render(<SegmentedBar coveredPct={0} masteredPct={0} />);
    expect(screen.getByTestId('overall-progress-covered')).toHaveStyle({ width: '0%' });
    expect(screen.getByTestId('overall-progress-mastered')).toHaveStyle({ width: '0%' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/ProgressBar.test.tsx src/components/ui/SegmentedBar.test.tsx`
Expected: FAIL — modules `./ProgressBar` and `./SegmentedBar` not found.

- [ ] **Step 3: Write the implementations**

Create `src/components/ui/ProgressBar.tsx`:

```tsx
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
  const fillClass = tone === 'success' ? 'bg-green-600' : 'bg-primary';
  return (
    <div data-testid={barTestId} className="h-1.5 overflow-hidden rounded-sm bg-track">
      <div data-testid={fillTestId} className={`h-full ${fillClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
```

Create `src/components/ui/SegmentedBar.tsx`:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/ProgressBar.test.tsx src/components/ui/SegmentedBar.test.tsx`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ProgressBar.tsx src/components/ui/ProgressBar.test.tsx src/components/ui/SegmentedBar.tsx src/components/ui/SegmentedBar.test.tsx
git commit -m "feat: add ProgressBar and SegmentedBar design-system components"
```

---

### Task 6: `PageHeader` + `SectionTitle`

**Files:**
- Create: `src/components/ui/PageHeader.tsx`
- Create: `src/components/ui/PageHeader.test.tsx`
- Create: `src/components/ui/SectionTitle.tsx`
- Create: `src/components/ui/SectionTitle.test.tsx`

**Interfaces:**
- Consumes: `LanguagePicker` from `../LanguagePicker` (existing, unchanged). `--color-primary` token.
- Produces: `PageHeader({ title: string, displayName?: string })` — logo initial + title + `LanguagePicker` + an avatar (first letter of `displayName`, uppercased) shown only when `displayName` is provided, `data-testid="page-header-avatar"`. `SectionTitle({ children: ReactNode, action?: ReactNode })` — an `<h2>` heading plus an optional trailing element. Both named exports. Task 9 uses `<PageHeader title={t('app.title')} displayName={state.profile?.displayName} />` and `<SectionTitle>{t('home.myUnits')}</SectionTitle>`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/PageHeader.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '../../lib/i18n';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title and the language picker', () => {
    render(<MemoryRouter><PageHeader title="MedLingo" /></MemoryRouter>);
    expect(screen.getByText('MedLingo')).toBeInTheDocument();
    expect(screen.getByTestId('language-picker')).toBeInTheDocument();
  });

  it('renders an avatar with initials when a display name is given', () => {
    render(<MemoryRouter><PageHeader title="MedLingo" displayName="Dr. Cohen" /></MemoryRouter>);
    expect(screen.getByTestId('page-header-avatar')).toHaveTextContent('D');
  });

  it('omits the avatar without a display name', () => {
    render(<MemoryRouter><PageHeader title="MedLingo" /></MemoryRouter>);
    expect(screen.queryByTestId('page-header-avatar')).not.toBeInTheDocument();
  });
});
```

Create `src/components/ui/SectionTitle.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionTitle } from './SectionTitle';

describe('SectionTitle', () => {
  it('renders the heading text', () => {
    render(<SectionTitle>My units</SectionTitle>);
    expect(screen.getByRole('heading', { name: 'My units' })).toBeInTheDocument();
  });

  it('renders an optional trailing action', () => {
    render(<SectionTitle action={<span data-testid="action">See all</span>}>My units</SectionTitle>);
    expect(screen.getByTestId('action')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx src/components/ui/SectionTitle.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

Create `src/components/ui/PageHeader.tsx`:

```tsx
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
```

Create `src/components/ui/SectionTitle.tsx`:

```tsx
import type { ReactNode } from 'react';

interface SectionTitleProps {
  children: ReactNode;
  action?: ReactNode;
}

export function SectionTitle({ children, action }: SectionTitleProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-extrabold text-ink">{children}</h2>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx src/components/ui/SectionTitle.test.tsx`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PageHeader.tsx src/components/ui/PageHeader.test.tsx src/components/ui/SectionTitle.tsx src/components/ui/SectionTitle.test.tsx
git commit -m "feat: add PageHeader and SectionTitle design-system components"
```

---

### Task 7: Refactor `StatsStrip` to compose `StatTile`

**Files:**
- Modify: `src/components/StatsStrip.tsx`
- Test (no changes expected): `src/components/StatsStrip.test.tsx` — this is the safety net; it must pass **unmodified** before and after.

**Interfaces:**
- Consumes: `StatTile` (Task 4).
- Produces: same public interface as before — `StatsStrip({ streak, dueCount, mastered, learned })`, testids `stats-strip` and `stat-due` unchanged. No consumer of `StatsStrip` (`HomePage.tsx`) needs to change for this task.

This is a pure refactor: same external behavior, new internals (adds icons, delegates rendering to `StatTile`). There is no new failing-test step — instead, prove the baseline is green, refactor, prove it's still green.

- [ ] **Step 1: Confirm the existing test is green before touching anything**

Run: `npx vitest run src/components/StatsStrip.test.tsx`
Expected: PASS (3 tests) — this is the pre-refactor baseline.

- [ ] **Step 2: Refactor the implementation**

Replace the entire contents of `src/components/StatsStrip.tsx` with:

```tsx
import { useTranslation } from 'react-i18next';
import { Flame, Clock, Award, BookOpen } from 'lucide-react';
import { StatTile } from './ui/StatTile';

interface StatsStripProps {
  streak: number;
  dueCount: number;
  mastered: number;
  learned: number;
}

export function StatsStrip({ streak, dueCount, mastered, learned }: StatsStripProps) {
  const { t } = useTranslation();
  return (
    <div data-testid="stats-strip" className="grid grid-cols-4 gap-2">
      <StatTile icon={<Flame className="size-4" />} value={streak} label={t('home.stats.streak')} />
      <StatTile
        icon={<Clock className="size-4" />}
        value={dueCount}
        label={t('home.stats.dueToday')}
        emphasis={dueCount > 0}
        to={dueCount > 0 ? '/review' : undefined}
        data-testid="stat-due"
      />
      <StatTile icon={<Award className="size-4" />} value={mastered} label={t('home.stats.mastered')} />
      <StatTile icon={<BookOpen className="size-4" />} value={learned} label={t('home.stats.learned')} />
    </div>
  );
}
```

- [ ] **Step 3: Run the test again to confirm no regression**

Run: `npx vitest run src/components/StatsStrip.test.tsx`
Expected: PASS (3 tests, unmodified file) — proves the refactor preserved behavior exactly.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: all tests still pass (`HomePage.test.tsx` also renders `StatsStrip` — must remain green too).

- [ ] **Step 5: Commit**

```bash
git add src/components/StatsStrip.tsx
git commit -m "refactor: compose StatsStrip from StatTile"
```

---

### Task 8: `homeMetrics.ts` — overall progress calculation

**Files:**
- Create: `src/pages/homeMetrics.ts`
- Create: `src/pages/homeMetrics.test.ts`

**Interfaces:**
- Consumes: `CardState`, `Unit` from `../lib/types` (existing, unchanged).
- Produces: `KNOWN_STABILITY_DAYS = 7` (exported constant — Task 9 imports this instead of redeclaring it locally, removing the duplicate that currently lives in `HomePage.tsx`). `computeOverallProgress(units: Unit[], cards: CardState[], entryIds: Record<string, string[]>): { total: number; covered: number; mastered: number; coveredPct: number; masteredPct: number }`. Task 9 calls this with the same `state.units`/`state.cards`/`state.entryIds` it already loads — no new data fetching.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/homeMetrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeOverallProgress } from './homeMetrics';
import type { CardState, Unit } from '../lib/types';

function unit(slug: string, status: 'draft' | 'published'): Unit {
  return { slug, level: 1, displayOrder: 1, status, title: { en: slug }, dialogue: [] };
}

function card(entryId: string, state: CardState['state'], stability: number, reps: number): CardState {
  return {
    entryId, due: new Date(), stability, difficulty: 5, reps, lapses: 0,
    learningSteps: 0, state, lastReview: null,
  };
}

describe('computeOverallProgress', () => {
  it('counts covered and mastered only within published units', () => {
    const units = [unit('u1', 'published'), unit('u2', 'draft')];
    const entryIds = { u1: ['a', 'b'], u2: ['c'] };
    const cards = [card('a', 'review', 8, 5), card('b', 'learning', 1, 1), card('c', 'review', 8, 5)];
    const result = computeOverallProgress(units, cards, entryIds);
    expect(result.total).toBe(2); // c excluded — belongs only to the draft unit
    expect(result.covered).toBe(2); // a and b both started
    expect(result.mastered).toBe(1); // only a meets stability >= 7
    expect(result.coveredPct).toBe(100);
    expect(result.masteredPct).toBe(50);
  });

  it('returns all zeros for a brand new user with no cards', () => {
    const units = [unit('u1', 'published')];
    const entryIds = { u1: ['a', 'b'] };
    const result = computeOverallProgress(units, [], entryIds);
    expect(result).toEqual({ total: 2, covered: 0, mastered: 0, coveredPct: 0, masteredPct: 0 });
  });

  it('returns all zeros when there are no published units', () => {
    const units = [unit('u1', 'draft')];
    const entryIds = { u1: ['a'] };
    const result = computeOverallProgress(units, [card('a', 'review', 8, 5)], entryIds);
    expect(result).toEqual({ total: 0, covered: 0, mastered: 0, coveredPct: 0, masteredPct: 0 });
  });

  it('deduplicates an entry id shared across two published units', () => {
    const units = [unit('u1', 'published'), unit('u2', 'published')];
    const entryIds = { u1: ['a'], u2: ['a'] };
    const result = computeOverallProgress(units, [card('a', 'review', 8, 5)], entryIds);
    expect(result.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/homeMetrics.test.ts`
Expected: FAIL — module `./homeMetrics` not found.

- [ ] **Step 3: Write the implementation**

Create `src/pages/homeMetrics.ts`:

```ts
import type { CardState, Unit } from '../lib/types';

export const KNOWN_STABILITY_DAYS = 7;

export interface OverallProgress {
  total: number;
  covered: number;
  mastered: number;
  coveredPct: number;
  masteredPct: number;
}

export function computeOverallProgress(
  units: Unit[],
  cards: CardState[],
  entryIds: Record<string, string[]>,
): OverallProgress {
  const publishedIds = new Set<string>();
  for (const unit of units) {
    if (unit.status !== 'published') continue;
    for (const id of entryIds[unit.slug] ?? []) publishedIds.add(id);
  }

  const cardById = new Map(cards.map((c) => [c.entryId, c]));
  let covered = 0;
  let mastered = 0;
  for (const id of publishedIds) {
    const card = cardById.get(id);
    if (!card || card.reps === 0) continue;
    covered += 1;
    if (card.state === 'review' && card.stability >= KNOWN_STABILITY_DAYS) mastered += 1;
  }

  const total = publishedIds.size;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((100 * n) / total));
  return { total, covered, mastered, coveredPct: pct(covered), masteredPct: pct(mastered) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/homeMetrics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/homeMetrics.ts src/pages/homeMetrics.test.ts
git commit -m "feat: add overall-progress calculation for the dashboard"
```

---

### Task 9: HomePage dashboard hub assembly

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/HomePage.test.tsx`
- Modify: `src/locales/en.json`

**Interfaces:**
- Consumes: `PageHeader`, `SectionTitle`, `Card`, `Button`, `LinkButton`, `ProgressBar`, `SegmentedBar` (Tasks 2–6), `computeOverallProgress`/`KNOWN_STABILITY_DAYS` (Task 8), refactored `StatsStrip` (Task 7, unchanged call signature), lucide icons `Clock`, `Stethoscope`, `CheckCircle2`, `Circle`, `CircleDashed`.
- Produces: the final dashboard hub. New testids: `overall-progress-card` (wraps `SegmentedBar`), `home-drill-card`. Preserved testids (must not change): `home-review-card`, `home-unit-card`, `unit-progress-bar`, `unit-progress-fill`, `unit-progress-text`, `stats-strip`, `stat-due`.

- [ ] **Step 1: Add the new i18n keys**

In `src/locales/en.json`, inside the existing `"home"` object (alongside `"stats"`), add:

```json
"greeting": "Hello, {{name}}",
"dueSummary_one": "You have {{count}} word to review today",
"dueSummary_other": "You have {{count}} words to review today",
"overallProgress": "Overall progress",
"wordsInCourse_one": "{{count}} word in course",
"wordsInCourse_other": "{{count}} words in course",
"masteredCount": "{{count}} mastered ({{pct}}%)",
"coveredCount": "{{count}} learned ({{pct}}%)",
"new": "New",
"drillSubtitle": "Interview a simulated patient in Hebrew, with coaching feedback",
"myUnits": "My units"
```

- [ ] **Step 2: Update the test mocks and write the failing tests**

In `src/pages/HomePage.test.tsx`, append these tests inside the existing `describe('dashboard', ...)` block (after the last `it`, before its closing `});`):

```tsx
  it('renders the greeting and the overall progress card', async () => {
    db.units = [{ slug: 'unit-01-intake', level: 1, displayOrder: 1, status: 'published', title: { en: 'Patient intake' }, dialogue: [] }];
    db.entryIds = { 'unit-01-intake': ['a', 'b'] };
    db.cards = [card('a', 'review', 10, 3), card('b', 'learning', 1, 1)];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByText('Hello, Dr. Test')).toBeInTheDocument();
    expect(screen.getByTestId('overall-progress-card')).toHaveTextContent('Overall progress');
    expect(screen.getByTestId('overall-progress-covered')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('overall-progress-mastered')).toHaveStyle({ width: '50%' });
  });

  it('shows the AI drill card with a "New" badge only when the flag is on', async () => {
    vi.stubEnv('VITE_ENABLE_DRILL', 'true');
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('home-drill-card')).toHaveTextContent('AI practice drill');
    expect(screen.getByTestId('home-drill-card')).toHaveTextContent('New');
    vi.unstubAllEnvs();
  });

  it('renders the "My units" section title', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'My units' })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run src/pages/HomePage.test.tsx`
Expected: the 3 new tests FAIL (greeting text, `overall-progress-card`, `home-drill-card`, "My units" heading don't exist yet); all pre-existing tests in the file still PASS (nothing about them changes yet).

- [ ] **Step 4: Rewrite HomePage.tsx**

Replace the entire contents of `src/pages/HomePage.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Clock, Stethoscope, CheckCircle2, Circle, CircleDashed } from 'lucide-react';
import { loadUnits, loadUnitProgress, loadUnitEntryIds } from '../data/units';
import { loadDueCards, loadUpcomingCards, loadAllCards } from '../data/cards';
import { getProfile, touchStreak } from '../data/profile';
import { StatsStrip } from '../components/StatsStrip';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionTitle } from '../components/ui/SectionTitle';
import { Card } from '../components/ui/Card';
import { LinkButton } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SegmentedBar } from '../components/ui/SegmentedBar';
import { computeOverallProgress, KNOWN_STABILITY_DAYS } from './homeMetrics';
import i18n, { applyLanguage } from '../lib/i18n';
import type { CardState, Profile, Unit } from '../lib/types';
import { drillEnabled } from '../lib/flags';

type UnitProgress = 'not_started' | 'in_progress' | 'completed';

interface HomeState {
  units: Unit[];
  progress: Record<string, UnitProgress>;
  dueCount: number;
  nextDue: Date | null;
  cards: CardState[];
  profile: Profile | null;
  entryIds: Record<string, string[]>;
}

const UNIT_ICON: Record<UnitProgress, typeof CheckCircle2> = {
  completed: CheckCircle2,
  in_progress: CircleDashed,
  not_started: Circle,
};

export function HomePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<HomeState | null>(null);
  const touched = useRef(false); // StrictMode double-invokes mount effects — streak must touch once

  useEffect(() => {
    (async () => {
      const [units, profile, due, cards, entryIds] = await Promise.all([
        loadUnits(), getProfile(), loadDueCards(), loadAllCards(), loadUnitEntryIds(),
      ]);
      if (profile?.uiLanguage && profile.uiLanguage !== i18n.language) {
        await applyLanguage(profile.uiLanguage);
      }
      const progressEntries = await Promise.all(
        units.map(async (u) => [u.slug, await loadUnitProgress(u.slug)] as const),
      );
      const progress = Object.fromEntries(progressEntries);
      let nextDue: Date | null = null;
      if (due.length === 0 && cards.length > 0) {
        if (!touched.current) {
          touched.current = true;
          await touchStreak(); // caught-up visit maintains the streak
        }
        const upcoming = await loadUpcomingCards(1);
        nextDue = upcoming[0]?.card.due ?? null;
      }
      setState({ units, progress, dueCount: due.length, nextDue, cards, profile, entryIds });
    })();
  }, []);

  if (!state) return <p className="p-4">{t('common.loading')}</p>;

  const learned = state.cards.filter((c) => c.reps > 0).length;
  const known = state.cards.filter(
    (c) => c.state === 'review' && c.stability >= KNOWN_STABILITY_DAYS,
  ).length;
  const startedIds = new Set(state.cards.filter((c) => c.reps > 0).map((c) => c.entryId));
  const firstRun = state.cards.length === 0;
  const overall = computeOverallProgress(state.units, state.cards, state.entryIds);
  const ctaFor = (p: UnitProgress) =>
    p === 'completed' ? t('home.completed')
    : p === 'in_progress' ? t('home.continue')
    : t('home.start');

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 bg-bg p-4">
      <PageHeader title={t('app.title')} displayName={state.profile?.displayName} />

      <div>
        <p className="text-xl font-extrabold text-ink">
          {t('home.greeting', { name: state.profile?.displayName ?? '' })}
        </p>
        {state.dueCount > 0 && (
          <p className="text-sm text-ink-subtle">{t('home.dueSummary', { count: state.dueCount })}</p>
        )}
      </div>

      <Card data-testid="overall-progress-card">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-extrabold text-ink">{t('home.overallProgress')}</span>
          <span className="text-xs text-ink-subtle">{t('home.wordsInCourse', { count: overall.total })}</span>
        </div>
        <SegmentedBar coveredPct={overall.coveredPct} masteredPct={overall.masteredPct} />
        <div className="mt-2 flex gap-4">
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="size-2.5 rounded-xs bg-primary" />
            {t('home.masteredCount', { count: overall.mastered, pct: overall.masteredPct })}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="size-2.5 rounded-xs bg-primary-soft" />
            {t('home.coveredCount', { count: overall.covered, pct: overall.coveredPct })}
          </span>
        </div>
      </Card>

      <StatsStrip
        streak={state.profile?.streakCurrent ?? 0}
        dueCount={state.dueCount}
        mastered={known}
        learned={learned}
      />

      <Card data-testid="home-review-card">
        <SectionTitle>{t('home.reviewTitle')}</SectionTitle>
        {firstRun ? (
          <p className="mt-1 text-ink-subtle">{t('home.firstRun')}</p>
        ) : state.dueCount > 0 ? (
          <LinkButton to="/review" className="mt-3 w-full" icon={<Clock className="size-4" />}>
            {t('home.due', { count: state.dueCount })}
          </LinkButton>
        ) : (
          <>
            <p className="mt-1 text-ink-muted">
              {t('home.caughtUp', { time: state.nextDue ? state.nextDue.toLocaleString() : '—' })}
            </p>
            <LinkButton to="/review?extra=1" variant="secondary" className="mt-3 w-full">
              {t('home.extraPractice')}
            </LinkButton>
          </>
        )}
      </Card>

      {drillEnabled() && (
        <Link to="/drill" className="block">
          <Card interactive data-testid="home-drill-card" className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-tint">
              <Stethoscope className="size-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink">{t('home.drill')}</p>
                <span className="rounded-xs bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {t('home.new')}
                </span>
              </div>
              <p className="text-xs text-ink-subtle">{t('home.drillSubtitle')}</p>
            </div>
          </Card>
        </Link>
      )}

      <SectionTitle>{t('home.myUnits')}</SectionTitle>
      <div className="flex flex-col gap-2">
        {state.units.length === 0 && (
          <Card data-testid="home-unit-card">
            <h3 className="font-semibold text-ink">{t('home.unitTitle')}</h3>
            <p className="mt-1 text-ink-subtle">{t('common.loading')}</p>
          </Card>
        )}
        {state.units.map((unit) => {
          const progress = state.progress[unit.slug] ?? 'not_started';
          const ids = state.entryIds[unit.slug] ?? [];
          const covered = ids.filter((id) => startedIds.has(id)).length;
          const percent = ids.length === 0 ? 0 : Math.round((covered / ids.length) * 100);
          const Icon = UNIT_ICON[progress];
          return (
            <Card key={unit.slug} muted={progress === 'not_started'} data-testid="home-unit-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${progress === 'completed' ? 'text-primary' : 'text-ink-subtle'}`} />
                  <h3 className="font-semibold text-ink">{unit.title.en}</h3>
                </div>
                {unit.status === 'draft' && (
                  <span className="rounded-xs bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    {t('home.draft')}
                  </span>
                )}
              </div>
              {ids.length > 0 && (
                <div className="mt-2">
                  <ProgressBar
                    value={percent}
                    tone={percent === 100 ? 'success' : 'primary'}
                    barTestId="unit-progress-bar"
                    fillTestId="unit-progress-fill"
                  />
                  <p data-testid="unit-progress-text" className="mt-1 text-xs text-ink-subtle">
                    {covered}/{ids.length} · {percent}%
                  </p>
                </div>
              )}
              {progress === 'completed' ? (
                <p className="mt-2 text-sm font-semibold text-primary">{ctaFor(progress)} ✓</p>
              ) : (
                <LinkButton to={`/unit/${unit.slug}`} size="sm" className="mt-2 w-full">
                  {ctaFor(progress)}
                </LinkButton>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/pages/HomePage.test.tsx`
Expected: PASS, all tests in the file (pre-existing + 3 new).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run`
Expected: PASS, no regressions anywhere (StatsStrip, Card, Button, StatTile, ProgressBar, SegmentedBar, PageHeader, SectionTitle, homeMetrics, HomePage, and every untouched file).

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 7: Verify in the browser**

Start the dev server, sign in, and confirm on `/`: `PageHeader` renders with avatar initial, greeting shows the display name, the overall-progress card renders a segmented bar with a sensible split, stat tiles show icons, the review CTA and (if `VITE_ENABLE_DRILL=true` locally) the drill card render correctly, unit cards show icon+progress bar+button, and the whole page reads correctly at a mobile width (375px) in both LTR (English) and RTL (Hebrew/Arabic — check the language picker). No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/HomePage.tsx src/pages/HomePage.test.tsx src/locales/en.json
git commit -m "feat: redesign HomePage as a Clinical Calm dashboard hub"
```
