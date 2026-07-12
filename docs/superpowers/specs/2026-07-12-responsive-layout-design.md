# Responsive layout (mobile + desktop)

## Problem

All pages (`HomePage`, `UnitPage`, `ReviewPage`, `DrillPage`, `AuthPage`, `OnboardingPage`) are built mobile-only: no Tailwind breakpoint (`sm:`/`md:`/`lg:`) exists anywhere in `src/pages`. On a desktop viewport the content sits in a narrow `max-w-md` (Home/Drill) or unconstrained (Unit/Review) column with no navigation chrome — usable but not designed for the width.

Also: `PageHeader` (logo, `LanguagePicker`, avatar) is only rendered on `HomePage` today. `UnitPage`/`ReviewPage`/`DrillPage` have no way to switch language or get back to Home except browser back / hardcoded links.

## Decisions (from visual brainstorm)

1. **Persistent sidebar shell** on protected pages at `lg:` (1024px) and up. Below `lg:`, layout is exactly what exists today (single-column stack, no shell, no regression).
2. **Sidebar = nav only** — three links: Home, Review, Drill (Drill link respects `drillEnabled()`, same as today's home card). No language picker or avatar in the sidebar.
3. **Top bar reuses `PageHeader`** — applied consistently to all four protected pages (Home already has it; Unit/Review/Drill gain it). Language picker + avatar stay there, unchanged component.
4. **Scope**: shell wraps the protected routes only (`/`, `/unit/:slug`, `/review`, `/drill`). `AuthPage`/`OnboardingPage` are unauthenticated, stay as their current centered `max-w-sm` forms — no shell, no change.
5. **Content width inside the shell**: cap around `max-w-2xl` (~640px) centered in the content area, so text/cards don't stretch edge-to-edge on wide screens. No multi-column page content (the two-column Home option was considered and rejected in favor of the simpler nav shell).
6. **RTL**: sidebar must mirror to the visual right when `dir=rtl` (`he`/`ar`). Use logical Tailwind utilities (`ps-*`/`pe-*`, `border-e`/`border-s`, `start-*`/`end-*`) instead of `left`/`right`/`ml`/`mr` in the new shell so it flips automatically with `document.documentElement.dir` — don't hardcode a side.

## Architecture

New component: `src/components/AppShell.tsx`

```
<AppShell>              <- lg:flex row; below lg: just renders children, no chrome
  <aside>                <- hidden below lg:, visible lg:flex column, fixed width (~200px)
    nav links (Home/Review/Drill), active link highlighted via useLocation()
  </aside>
  <div>                  <- flex-1
    {children}            <- each page keeps rendering its own <PageHeader> + content
  </div>
</AppShell>
```

Wired into `App.tsx` as a layout route wrapping the existing protected `<Route>` elements with `<Outlet/>`, so `ProtectedRoute` + `AppShell` compose once instead of importing `AppShell` into every page:

```tsx
<Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
  <Route path="/" element={<HomePage />} />
  <Route path="/unit/:slug" element={<UnitPage />} />
  <Route path="/review" element={<ReviewPage />} />
  <Route path="/drill" element={<DrillPage />} />
</Route>
```

`AppShell` renders `<Outlet />` in place of `{children}`.

## Per-page changes

- **HomePage**: wrap root `<div className="mx-auto flex max-w-md ...">` → becomes `max-w-2xl` and drops its own outer margin concerns (shell's content column already centers). Existing `PageHeader` call stays as-is.
- **UnitPage**: currently has ad-hoc `<div className="p-4">` states with a bare `<h1>`, no `PageHeader`. Add `PageHeader` (title = unit title or app title, no `displayName` needed) to each returned state, wrap content at `max-w-2xl`.
- **ReviewPage**: same — add `PageHeader` to each of its states (error, caught-up, summary, empty, in-progress), wrap at `max-w-2xl`.
- **DrillPage**: already uses `max-w-md` in three places; bump to `max-w-2xl`, add `PageHeader` if not already present (currently none — verify at implementation time).
- **AuthPage / OnboardingPage**: no change.

## Testing

- New `AppShell.test.tsx`: renders nav links, marks the active route (via `MemoryRouter` + `useLocation`), hidden/visible classes present for the `lg:` breakpoint (can't assert actual viewport in jsdom — assert the Tailwind classes exist, matching the pattern used by `i18n.test.ts`/`LanguagePicker.test.tsx` for behavior, not pixels).
- Each page's existing test file: assert `PageHeader`/nav content is present where newly added (Unit/Review/Drill).
- Manual verification: `resize_window` to desktop (1280×800) and mobile (375×812) presets in the browser preview, both `en` (ltr) and `he` (rtl), confirm sidebar shows/hides and mirrors correctly.

## Out of scope

- Two-column Home layout (considered, rejected — see brainstorm).
- Mobile bottom-tab nav (not requested; mobile nav stays link-based as today).
- Fixing the ar/ru/fr missing `drill.*` translation keys (pre-existing, unrelated).
