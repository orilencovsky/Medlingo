import { test, expect } from '@playwright/test';

test('learner can open the dictionary and search', async ({ page }) => {
  // [environment adaptation — onboarding gate] same root cause as drill.spec.ts:
  // global-setup.ts resets the shared e2e test user's `profiles` row before every run,
  // and ProtectedRoute treats a missing profile as "not onboarded", redirecting any
  // protected route — including /dictionary — to /onboarding. A direct
  // `page.goto('/dictionary')` would therefore land on the onboarding form instead of
  // DictionaryPage. Complete onboarding first, same testids as pilot.spec.ts/drill.spec.ts,
  // so the profile exists before we navigate to /dictionary.
  await page.goto('/');
  await page.getByTestId('onboarding-name').fill('E2E Dictionary');
  await page.getByTestId('onboarding-submit').click();
  // [environment adaptation — navigation race] see drill.spec.ts: the submit handler's
  // completeOnboarding() call is async and the click resolves before it finishes. Wait
  // for the post-onboarding home screen so that request lands before navigating away.
  await expect(page.getByTestId('home-review-card')).toBeVisible();

  await page.goto('/dictionary/all');
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page.getByRole('searchbox').fill('חום');
  // content/dictionary.tsv has two entries sharing the unpointed spelling חום
  // (chom = fever/heat, chum = brown), so both render "חום" as their heading — scope
  // to the first match rather than asserting a single (strict-mode-ambiguous) match.
  await expect(page.getByText('חום').first()).toBeVisible();
});
