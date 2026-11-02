import { expect, test, type Page } from '@playwright/test';

import { fillResults, stopGame } from './helpers';

async function data(page: Page) {
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);

  return page.evaluate(async () => {
    const { GameRepository } = await import('/src/entities/game/index.ts');

    return (await new GameRepository().read()).data;
  });
}

async function twoPlayers(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
}

async function namePlayer(page: Page, index: number, name: string) {
  await page.getByRole('button', { name: `Имя игрока ${index}`, exact: true }).click();
  await page.getByLabel('Поиск или имя нового игрока').fill(name);
  await page.getByRole('button', { name: `Новый игрок: ${name}`, exact: true }).click();
}

test('custom palette allows duplicates, changes availability and restores focus', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('input[type=color]')).toHaveCount(0);
  const color = page.getByRole('button', { name: 'Цвет игрока 1', exact: true });

  await color.click();
  await expect(page.getByRole('button', { name: 'Голубой', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Жёлтый', exact: true }).click();
  await expect(color).toBeFocused();
  expect((await data(page)).settings.players.slice(0, 2).map((p: any) => p.color)).toEqual([
    '#e3b62f',
    '#e3b62f',
  ]);
  await page.getByRole('button', { name: 'Добавить игрока' }).click();
  await color.click();
  await page.screenshot({ path: info.outputPath('palette-390.png') });
  await page.getByRole('button', { name: 'Серый', exact: true }).click();
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  expect((await data(page)).settings.players[0].color).toBe('#c43d35');
  await color.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(color).toBeFocused();
});

test('stopped drafts survive reload and coexist with a new game; editing, renaming and deleting recompute Elo', async ({
  page,
}, info) => {
  await twoPlayers(page);
  await namePlayer(page, 1, 'Алексей');
  await namePlayer(page, 2, 'Борис');
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await stopGame(page);
  await page.getByLabel('Победные очки', { exact: true }).first().fill('10');
  const stopped = await data(page);

  expect(stopped.current).toBeNull();
  expect(stopped.archive).toHaveLength(0);
  expect(stopped.drafts).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: 'Начать партию' }).click();
  const activeId = (await data(page)).current.id;

  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByRole('button').filter({ hasText: 'Продолжить заполнение' }).click();
  await expect(page.getByLabel('Победные очки', { exact: true }).first()).toHaveValue('10');
  await fillResults(page, 2);
  let saved = await data(page);
  const archived = saved.archive[0].game;

  expect(saved.current.id).toBe(activeId);
  await page.getByRole('button', { name: 'Статистика', exact: true }).click();
  await page
    .getByRole('button')
    .filter({ hasText: 'Алексей' })
    .filter({ hasText: '1016 Elo' })
    .click();
  await expect(page.getByRole('img', { name: /График Elo/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('profile-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Изменить имя' }).click();
  await page.getByLabel('Новое имя').fill('АЛЕКСАНДР');
  await page.getByRole('button', { name: 'Сохранить имя' }).click();
  saved = await data(page);
  expect(saved.archive[0].game.players[0].name).toBe('АЛЕКСАНДР');
  expect(saved.current.players[0].name).toBe('АЛЕКСАНДР');
  await page.getByRole('button', { name: 'История 1' }).click();
  await page.getByRole('button').filter({ hasText: 'АЛЕКСАНДР · Борис' }).click();
  await page.getByRole('button', { name: 'Изменить итоги' }).click();
  await page.getByLabel('Победные очки', { exact: true }).first().fill('3');
  expect((await data(page)).archive[0].game.finals[archived.players[0].id].points).toBe(10);
  await page.getByRole('button', { name: 'Подтвердить итоги и сохранить' }).click();
  saved = await data(page);
  expect(saved.archive[0].game.intervals).toEqual(archived.intervals);
  expect(saved.archive[0].game.winnerIds).toEqual([archived.players[1].id]);
  await page.getByRole('button', { name: 'Статистика', exact: true }).click();
  await expect(
    page.getByRole('button').filter({ hasText: 'Борис' }).filter({ hasText: '1016 Elo' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'История 1' }).click();
  await page.getByRole('button').filter({ hasText: 'АЛЕКСАНДР · Борис' }).click();
  await page.getByRole('button', { name: 'Удалить партию', exact: true }).click();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect((await data(page)).archive).toHaveLength(1);
  await page.getByRole('button', { name: 'Удалить партию', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  saved = await data(page);
  expect(saved.archive).toHaveLength(0);
  expect(saved.current.id).toBe(activeId);
  await page.getByRole('button', { name: 'Статистика', exact: true }).click();
  await expect(
    page.getByRole('button').filter({ hasText: 'Борис' }).filter({ hasText: '1000 Elo' }),
  ).toBeVisible();
});

test('manual games without a timer round trip v2 and leave measured averages unknown', async ({
  page,
  browser,
}, info) => {
  await twoPlayers(page);
  const expansionName = 'Расцвет Иксианцев';

  await page.getByLabel(expansionName, { exact: true }).check();
  await expect(
    page
      .getByLabel('Герой игрока 1', { exact: true })
      .locator('optgroup')
      .filter({ has: page.locator('option[value="rhombur"]') }),
  ).toHaveAttribute('label', expansionName);

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByLabel(expansionName, { exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`expansion-setup-${width}.png`) });
  }

  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByRole('button', { name: '＋ Добавить партию вручную' }).click();
  await expect(page.getByLabel('Без таймера')).toBeChecked();
  await page.getByText('Настройки партии — дополнения', { exact: true }).click();
  await page.getByLabel(expansionName, { exact: true }).check();

  for (const width of [320, 390, 844, 1280]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`results-${width}.png`) });
  }

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByLabel('Победные очки', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`final-fields-${width}.png`) });
  }

  for (const field of await page.locator('select:visible').all()) {
    expect((await field.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  await expect(page.getByRole('button', { name: 'Подтвердить итоги и сохранить' })).toBeDisabled();
  await fillResults(page, 2);
  const saved = await data(page);
  const game = saved.archive[0].game;

  expect(game.expansions).toEqual(['ix']);
  await expect(page.getByText(/База · Расцвет Иксианцев/)).toBeVisible();
  expect(game.kind).toBe('manual');
  expect(game.timing.kind).toBe('none');
  expect(game.intervals).toBeUndefined();
  const downloading = page.waitForEvent('download');

  await page.getByRole('button', { name: '↑ Экспорт JSON' }).click();
  const download = await downloading;
  const path = await download.path();

  expect(path).toBeTruthy();
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5181' });
  const other = await context.newPage();

  try {
    await other.goto('/');
    await other.getByRole('button', { name: 'История 0' }).click();
    await other.getByLabel('Файл партии JSON').setInputFiles(path as string);
    await other.getByRole('button', { name: 'Добавить в историю', exact: true }).click();
    await expect(other.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
    expect((await data(other)).archive[0].game).toEqual(game);
    await expect(other.getByText(/База · Расцвет Иксианцев/)).toBeVisible();
  } finally {
    await context.close();
  }

  await page.getByRole('button', { name: 'Статистика', exact: true }).click();
  const sets = page.getByLabel('Наборы', { exact: true });

  await expect(sets.locator('option[value="ix"]')).toHaveText('С дополнением „Расцвет Иксианцев“');
  await sets.selectOption('ix');
  await expect(sets).toHaveAccessibleDescription(expansionName);

  for (const width of [320, 390, 844, 1280]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await sets.scrollIntoViewIfNeeded();
    await expect(
      page.getByText(expansionName, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`statistics-${width}.png`) });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button')
    .filter({ hasText: 'Игрок 1' })
    .filter({ hasText: '1016 Elo' })
    .click();
  await expect(page.getByText('По 0 партиям', { exact: true }).first()).toBeVisible();
});

test('manual summary timing and expansion fields are preserved; draft deletion keeps original', async ({
  page,
}) => {
  await twoPlayers(page);
  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByRole('button', { name: '＋ Добавить партию вручную' }).click();
  await page.getByLabel('Без таймера').uncheck();
  await page.getByText('Настройки партии — дополнения', { exact: true }).click();
  await page.getByLabel('Расцвет Иксианцев', { exact: true }).check();
  await page.getByLabel('Бессмертие', { exact: true }).check();
  await page.getByLabel('Кровные узы', { exact: true }).check();

  for (let i = 0; i < 2; i += 1) {
    const card = page.locator('[data-player-id]').nth(i);

    await card.getByText('Дополнительная статистика', { exact: true }).click();
    await card.getByLabel('Общий расход, мин', { exact: true }).fill(String(i + 1));

    for (const label of [
      'Приобретённые дредноуты',
      'Оставшиеся технологии',
      'Оставшиеся образцы',
      'Этап исследования (столбец)',
      'Положение на шкале тлейлаксу',
      'Приобретённые командиры',
      'Командиры в гарнизоне',
    ]) {
      await card.getByLabel(label, { exact: true }).fill('0');
    }

    await card.getByLabel('Технология Chaumurky', { exact: true }).selectOption('false');
  }

  await fillResults(page, 2);
  const original = (await data(page)).archive[0].game;

  expect(original.timing.players[original.players[1].id].total).toBe(120000);
  expect(original.expansions).toHaveLength(3);
  await page.getByRole('button', { name: 'Изменить итоги' }).click();
  await page.getByLabel('Победные очки', { exact: true }).first().fill('1');
  await page.getByRole('button', { name: 'Удалить черновик', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  expect((await data(page)).archive[0].game).toEqual(original);
});

test('failed stop freezes the exact end time in memory and retry saves the same draft', async ({
  page,
}) => {
  await twoPlayers(page);
  await page.getByRole('button', { name: 'Начать партию' }).click();
  const before = await data(page);

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;

    (window as any).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };

    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'app' && args[1] === 'drafts') {
        throw new DOMException('Тест: остановка без места', 'QuotaExceededError');
      }

      return original.apply(this, args);
    };
  });
  await stopGame(page);
  const stoppedBefore = Date.now();

  await expect(page.getByRole('heading', { name: 'Часы остановлены.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Тест: остановка без места');
  expect((await data(page)).current.id).toBe(before.current.id);
  await page.getByLabel('Победные очки', { exact: true }).first().fill('10');
  await page.evaluate(() => (window as any).restorePut());
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  const saved = await data(page);

  expect(saved.current).toBeNull();
  expect(saved.drafts).toHaveLength(1);
  expect(saved.drafts[0].game.endedAt).toBeLessThanOrEqual(stoppedBefore);
  expect(saved.drafts[0].game.finals[before.current.players[0].id].points).toBe(10);
  await page.reload();
  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByRole('button').filter({ hasText: 'Продолжить заполнение' }).click();
  await expect(page.getByLabel('Победные очки', { exact: true }).first()).toHaveValue('10');
});

test('sand animation renders a readable result with real motion on mobile', async ({
  page,
}, info) => {
  await page.goto('/');
  const random = page.getByRole('button', { name: '⚄ Случайно', exact: true });

  await random.click();
  await page.waitForFunction(() =>
    document.getAnimations().some((a) => Number(a.currentTime) > 600),
  );
  await page.screenshot({ path: info.outputPath('sand-moving-390.png') });
  await expect(page.locator('[data-settled=true]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Готово', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('sand-result-390.png') });
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 4000 });
  await expect(random).toBeFocused();
});
