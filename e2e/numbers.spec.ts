import { expect, test, type Page, type Locator } from '@playwright/test';

import { fillResults, stopGame } from './helpers';

async function data(page: Page) {
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);

  return page.evaluate(async () => {
    const { GameRepository } = await import('/src/entities/game/index.ts');

    return (await new GameRepository().read()).data;
  });
}

async function paste(input: Locator, text: string) {
  await input.evaluate((node, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    setter?.call(node, value);
    node.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: value }),
    );
  }, text);
}

test.describe('desktop wheel', () => {
  test.use({ isMobile: false, hasTouch: false });

  test('points survive wheel, typing, blur and reload; invalid input never replaces saved values', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Начать партию' }).click();
    await stopGame(page);
    await fillResults(page, 4, false);
    const points = page.getByLabel('Победные очки', { exact: true });
    const first = points.first();

    await first.fill('12');
    await first.focus();
    await first.hover();
    const before = await page.evaluate(() => scrollY);

    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
    await expect(first).toBeFocused();
    await expect(first).toHaveValue('12');
    await first.press('ArrowUp');
    await first.press('ArrowDown');
    await expect(first).toHaveValue('12');
    await first.press('Tab');
    await expect(first).toHaveValue('12');
    const save = page.getByRole('button', { name: 'Подтвердить итоги и сохранить' });

    await first.fill('');
    await expect(first).toHaveValue('');
    await expect(first).toHaveAttribute('aria-invalid', 'true');
    await expect(save).toBeDisabled();
    let stored = await data(page);
    const id = stored.drafts[0].game.players[0].id;

    expect(stored.drafts[0].game.finals[id].points).toBe(12);
    await first.fill('0');
    await expect(first).toHaveValue('0');
    await first.fill('');
    await first.pressSequentially('12');
    await expect(first).toHaveValue('12');
    await points.nth(1).fill('9');
    await expect(first).toHaveValue('12');
    await paste(first, '1000001');
    await expect(first).toHaveValue('1000001');
    await first.press('Tab');
    await expect(first).toHaveValue('1000001');
    await expect(save).toBeDisabled();
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('invalid-points.png') });
    await page.reload();
    await page.getByRole('button', { name: 'История 0' }).click();
    await page.getByRole('button').filter({ hasText: 'Продолжить заполнение' }).click();
    await expect(first).toHaveValue('12');
    await expect(save).toBeEnabled();
    await save.click();
    stored = await data(page);
    expect(stored.archive[0].game.finals[id].points).toBe(12);
  });
});

test('setup presets recover invalid local text; signed corrections stay editable', async ({
  page,
}, info) => {
  await page.goto('/');
  const common = page.getByLabel('Минут каждому', { exact: true });
  const start = page.getByRole('button', { name: 'Начать партию' });

  await common.fill('1441');
  await expect(start).toBeDisabled();
  await expect(common).toHaveValue('1441');
  expect((await data(page)).settings.minutes).toBe(30);
  await page.screenshot({ path: info.outputPath('invalid-setup.png') });
  await page.getByRole('button', { name: '30 мин', exact: true }).click();
  await expect(common).toHaveValue('30');
  await expect(start).toBeEnabled();
  const personal = page.getByLabel('Минут игроку 4', { exact: true });

  await personal.fill('');
  await expect(start).toBeDisabled();
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  await expect(start).toBeEnabled();
  await start.click();
  await page.getByRole('button', { name: 'Ⅱ Пауза' }).click();
  await page.getByRole('button', { name: '± Время' }).click();
  const correction = page.getByLabel('Изменить запас на, минут');

  await correction.fill('-');
  await expect(correction).toHaveValue('-');
  await expect(page.getByRole('button', { name: 'Применить поправку' })).toBeDisabled();
  await correction.pressSequentially('2');
  await expect(correction).toHaveValue('-2');
  await page.getByRole('button', { name: 'Применить поправку' }).click();
  const saved = await data(page);

  expect(saved.current.adjustments.at(-1).deltaMs).toBe(-120000);
});

