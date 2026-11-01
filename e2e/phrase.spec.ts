import { expect, test, type Page } from '@playwright/test';

async function settle(page: Page) {
  await page
    .getByRole('dialog')
    .locator('[class*=ribbon]')
    .evaluate((node) => {
      node.getAnimations().forEach((animation) => {
        animation.finish();
      });
    });
  await expect(page.locator('[data-settled=true]')).toBeVisible();
}

for (const width of [320, 390, 844, 1280]) {
  for (const phraseIndex of [2, 12]) {
    test(`phrase soft reveal keeps layout at ${width}px, phrase ${phraseIndex}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
      await page.clock.install();
      await page.goto('/');
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.evaluate((index) => {
        let call = 0;

        crypto.getRandomValues = ((array: Uint32Array) => {
          array[0] = call++ === 1 ? index : 0;

          return array;
        }) as typeof crypto.getRandomValues;
      }, phraseIndex);
      await page.getByRole('button', { name: '⚄ Случайно', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const hint = dialog.locator('[class*=hint]');

      await expect(hint).toHaveCSS('visibility', 'hidden');
      const original = await hint.elementHandle();
      const geometry = () =>
        dialog.evaluate((node) =>
          [node, ...node.querySelectorAll('[class*=hint]')].map((n) => {
            const r = n.getBoundingClientRect();

            return [r.x, r.y, r.width, r.height];
          }),
        );
      const before = await geometry();

      await settle(page);
      await expect(hint).toHaveCSS('visibility', 'visible');
      expect(await hint.evaluate((node, saved) => node === saved, original)).toBe(true);
      const stages = await hint.evaluate((node) => {
        const animation = node.getAnimations()[0];

        animation.pause();
        const positions = [0, 300, 600].map((time) => {
          animation.currentTime = time;

          return parseFloat(getComputedStyle(node).getPropertyValue('mask-position'));
        });
        const timing = animation.effect?.getTiming();

        animation.currentTime = 250;

        return {
          positions,
          duration: timing?.duration,
          easing: getComputedStyle(node).animationTimingFunction,
          mask: getComputedStyle(node).maskImage,
        };
      });

      expect(stages.positions[0]).toBe(100);
      expect(stages.positions[1]).toBeGreaterThan(0);
      expect(stages.positions[1]).toBeLessThan(100);
      expect(stages.positions[2]).toBe(0);
      expect(stages.duration).toBe(600);
      expect(stages.easing).toBe('ease-out');
      expect(stages.mask).toContain('40%');
      expect(await geometry()).toEqual(before);
      await page.screenshot({ path: info.outputPath(`reveal-${width}-${phraseIndex}.png`) });
      await hint.evaluate((node) => {
        node.getAnimations()[0].currentTime = 600;
      });
      expect(await geometry()).toEqual(before);
      await page.screenshot({ path: info.outputPath(`readable-${width}-${phraseIndex}.png`) });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: '⚄ Случайно', exact: true })).toBeFocused();
    });
  }
}

test('reopening cancels the previous reading timer and reduced motion keeps three seconds', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const opener = page.getByRole('button', { name: '⚄ Случайно', exact: true });

  await opener.click();
  await settle(page);
  await page.clock.runFor(1000);
  await page.keyboard.press('Escape');
  await opener.click();
  await settle(page);
  await page.clock.runFor(2600);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(999);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await opener.click();
  const hint = page.getByRole('dialog').locator('[class*=hint]');

  await expect(hint).toHaveCSS('visibility', 'visible');
  await expect(hint).toHaveCSS('mask-image', 'none');
  expect(await hint.evaluate((n) => n.getAnimations().length)).toBe(0);
  await page.clock.runFor(2999);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
