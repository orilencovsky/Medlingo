import { handler } from './handler.ts';

// The actual request-handling logic lives in ./handler.ts so it can be
// imported and unit-tested (handler.test.ts) without this file's
// `Deno.serve` call — which the Supabase Edge Runtime relies on running
// unconditionally at module load — ever starting a real network listener
// as a side effect of a test import.
Deno.serve(handler);
