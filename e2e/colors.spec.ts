import { expect, test, type Page } from '@playwright/test';

async function color(page: Page, seat: number, name: string) {
  await page.getByRole('button', { name: `Цвет игрока ${seat}`, exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

for (const count of [2, 3, 4, 5, 6]) {
  test(`duplicate colors block only starting, with ${count} players`, async ({ page }, info) => {
    await page.goto('/');

    while (Number(await page.getByLabel('Количество игроков').textContent()) !== count) {
      const current = Number(await page.getByLabel('Количество игроков').textContent());

      await page
        .getByRole('button', { name: current > count ? 'Убрать игрока' : 'Добавить игрока' })
        .click();
    }

    const start = page.getByRole('button', { name: 'Начать партию' });

    await color(page, 1, 'Жёлтый');
    await expect(start).toBeDisabled();
    await expect(page.locator('[data-color-conflict=true]')).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'Цвет игрока 1', exact: true }),
    ).toHaveAccessibleDescription('Этот цвет выбран ещё у Игрок 2.');
    await expect(page.getByRole('alert')).toContainText(
      'Для начала партии выберите каждому игроку отдельный цвет',
    );
    await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(start).toBeDisabled();
    await expect(page.locator('[data-color-conflict=true]')).toHaveCount(2);

    if (count >= 4) {
      await color(page, 3, 'Синий');
      await expect(page.locator('[data-color-conflict=true]')).toHaveCount(4);
      await color(page, 4, 'Зелёный');
    }

    await page.screenshot({ path: info.outputPath(`color-conflict-${count}.png`), fullPage: true });
    await color(page, 2, 'Красный');
    await expect(page.locator('[data-color-conflict=true]')).toHaveCount(0);
    await expect(start).toBeEnabled();
    await start.click();
    const finish = page.getByRole('button', { name: 'Завершить партию', exact: true });

    await expect(finish).toHaveAttribute('data-variant', 'ghost');
    expect(
      await finish.evaluate((n) => {
        const s = getComputedStyle(n);

        return [s.paddingLeft, s.paddingRight, s.minHeight];
      }),
    ).toEqual(['16px', '16px', '44px']);
    await finish.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(finish).toBeFocused();
  });
}

test('removing a conflicting seat clears its error; unavailable colors are revalidated', async ({
  page,
}) => {
  await page.goto('/');
  await color(page, 4, 'Красный');
  await expect(page.getByRole('button', { name: 'Начать партию' })).toBeDisabled();
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  await expect(page.getByRole('button', { name: 'Начать партию' })).toBeEnabled();
  await page.getByRole('button', { name: 'Добавить игрока' }).click();
  await page.getByRole('button', { name: 'Добавить игрока' }).click();
  await color(page, 1, 'Голубой');
  await color(page, 2, 'Красный');
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  await expect(page.locator('[data-color-conflict=true]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Начать партию' })).toBeDisabled();
});

async function storedData(page: Page) {
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);

  return page.evaluate(async () => {
    const { GameRepository } = await import('/src/entities/game/index.ts');

    return (await new GameRepository().read()).data;
  });
}

test('re-added players receive free colors and all additions preserve existing choices', async ({
  page,
}) => {
  await page.goto('/');
  await color(page, 3, 'Синий');
  await color(page, 4, 'Зелёный');
  const original = (await storedData(page)).settings.players;
  const add = page.getByRole('button', { name: 'Добавить игрока' });
  const remove = page.getByRole('button', { name: 'Убрать игрока' });

  for (let repeat = 0; repeat < 2; repeat++) {
    await remove.click();
    await add.click();
    const players = (await storedData(page)).settings.players;

    expect(players.slice(0, 3)).toEqual(original.slice(0, 3));
    expect(players[3].color).toBe('#47834c');
    await expect(page.getByRole('button', { name: 'Начать партию' })).toBeEnabled();
  }

  await add.click();
  await add.click();
  const expected = ['#c43d35', '#e3b62f', '#315fa8', '#47834c', '#75bfdb', '#92989e'];

  expect((await storedData(page)).settings.players.map((p) => p.color)).toEqual(expected);
  await page.reload();
  await expect(page.getByLabel('Количество игроков')).toHaveText('6');
  expect((await storedData(page)).settings.players.map((p) => p.color)).toEqual(expected);

  for (let i = 0; i < 4; i++) {
    await remove.click();
  }

  await color(page, 2, 'Синий');
  await color(page, 1, 'Жёлтый');
  const prefix = (await storedData(page)).settings.players;
  const assigned = ['#c43d35', '#47834c', '#75bfdb', '#92989e'];

  for (const value of assigned) {
    await add.click();
    const players = (await storedData(page)).settings.players;

    expect(players.slice(0, 2)).toEqual(prefix);
    expect(players.at(-1)?.color).toBe(value);
    expect(new Set(players.map((p) => p.color)).size).toBe(players.length);
  }
});

test('adding a player does not repair or extend an existing manual color conflict', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  await color(page, 2, 'Красный');
  await page.getByRole('button', { name: 'Добавить игрока' }).click();
  expect((await storedData(page)).settings.players.map((p) => p.color)).toEqual([
    '#c43d35',
    '#c43d35',
    '#e3b62f',
  ]);
  await expect(page.locator('[data-color-conflict=true]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Начать партию' })).toBeDisabled();
});

test('manual game can add several players using free colors without changing surviving participants', async ({
  page,
}) => {
  await page.goto('/');
  await color(page, 3, 'Синий');
  await color(page, 4, 'Зелёный');
  const settings = (await storedData(page)).settings;

  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByRole('button', { name: '＋ Добавить партию вручную' }).click();
  await page.getByRole('combobox', { name: /^Участников/ }).selectOption('3');
  const original = (await storedData(page)).drafts[0].game.players;

  await page.getByRole('combobox', { name: /^Участников/ }).selectOption('6');
  const data = await storedData(page);

  expect(data.drafts[0].game.players.slice(0, 3)).toEqual(original);
  expect(data.drafts[0].game.players.map((p) => p.color)).toEqual([
    '#c43d35',
    '#e3b62f',
    '#315fa8',
    '#47834c',
    '#75bfdb',
    '#92989e',
  ]);
  expect(data.settings).toEqual(settings);
  expect(data.current).toBeNull();
  expect(data.archive).toEqual([]);
});
