import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.content' });

const EMAIL = 'e2e@medlingo.test';
const PASSWORD = 'e2e-password-123';

export default async function globalSetup() {
  const url = process.env.VITE_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // idempotent test user
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  }

  // reset learning state so every run starts fresh (service role bypasses RLS)
  for (const table of ['review_logs', 'user_card_state', 'unit_progress', 'profiles']) {
    await admin.from(table).delete().eq('user_id', user.id);
  }

  // mint a session and write storageState in supabase-js localStorage format
  const anon = createClient(url, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email: EMAIL, password: PASSWORD,
  });
  if (signInError) throw signInError;

  const projectRef = new URL(url).hostname.split('.')[0];
  mkdirSync('e2e/.auth', { recursive: true });
  writeFileSync('e2e/.auth/user.json', JSON.stringify({
    cookies: [],
    origins: [{
      origin: 'http://localhost:5173',
      localStorage: [{
        name: `sb-${projectRef}-auth-token`,
        value: JSON.stringify(signIn.session),
      }],
    }],
  }, null, 2));
}
