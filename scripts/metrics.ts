import { config } from 'dotenv';
config({ path: '.env.content' });
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const sections: Array<[string, string]> = [
    ['Unit completion', 'select * from v_unit_completion'],
    ['Return rates (D1/D3/D7)', 'select * from v_return_rates'],
    ['Reviews per user-day', 'select * from v_reviews_per_user_day'],
    ['First activity per user', 'select * from v_user_first_day'],
  ];
  for (const [title, query] of sections) {
    console.log(`\n== ${title} ==`);
    console.table(await sql.unsafe(query));
  }
  await sql.end();
}

main();
