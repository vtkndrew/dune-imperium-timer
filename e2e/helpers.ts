import { expect, type Page } from '@playwright/test';

export async function fillResults(page: Page, count = 4, submit = true) {
  for (let i = 0; i < count; i += 1) {
    await page
      .getByLabel('Победные очки', { exact: true })
      .nth(i)
      .fill(String(10 - i));
  }

  await expect(page.getByRole('button', { name: 'Подтвердить итоги и сохранить' })).toBeEnabled();

  if (submit) {
    await page.getByRole('button', { name: 'Подтвердить итоги и сохранить' }).click();
    await expect(page.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
  }
}

export async function stopGame(page: Page) {
  await page.getByRole('button', { name: 'Завершить партию', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить и заполнить итоги' }).click();
  await expect(page.getByRole('heading', { name: 'Часы остановлены.' })).toBeVisible();
}
