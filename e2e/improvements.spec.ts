import { expect, test, type Page } from '@playwright/test';

async function configure(page: Page, count: number) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать партию' })).toBeVisible();

  while (Number(await page.getByLabel('Количество игроков').textContent()) !== count) {
    const current = Number(await page.getByLabel('Количество игроков').textContent());

    await page
      .getByRole('button', { name: current > count ? 'Убрать игрока' : 'Добавить игрока' })
      .click();
  }
}

for (const count of [2, 3, 4, 5, 6]) {
  test(`setup first-player marker keeps ${count} cards aligned`, async ({ page }, info) => {
    await configure(page, count);
    const cards = page.locator('fieldset[data-color-conflict]');
    const select = page.getByLabel('Первый игрок', { exact: true });
    const positions = () =>
      cards.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = (element: Element) => {
            const r = element.getBoundingClientRect();

            return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
          };

          return {
            card: box(node),
            fields: [...node.querySelectorAll('button, input, select')].map(box),
          };
        }),
      );

    const checkMarker = async (width: number) => {
      const visible = cards.locator('[data-first-player="true"]:visible');

      await expect(visible).toHaveCount(1);
      const geometry = await visible.evaluate((node) => {
        const iconNode = node.querySelector('svg');
        const textNode = node.querySelector('span');
        const card = node.closest('fieldset');
        const fieldNode = card?.querySelector('button');
        const legendNode = card?.querySelector('legend');

        if (!iconNode || !textNode || !card || !fieldNode || !legendNode) {
          throw new Error('Missing setup marker structure');
        }

        const icon = iconNode.getBoundingClientRect();
        const text = textNode.getBoundingClientRect();
        const rect = node.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const field = fieldNode.getBoundingClientRect();
        const legend = legendNode.getBoundingClientRect();

        return {
          iconWidth: icon.width,
          iconHeight: icon.height,
          gap: text.left - icon.right,
          centers: [icon.top + icon.height / 2, text.top + text.height / 2],
          contained: rect.left >= cardRect.left && rect.right <= cardRect.right,
          beforeField: rect.bottom <= field.top,
          belowLegend: rect.top >= legend.bottom,
          inLegend: node.parentElement?.tagName === 'LEGEND',
        };
      });

      expect(geometry.iconWidth).toBe(18);
      expect(geometry.iconHeight).toBe(18);
      expect(geometry.gap).toBeCloseTo(4, 1);
      expect(geometry.centers[0]).toBeCloseTo(geometry.centers[1], 1);
      expect(geometry.contained).toBe(true);
      expect(geometry.beforeField).toBe(true);
      expect(geometry.inLegend).toBe(width >= 700);

      if (width < 700) {
        expect(geometry.belowLegend).toBe(true);
      }

      const inactive = cards.locator('[data-first-player="false"]');

      for (const badge of await inactive.all()) {
        await expect(badge).toBeHidden();
        await expect(badge).toHaveAttribute('aria-hidden', 'true');
      }

      const rowPositions = await positions();
      const columns = width < 700 ? 2 : 3;

      for (let i = 0; i < Math.min(columns, count); i++) {
        expect(rowPositions[i].fields[0].y).toBeCloseTo(rowPositions[0].fields[0].y, 1);
      }
    };

    for (const width of [320, 360, 390, 412, 699, 700, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await select.selectOption('0');
      await checkMarker(width);
      const before = await positions();

      await select.selectOption(String(count - 1));
      await checkMarker(width);
      expect(await positions()).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );

      if (count === 4 && [320, 390, 700, 1280].includes(width)) {
        await page.screenshot({
          path: info.outputPath(`setup-marker-${width}.png`),
          fullPage: true,
        });
      }
    }

    if (count === 4) {
      await page.getByRole('button', { name: 'Имя игрока 1', exact: true }).click();
      await page
        .getByLabel('Поиск или имя нового игрока')
        .fill('Очень длинное имя путешественника Арракиса');
      await page.getByRole('button', { name: /^Новый игрок:/ }).click();
      await page.addStyleTag({
        content:
          'fieldset[data-color-conflict] legend { font-size: 16.5px } [data-first-player] { font-size: 13.5px }',
      });

      for (const width of [320, 390, 700, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await select.selectOption('0');
        await checkMarker(width);
        const before = await positions();

        await select.selectOption('1');
        await checkMarker(width);
        expect(await positions()).toEqual(before);
        await page.screenshot({
          path: info.outputPath(`setup-marker-large-text-${width}.png`),
          fullPage: true,
        });
      }
    }
  });
}