test('manual decimals, optional omissions and removed expansion errors', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByRole('button', { name: '＋ Добавить партию вручную' }).click();
  await fillResults(page, 4, false);
  const save = page.getByRole('button', { name: 'Подтвердить итоги и сохранить' });

  await page.getByLabel('Раундов', { exact: true }).fill('');
  await expect(save).toBeDisabled();
  await page.getByLabel('Раундов', { exact: true }).fill('2');
  await page.getByLabel('Без таймера').uncheck();
  const totals = page.getByLabel('Общий расход, мин', { exact: true });

  await totals.first().fill('1.23456');
  await totals.nth(1).fill('2');
  await expect(totals.first()).toHaveValue('1.23456');
  await totals.first().fill('1,');
  await expect(totals.first()).toHaveValue('1,');
  await expect(save).toBeDisabled();
  await totals.first().pressSequentially('5');
  await expect(totals.first()).toHaveValue('1,5');

  for (let i = 1; i < 4; i++) {
    await totals.nth(i).fill('2.25');
  }

  await expect(save).toBeEnabled();
  await page.getByText('Настройки партии — дополнения', { exact: true }).click();
  await page.getByLabel('Икс', { exact: true }).check();
  const card = page.locator('[data-player-id]').first();

  await card.getByText('Дополнительная статистика', { exact: true }).click();
  await card.getByLabel('Пряность', { exact: true }).fill('0');
  await card.getByLabel('Пряность', { exact: true }).fill('');
  await card.getByLabel('Вода', { exact: true }).fill('0');
  await card.getByLabel('Приобретённые дредноуты', { exact: true }).fill('-1');
  await expect(save).toBeDisabled();
  await page.getByLabel('Икс', { exact: true }).uncheck();
  await expect(save).toBeEnabled();
  const saved = await data(page);
  const game = saved.drafts[0].game;

  expect(game.finals[game.players[0].id].spice).toBeUndefined();
  expect(game.finals[game.players[0].id].water).toBe(0);
  expect(game.timing.players[game.players[0].id].total).toBe(90000);
  await save.click();
});

test('draw confirmation appears only for actual repeated places and lists every group', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByRole('button', { name: '＋ Добавить партию вручную' }).click();
  const points = page.getByLabel('Победные очки', { exact: true });

  for (const [i, value] of [10, 10, 8, 8].entries()) {
    await points.nth(i).fill(String(value));
  }

  const confirmation = page.getByLabel('Подтверждаю ничью между указанными игроками');

  await expect(confirmation).toHaveCount(0);
  await expect(page.getByText('Указаны одинаковые места.', { exact: false })).toHaveCount(0);

  for (let i = 1; i <= 4; i++) {
    await page.getByLabel(`Место: Игрок ${i}`, { exact: true }).selectOption(String(i));
  }

  await expect(confirmation).toHaveCount(0);
  await page.getByLabel('Место: Игрок 2', { exact: true }).selectOption('1');
  await page.getByLabel('Место: Игрок 4', { exact: true }).selectOption('3');
  await expect(page.getByText('Одинаковое 1-е место: Игрок 1, Игрок 2.')).toBeVisible();
  await expect(page.getByText('Одинаковое 3-е место: Игрок 3, Игрок 4.')).toBeVisible();
  await confirmation.check();
  await page.screenshot({ path: info.outputPath('draw-groups.png'), fullPage: true });
  await page.getByRole('button', { name: 'Подтвердить итоги и сохранить' }).click();
  await page.getByRole('button', { name: 'Изменить итоги' }).click();
  await expect(confirmation).toBeChecked();
  await page.getByLabel('Место: Игрок 2', { exact: true }).selectOption('2');
  await expect(confirmation).not.toBeChecked();
  await page.getByLabel('Место: Игрок 4', { exact: true }).selectOption('4');
  await expect(confirmation).toHaveCount(0);
  await page.getByRole('button', { name: 'Подтвердить итоги и сохранить' }).click();
});
