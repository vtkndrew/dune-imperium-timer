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