for (const count of [2, 3, 4, 5, 6]) {
  test(`fixed clockwise seats for ${count} players at every screen size`, async ({
    page,
  }, info) => {
    await configure(page, count);
    await page.getByLabel('Первый игрок', { exact: true }).selectOption(String(count - 1));
    await page.getByRole('button', { name: 'Начать партию' }).click();
    const cards = page.locator('[data-seat]');
    const active = page.locator('[data-seat][data-active="true"]');

    await expect(active).toHaveAttribute('data-seat', String(count));

    for (const [width, height] of [
      [320, 740],
      [390, 844],
      [844, 390],
      [1280, 900],
    ]) {
      await page.setViewportSize({ width, height });
      const positions = await cards.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();

          return { x: rect.x, y: rect.y, center: rect.x + rect.width / 2 };
        }),
      );
      const top = count > 4 ? 3 : 2;

      for (let i = 1; i < top; i += 1) {
        expect(positions[i].y).toBe(positions[0].y);
        expect(positions[i].x).toBeGreaterThan(positions[i - 1].x);
      }

      for (let i = top; i < count; i += 1) {
        expect(positions[i].y).toBeGreaterThan(positions[0].y);

        if (i > top) {
          expect(positions[i].x).toBeLessThan(positions[i - 1].x);
        }
      }

      if (count === 3) {
        expect(positions[2].center).toBeCloseTo((positions[0].center + positions[1].center) / 2, 0);
      }

      if (count >= 4) {
        expect(positions[count - 1].x).toBe(positions[0].x);
        expect(positions[top].x).toBe(positions[top - 1].x);
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`seats-${count}-${width}.png`),
        fullPage: true,
      });
    }

    const before = await cards.evaluateAll((nodes) =>
      nodes.map((n) => ({
        seat: n.getAttribute('data-seat'),
        x: n.getBoundingClientRect().x,
        row: getComputedStyle(n).gridRowStart,
      })),
    );

    await page.getByRole('button', { name: 'Завершить раскрытие', exact: true }).click();

    for (let i = 1; i < count; i += 1) {
      await expect(active).toHaveAttribute('data-seat', String(i));
      await page.getByRole('button', { name: 'Следующий ход →' }).click();
    }

    await expect(active).toHaveAttribute('data-seat', '1');

    for (let i = 1; i < count; i += 1) {
      await page.getByRole('button', { name: 'Завершить раскрытие', exact: true }).click();
    }

    await expect(active).toHaveAttribute('data-seat', String(count));

    for (let i = 0; i < count; i += 1) {
      await page.getByRole('button', { name: 'Пас →', exact: true }).click();
    }

    await page.getByRole('button', { name: 'Начать следующий раунд' }).click();
    await expect(active).toHaveAttribute('data-seat', '1');
    expect(
      await cards.evaluateAll((nodes) =>
        nodes.map((n) => ({
          seat: n.getAttribute('data-seat'),
          x: n.getBoundingClientRect().x,
          row: getComputedStyle(n).gridRowStart,
        })),
      ),
    ).toEqual(before);
  });
}

