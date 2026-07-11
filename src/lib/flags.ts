// Runtime feature flags, read from Vite env at call time (not module load) so
// tests can toggle them with vi.stubEnv. Set VITE_ENABLE_DRILL=true to surface
// the AI drill entry points; keep it unset until the `drill` edge function is
// deployed, otherwise the links lead to a "coach unavailable" fallback.
export const drillEnabled = (): boolean =>
  import.meta.env.VITE_ENABLE_DRILL === 'true';
