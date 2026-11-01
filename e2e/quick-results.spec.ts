import { expect, test } from '@playwright/test';

import { fillResults, stopGame } from './helpers';

for (const count of [2, 3, 4, 5, 6]) {
  test(`quick measured results for ${count} players keep card positions and save points only`, async ({
    page,
  }, info) => {
    await page.goto('/');

    for (let i = 4; i > count; i--) {
      await page.getByRole('button', { name: 'Убрать игрока' }).click();
    }

    for (let i = 4; i < count; i++) {
      await page.getByRole('button', { name: 'Добавить игрока' }).click();
    }

    await page.getByRole('button', { name: 'Начать партию' }).click();
    await stopGame(page);
    const cards = page.locator('[data-player-id]');

    await expect(cards).toHaveCount(count);
    await expect(page.getByLabel('Победные очки', { exact: true })).toHaveCount(count);
    await expect(page.getByLabel('Вода', { exact: true }).first()).toBeHidden();
    const positions = () =>
      cards.evaluateAll((items) =>
        items.map((el) => {
          const rect = el.getBoundingClientRect();

          return [el.getAttribute('data-player-id'), rect.x + scrollX, rect.y + scrollY];
        }),
      );
    const before = await positions();

    await fillResults(page, count, false);
    expect(await positions()).toEqual(before);
    // Change order and use keyboard input; the cards still stay in their original seats.
    const points = page.getByLabel('Победные очки', { exact: true });

    await points.first().focus();
    await page.keyboard.press('ArrowUp');
    await expect(points.first()).toHaveValue('11');
    await points.last().fill('0');
    expect(await positions()).toEqual(before);

    if (count === 4) {
      for (const width of [320, 390, 844, 1280]) {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({ path: info.outputPath(`quick-${width}.png`), fullPage: true });
      }
    }

    await page.getByRole('button', { name: 'Подтвердить итоги и сохранить' }).click();
    await expect(page.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
    await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
    const saved = await page.evaluate(async () => {
      const { GameRepository } = await import('/src/entities/game/index.ts');

      return (await new GameRepository().read()).data.archive[0].game;
    });

    expect(saved.players).toHaveLength(count);
    expect(Object.values(saved.finals)).toEqual(
      Array.from({ length: count }, (_, i) => ({
        points: [11, ...Array.from({ length: count - 2 }, (_, j) => 9 - j), 0][i],
      })),
    );
    expect(saved.resultsConfirmed).toBe(true);
    expect(saved.intervals.length).toBeGreaterThan(0);
  });
}

test('equal groups need explicit places; optional data do not change them and score edits reset affected choices', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByRole('button', { name: '＋ Добавить партию вручную' }).click();
  const points = page.getByLabel('Победные очки', { exact: true });

  for (const [index, value] of [10, 10, 8, 8].entries()) {
    await points.nth(index).fill(String(value));
  }

  const save = page.getByRole('button', { name: 'Подтвердить итоги и сохранить' });

  await expect(save).toBeDisabled();

  for (let i = 1; i <= 4; i++) {
    await page
      .getByLabel(`Место: Игрок ${i}`, { exact: true })
      .selectOption(String(i <= 2 ? 1 : i));
  }

  await expect(save).toBeDisabled();
  await page.getByLabel('Подтверждаю совместное место, если оно указано').check();
  await expect(save).toBeEnabled();
  const second = page.locator('[data-player-id]').nth(1);

  await second.getByText('Дополнительная статистика', { exact: true }).click();
  await second.getByLabel('Пряность', { exact: true }).fill('100');
  await second.getByLabel('Вода', { exact: true }).fill('0');
  await second.getByLabel('Мечник', { exact: true }).selectOption('false');
  await expect(save).toBeEnabled();
  await expect(page.getByLabel('Место: Игрок 1', { exact: true })).toHaveValue('1');
  await page.screenshot({ path: info.outputPath('optional-and-shared.png'), fullPage: true });
  await points.first().fill('9');
  await expect(page.getByLabel('Место: Игрок 1', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Место: Игрок 3', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Место: Игрок 4', { exact: true })).toHaveValue('4');
  await points.first().fill('10');
  await expect(page.getByLabel('Место: Игрок 1', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Место: Игрок 2', { exact: true })).toHaveValue('');
  await expect(save).toBeDisabled();
  await page.getByLabel('Место: Игрок 1', { exact: true }).selectOption('1');
  await page.getByLabel('Место: Игрок 2', { exact: true }).selectOption('2');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
});