test('sand choice commits once, cancels cleanly and returns focus', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await configure(page, 4);
  await page.clock.pauseAt(new Date('2030-01-01T00:01:00Z'));
  const hero = page.getByLabel('Герой игрока 1', { exact: true });
  const original = await hero.inputValue();
  const opener = page.getByRole('button', { name: 'Случайный герой', exact: true }).first();

  await opener.click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.clock.runFor(700);
  await expect(hero).toHaveValue(original);
  await expect(page.getByRole('dialog').getByRole('status')).toBeEmpty();
  await page.screenshot({ path: info.outputPath('sand-in-motion.png') });
  await page.keyboard.press('Escape');
  await page.clock.runFor(3000);
  await expect(hero).toHaveValue(original);
  await expect(opener).toBeFocused();
  await opener.click();
  await page
    .getByRole('dialog')
    .locator('[class*=ribbon]')
    .evaluate((node) => {
      node.getAnimations().forEach((animation) => {
        animation.finish();
      });
    });
  await expect(hero).not.toHaveValue(original);
  const result = await hero.inputValue();

  for (let i = 2; i <= 4; i += 1) {
    expect(await page.getByLabel(`Герой игрока ${i}`, { exact: true }).inputValue()).not.toBe(
      result,
    );
  }

  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Выбран:');
  await page.screenshot({ path: info.outputPath('sand-result.png') });
  await page.clock.runFor(3599);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.clock.runFor(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(3000);
  await expect(hero).toHaveValue(result);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => {
    delete (document as any).hidden;
  });
  await page.getByRole('button', { name: '⚄ Случайно', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть окно' }).click();
  await page.clock.runFor(3000);
  await expect(page.locator('select[aria-label="Первый игрок"]')).toHaveValue('0');
});

test('reduced motion reveals immediately and allows the previous first player', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await configure(page, 4);
  await page.evaluate(() => {
    crypto.getRandomValues = ((array: Uint32Array) => {
      array[0] = 0;

      return array;
    }) as typeof crypto.getRandomValues;
  });
  await page.getByRole('button', { name: '⚄ Случайно', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Выбран: Игрок 1');
  await expect(page.locator('select[aria-label="Первый игрок"]')).toHaveValue('0');
  expect(await page.getByRole('dialog').locator('[class*="particles"]').count()).toBe(0);
});

test('touch feedback clears; static text and keyboard editing retain their intended behavior', async ({
  page,
}) => {
  await configure(page, 4);
  await page.getByRole('button', { name: 'Имя игрока 1', exact: true }).click();
  const input = page.getByLabel('Поиск или имя нового игрока');

  expect(await input.evaluate((n) => getComputedStyle(n).userSelect)).toBe('text');
  expect(
    await page
      .locator('h2')
      .first()
      .evaluate((n) => getComputedStyle(n).userSelect),
  ).toBe('none');
  await input.fill('Атрейдес');
  await page.getByRole('button', { name: 'Новый игрок: Атрейдес' }).click();
  const random = page.getByRole('button', { name: '⚄ Случайно', exact: true });

  await random.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(random).toBeFocused();
  await page.getByRole('button', { name: 'Начать партию' }).tap();

  for (const name of ['Следующий ход →', 'Завершить раскрытие']) {
    const button = page.getByRole('button', { name, exact: true });

    await button.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, pointerId: 1 });
    await expect(button).toHaveAttribute('data-pressed', 'true');
    await button.dispatchEvent('pointercancel', { pointerType: 'touch', pointerId: 1 });
    await expect(button).not.toHaveAttribute('data-pressed');
    await button.tap();
    await expect(page.locator('[data-pressed]')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-input', 'touch');
    expect(await button.evaluate((n) => getComputedStyle(n).filter)).toBe('none');
  }
});

test('repeated activation has one result and unmount cancels pending callbacks', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await configure(page, 4);
  await page.clock.pauseAt(new Date('2030-01-01T00:01:00Z'));
  const hero = page.getByRole('button', { name: 'Случайный герой', exact: true }).first();

  await page.evaluate(() => {
    (window as any).randomCalls = 0;
    crypto.getRandomValues = ((array: Uint32Array) => {
      (window as any).randomCalls += 1;
      array[0] = 0;

      return array;
    }) as typeof crypto.getRandomValues;
  });
  await hero.click();
  const calls = await page.evaluate(() => (window as any).randomCalls);

  await hero.dispatchEvent('click');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).randomCalls)).toBe(calls);
  await page.getByRole('button', { name: 'История 0' }).dispatchEvent('click');
  await page.clock.runFor(3000);
  await page.getByRole('button', { name: 'Новая партия', exact: true }).click();
  await expect(page.getByLabel('Герой игрока 1', { exact: true })).toHaveValue('paul');
});

test('settings save failure is retryable without touching game snapshots', async ({ page }) => {
  await configure(page, 4);
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
  const before = await page.evaluate(async () => {
    const { GameRepository, transition } = await import('/src/entities/game/index.ts');
    const repo = new GameRepository();
    const { data, revision } = await repo.read();

    data.settings.players[0].color = '#a45539';
    data.settings.players[1].color = '#123456';
    const archived = transition(data.current, { type: 'finish' }, Date.now());

    archived.id = crypto.randomUUID();
    data.archive = [{ game: archived, importedAt: null }];
    await repo.save(revision, data, null);

    return data;
  });

  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;

    (window as any).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };

    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (args[1] === 'settings') {
        throw new DOMException('Тест настроек: нет места', 'QuotaExceededError');
      }

      return original.apply(this, args);
    };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Приложение', exact: true }).click();
  await page.getByLabel('Звук при истечении времени').uncheck();
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Тест настроек: нет места');
  const read = () =>
    page.evaluate(async () => {
      const { GameRepository } = await import('/src/entities/game/index.ts');

      return (await new GameRepository().read()).data;
    });

  expect(await read()).toEqual(before);
  await page.evaluate(() => (window as any).restorePut());
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const after = await read();

  expect(after.current).toEqual(before.current);
  expect(after.archive).toEqual(before.archive);
  expect(after.settings.sound).toBe(false);
  expect(after.settings.players[0].color).toBe('#a45539');
  expect(after.settings.players[1].color).toBe('#123456');
});

test('mouse hover is removed when the last pointer becomes touch', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5181',
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();

  try {
    await configure(page, 4);
    const button = page.getByRole('button', { name: 'Начать партию' });
    const background = () => button.evaluate((node) => getComputedStyle(node).backgroundColor);
    const original = await background();

    await button.hover();
    expect(await background()).not.toBe(original);
    await button.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
    await button.dispatchEvent('pointerup', { pointerType: 'touch', button: 0 });
    expect(await background()).toBe(original);
    await expect(button).not.toHaveAttribute('data-pressed');
  } finally {
    await context.close();
  }
});
