// Shared CORS headers for the drill edge function. The SPA calls this
// function cross-origin (https://medlingo.pages.dev in prod,
// http://localhost:5173 in dev) with `Authorization` + `Content-Type:
// application/json` headers, which triggers a browser preflight OPTIONS
// request. Every response the function returns — the OPTIONS preflight
// reply, every error status, and the streaming 200 — must carry these so
// the browser doesn't block the call.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
