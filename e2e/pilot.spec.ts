import { test, expect, type Page } from '@playwright/test';

async function completeExercise(page: Page) {
  const buttons = page.getByTestId(/exercise-(option|tile)-/);
  await buttons.first().waitFor();
  await buttons.first().click();
  await page.getByTestId('exercise-continue').click();
}

test('onboard → learn unit → review', async ({ page }) => {
  test.setTimeout(240_000);

  // fresh user → onboarding
  await page.goto('/');
  await page.getByTestId('onboarding-name').fill('E2E Doctor');
  await page.getByTestId('onboarding-submit').click();

  // home first-run → start the unit
  await expect(page.getByTestId('home-unit-card')).toContainText('Start');
  await page.getByTestId('home-unit-card').getByRole('link').click();

  // scenario → vocab (12 cards) → immediate practice (24 exercises)
  await page.getByTestId('unit-start').click();
  for (let i = 0; i < 12; i++) await page.getByTestId('unit-vocab-continue').click();
  for (let i = 0; i < 24; i++) await completeExercise(page);
  await expect(page.getByTestId('unit-complete')).toBeVisible();
  await page.getByRole('link').last().click(); // back home

  // home shows completed + due reviews exist (learning-state cards come due quickly;
  // wrong first-tap answers were rated again → due immediately)
  await expect(page.getByTestId('home-unit-card')).toContainText('Completed');

  // [environment adaptation — timing] the app's FSRS scheduler (ts-fsrs default
  // learning_steps = ["1m", "10m"]) makes an "again"-rated card due 1 real minute
  // after it was answered — not literally the same instant. This automated run
  // finishes all 24 practice exercises in ~20s (observed), well under that minute,
  // so /review would otherwise mount before any card is due. ReviewPage's due-card
  // check runs once on mount and never re-polls, so the loop below would then wait
  // forever for exercise buttons a caught-up screen never renders. Wait out the real
  // FSRS learning-step delay (with margin) so at least one card is genuinely due.
  await page.waitForTimeout(65_000);

  // review flow is reachable: either run a session or see the caught-up state
  await page.goto('/review');
  const summaryOrCaughtUp = page.getByTestId(/review-(summary|caught-up)/);
  while (!(await summaryOrCaughtUp.isVisible().catch(() => false))) {
    await completeExercise(page);
    // [environment adaptation — timing] each "Continue" click resolves as soon as the
    // click event dispatches, before the app's async submitReview (a few sequential
    // Supabase round trips) has committed the resulting phase transition. Without a
    // settle beat here, the loop's next isVisible() check races ahead of that commit,
    // re-enters completeExercise() for an exercise that no longer exists, resolves
    // buttons.first() to the just-answered (disabled) button, and hangs once it's
    // removed from the DOM on the final transition to summary/caught-up (there's no
    // next exercise left for Playwright's retry to fall back to). This does not skip
    // or reorder any flow step — it only gives the last real transition time to land.
    // The final card's transition is slower than the rest (ReviewPage additionally
    // awaits touchStreak(), 2 more sequential Supabase round trips, only on that last
    // one), so 500ms measured too tight in practice — widened with margin.
    await page.waitForTimeout(2_000);
  }
  await expect(summaryOrCaughtUp).toBeVisible();
});
