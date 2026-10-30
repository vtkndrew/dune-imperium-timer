import { expect, test } from '@playwright/test';

test('responsive shell, dialog and keyboard focus', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Приложение', exact: true }).focus();
  await page.getByRole('button', { name: 'Приложение', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Приложение', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('transactional local storage survives reload and rejects stale writers', async ({ page }) => {
  await page.goto('/');
  expect(
    await page.evaluate(async () => {
      const { LocalStore, StorageConflict } = await import('/src/shared/lib/storage.ts');
      const validator = (v: unknown): v is string => typeof v === 'string';
      const a = new LocalStore('dune-imperium-timer:test', validator);
      const b = new LocalStore('dune-imperium-timer:test', validator);

      await a.write(0, 'synthetic');

      try {
        await b.write(0, 'stale');

        return false;
      } catch (e) {
        return e instanceof StorageConflict;
      }
    }),
  ).toBe(true);
  await page.reload();
  expect(
    await page.evaluate(async () => {
      const { LocalStore } = await import('/src/shared/lib/storage.ts');

      return (
        await new LocalStore(
          'dune-imperium-timer:test',
          (v: unknown): v is string => typeof v === 'string',
        ).read()
      )?.value;
    }),
  ).toBe('synthetic');
});
