import { expect, test, type Locator, type Page } from '@playwright/test';

async function gap(before: Locator, after: Locator, minimum: number) {
  const a = await before.boundingBox();
  const b = await after.boundingBox();

  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect((b?.y ?? 0) - ((a?.y ?? 0) + (a?.height ?? 0))).toBeGreaterThanOrEqual(minimum - 0.5);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const [width, height] of [
  [320, 740],
  [390, 844],
  [844, 390],
  [1280, 900],
]) {
  test(`shared spacing, focus and screens at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Начать партию' })).toBeVisible();
    await expect(page.getByLabel('Файл партии JSON')).toHaveCount(0);
    await noOverflow(page);
    expect(
      await page
        .getByRole('button', { name: 'Новая партия', exact: true })
        .evaluate((n) => getComputedStyle(n).paddingInlineStart),
    ).toBe('8px');
    await page.getByRole('button', { name: 'Имя игрока 1', exact: true }).click();
    const input = page.getByLabel('Поиск или имя нового игрока');

    await input.focus();
    const focus = await input.evaluate((n) => ({
      outline: getComputedStyle(n).outlineWidth,
      offset: getComputedStyle(n).outlineOffset,
      gap: getComputedStyle(n.parentElement as HTMLElement).gap,
    }));

    expect(focus).toEqual({ outline: '2px', offset: '2px', gap: '8px' });
    await input.fill('Очень длинное имя путешественника по пустыне Арракис');
    await page.screenshot({ path: info.outputPath(`profile-picker-${width}.png`) });
    await page.getByRole('button', { name: /^Новый игрок:/ }).click();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`setup-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'История 0', exact: true }).click();
    await expect(page.getByLabel('Файл партии JSON')).toHaveCount(1);
    await gap(page.locator('[data-ui=actions]'), page.locator('[class*=empty]'), 16);
    await page.screenshot({ path: info.outputPath(`empty-history-${width}.png`), fullPage: true });
    const badFile = { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') };

    await page.getByLabel('Файл партии JSON').setInputFiles(badFile);
    await expect(page.getByRole('status').filter({ hasText: /JSON/ })).toBeVisible();
    await page.getByRole('button', { name: 'Скрыть сообщение' }).click();
    await page.getByLabel('Файл партии JSON').setInputFiles(badFile);
    await expect(page.getByRole('status').filter({ hasText: /JSON/ })).toBeVisible();
    await page.getByRole('button', { name: 'Скрыть сообщение' }).click();
    await page.getByRole('button', { name: /Добавить партию вручную/ }).click();
    await expect(page.getByLabel('Файл партии JSON')).toHaveCount(0);
    await gap(
      page.getByRole('navigation', { name: 'Основные разделы' }),
      page.getByRole('button', { name: '← История', exact: true }),
      24,
    );
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`manual-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Статистика', exact: true }).click();
    await page.getByRole('button').filter({ hasText: 'Очень длинное имя путешественника' }).click();
    await gap(
      page.getByRole('navigation', { name: 'Основные разделы' }),
      page.getByRole('button', { name: '← Все игроки' }),
      24,
    );
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`statistics-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Изменить имя' }).click();
    await gap(
      page.getByLabel('Новое имя'),
      page.getByRole('button', { name: 'Сохранить имя' }),
      16,
    );
    await page.screenshot({ path: info.outputPath(`rename-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Изменить имя' })).toBeFocused();
  });

  test(`sand retains geometry and DOM at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByRole('button', { name: 'Случайный герой', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    const ribbon = dialog.locator('[class*=ribbon]');
    const done = dialog.getByRole('button', { name: 'Готово', includeHidden: true });

    await expect(done).toBeHidden();
    await expect(done).toHaveAttribute('tabindex', '-1');
    const geometry = () =>
      dialog.evaluate((node) =>
        [
          node,
          ...node.querySelectorAll(
            '[class*=sand], [class*=window], [class*=caption], [class*=hint], [data-ui=actions]',
          ),
        ].map((n) => {
          const r = n.getBoundingClientRect();

          return [r.x, r.y, r.width, r.height];
        }),
      );

    await ribbon.evaluate((node) => {
      (window as any).originalRibbon = node;
    });
    const before = await geometry();

    expect(await dialog.locator('[class*=particles] i').count()).toBe(24);
    await page.screenshot({ path: info.outputPath(`moving-${width}.png`) });
    await expect(dialog.locator('[data-settled=true]')).toBeVisible();
    expect(await ribbon.evaluate((node) => node === (window as any).originalRibbon)).toBe(true);
    expect(await geometry()).toEqual(before);
    await expect(done).toBeVisible();
    await expect(done).toHaveAttribute('tabindex', '0');
    const particles = () =>
      dialog
        .locator('[class*=particles] i')
        .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).transform));
    const frozen = await particles();

    await page.waitForTimeout(150);
    expect(await particles()).toEqual(frozen);
    await gap(dialog.locator('[class*=sand]'), done, 16);
    await page.screenshot({ path: info.outputPath(`settled-${width}.png`) });
    await done.click();
  });
}

test('static pages make no periodic React commits or DOM mutations; expiry works away from game', async ({
  page,
}) => {
  // Instrument the real TablePage with React's Profiler, without changing production code.
  await page.route('**/src/main.tsx', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    import React from '/node_modules/.vite/deps/react.js';
    const { createElement, Profiler } = React;
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    const { createRoot } = ReactDOM;
    import { TablePage } from '/src/pages/table/index.ts';
    import '/src/app/styles.css';
    window.uiCommits = 0;
    createRoot(document.getElementById('root')).render(createElement(Profiler, {id:'table',onRender:()=>window.uiCommits++}, createElement(TablePage)));
  `,
    }),
  );
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать партию' })).toBeVisible();
  const observe = () =>
    page.evaluate(() => {
      (window as any).uiCommits = 0;
      (window as any).uiMutations = 0;
      (window as any).uiObserver?.disconnect();
      const observer = new MutationObserver((records) => {
        (window as any).uiMutations += records.length;
      });

      observer.observe(document.querySelector('main') as HTMLElement, {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      });
      (window as any).uiObserver = observer;
    });

  const idle = async () => {
    await observe();
    await page.clock.runFor(1200);
    expect(
      await page.evaluate(() => [(window as any).uiCommits, (window as any).uiMutations]),
    ).toEqual([0, 0]);
  };

  await idle();
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    const { GameRepository, startGame } = await import('/src/entities/game/index.ts');
    const repo = new GameRepository();
    const { data, revision } = await repo.read();

    data.current = startGame(data.settings, Date.now() - data.settings.players[0].initialMs + 2000);
    await repo.save(revision, data, null);
  });
  await page.addInitScript(() => {
    (window as any).signals = 0;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: () => {
        (window as any).signals++;

        return true;
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Статистика', exact: true }).click();
  await idle();
  await idle();
  expect(await page.evaluate(() => (window as any).signals)).toBe(1);
  await page.getByRole('button', { name: 'История 0', exact: true }).click();
  await idle();
  await page.getByRole('button', { name: 'За столом', exact: true }).click();
  await expect(page.locator('[class*=bigTime]')).toContainText('−');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(5000);
  await page.evaluate(() => {
    delete (document as any).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('[class*=bigTime]')).toContainText('−00:');
  expect(await page.evaluate(() => (window as any).signals)).toBe(1);
});
