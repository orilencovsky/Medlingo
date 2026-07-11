import { test, expect } from '@playwright/test';

const SSE_OPEN = [
  'event: delta\ndata: {"text":"שלום דוקטור, יש לי כאב בחזה."}\n\n',
  'event: done\ndata: {}\n\n',
].join('');
const SSE_TURN = [
  'event: delta\ndata: {"text":"כן, מהבוקר."}\n\n',
  'event: feedback\ndata: {"right":"Clear question","correction":"","tip":""}\n\n',
  'event: verdicts\ndata: [{"entryId":"keev","verdict":"used_correctly"}]\n\n',
  'event: done\ndata: {}\n\n',
].join('');

test('drill smoke with mocked coach', async ({ page }) => {
  let call = 0;
  await page.route('**/functions/v1/drill', async (route) => {
    call++;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: call === 1 ? SSE_OPEN : SSE_TURN,
    });
  });

  // [environment adaptation — onboarding gate] global-setup.ts resets the shared e2e
  // test user's `profiles` row before every run (same as it does for pilot.spec.ts).
  // ProtectedRoute treats a missing profile as "not onboarded" and redirects any
  // protected route — including /drill — to /onboarding. A direct `page.goto('/drill')`
  // therefore lands on the onboarding form instead of DrillPage (confirmed: it timed
  // out on `getByText('Start drill')` with the onboarding heading in the DOM). Complete
  // onboarding first, same testids as pilot.spec.ts, so the profile exists before we
  // navigate to /drill.
  await page.goto('/');
  await page.getByTestId('onboarding-name').fill('E2E Drill');
  await page.getByTestId('onboarding-submit').click();
  // [environment adaptation — navigation race] the submit handler's completeOnboarding()
  // call is async (auth.getUser() + an insert) and the button click resolves as soon as
  // the click dispatches, before that finishes. An immediate page.goto('/drill') right
  // after the click tears down the current document mid-request, which Chromium reports
  // back to the page as `TypeError: Failed to fetch` on the in-flight auth call (confirmed
  // via a failing run whose console showed exactly that, thrown from completeOnboarding).
  // Waiting for the post-onboarding home screen first lets that request land before we
  // navigate away.
  await expect(page.getByTestId('home-review-card')).toBeVisible();

  await page.goto('/drill');
  await page.getByText('Start drill').click();
  await expect(page.getByText(/יש לי כאב בחזה/)).toBeVisible();
  await page.getByTestId('drill-input').fill('יש לך חום?');
  await page.getByTestId('drill-send').click();
  await expect(page.getByTestId('drill-summary')).toBeVisible();
});
