import { expect, type Page } from '@playwright/test';

export async function fillResults(page: Page, count = 4, submit = true) {
  for (let i = 0; i < count; i += 1) {
    await page.getByLabel('Победные очки', { exact: true }).fill(String(10 - i));

    for (const label of [
      'Пряность',
      'Солярии',
      'Вода',
      'Обычные войска в гарнизоне',
      'Влияние: Император',
      'Влияние: Гильдия',
      'Влияние: Бене Гессерит',
      'Влияние: Фримены',
    ]) {
      await page.getByLabel(label, { exact: true }).fill('0');
    }

    for (const label of [
      'Союз с Императором',
      'Союз с Гильдией',
      'Союз с Бене Гессерит',
      'Союз с Фрименами',
      'Мечник',
      'Высший совет',
    ]) {
      await page.getByLabel(label, { exact: true }).selectOption('false');
    }

    await page.getByRole('button', { name: 'Далее →', exact: true }).click();
  }

  await expect(page.getByRole('button', { name: 'Подтвердить места и сохранить' })).toBeEnabled();

  if (submit) {
    await page.getByRole('button', { name: 'Подтвердить места и сохранить' }).click();
    await expect(page.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
  }
}

export async function stopGame(page: Page) {
  await page.getByRole('button', { name: 'Завершить партию', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить и заполнить итоги' }).click();
  await expect(page.getByRole('heading', { name: 'Часы остановлены.' })).toBeVisible();
}
