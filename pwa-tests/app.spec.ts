import { expect, test } from '@playwright/test';

import { fillResults } from '../e2e/helpers';

const base = '/dune-imperium-timer/';

test('offline shell and consented update preserve local storage', async ({
  page,
  context,
  browserName,
}) => {
  await page.goto(base);
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await page.getByRole('button', { name: 'Следующий ход →' }).click();
  await page.getByRole('button', { name: 'Завершить партию', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить и заполнить итоги' }).click();
  await fillResults(page);
  await expect(page.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
  await page.getByRole('button', { name: 'Новая партия', exact: true }).click();
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await page.getByRole('button', { name: 'Завершить партию', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить и заполнить итоги' }).click();
  await page.getByLabel('Победные очки', { exact: true }).first().fill('7');
  await page.getByRole('button', { name: 'Новая партия', exact: true }).click();
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await page.getByRole('button', { name: 'Ⅱ Пауза' }).click();
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
  const readApp = async () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('dune-imperium-timer:v1');

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      return new Promise<{ current: any; archive: any[]; profiles: any[]; drafts: any[] }>(
        (resolve) => {
          const tx = db.transaction(['app', 'archive']);
          const current = tx.objectStore('app').get('current');
          const archive = tx.objectStore('archive').getAll();
          const profiles = tx.objectStore('app').get('profiles');
          const drafts = tx.objectStore('app').get('drafts');

          tx.oncomplete = () => {
            db.close();
            resolve({
              current: current.result,
              archive: archive.result,
              profiles: profiles.result,
              drafts: drafts.result,
            });
          };
        },
      );
    });
  const before = await readApp();

  expect(before.archive).toHaveLength(1);
  expect(before.profiles).toHaveLength(4);
  expect(before.drafts).toHaveLength(1);
  expect(before.current.paused).toBe(true);
  await page.getByRole('button', { name: 'Приложение', exact: true }).click();
  await expect(page.getByText('Готово к работе без интернета', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  expect(
    await page.evaluate(async () => new URL((await navigator.serviceWorker.ready).scope).pathname),
  ).toBe(base);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('dune-imperium-timer:fixture');

      request.onupgradeneeded = () => request.result.createObjectStore('data');

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('data', 'readwrite');

        tx.objectStore('data').put('synthetic', 'value');

        tx.oncomplete = () => {
          db.close();
          resolve();
        };

        tx.onabort = () => reject(tx.error);
      };

      request.onerror = () => reject(request.error);
    });
    const cache = await caches.open('other-app-fixture');

    await cache.put('/other-app/sentinel', new Response('keep'));
  });
  await context.addCookies([
    { name: 'pwa_test_version', value: 'two', url: 'http://127.0.0.1:4175' },
  ]);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.ready).update();
  });
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('button', { name: 'Позже' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pwa-test-build', 'one');
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('button', { name: 'Обновить и перезапустить' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-pwa-test-build', 'two');
  expect(await readApp()).toEqual(before);

  if (browserName === 'webkit') {
    await context.addCookies([
      { name: 'pwa_test_offline', value: '1', url: 'http://127.0.0.1:4175' },
    ]);
  } else {
    await context.setOffline(true);
  }

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '▶ Продолжить', exact: true }).click();
  await page.getByRole('button', { name: 'Следующий ход →' }).click();
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('timer', { name: 'Время Игрок 2' })).toBeVisible();
  const afterOffline = await readApp();

  expect(afterOffline.current.id).toBe(before.current.id);
  expect(afterOffline.archive).toEqual(before.archive);
  expect(afterOffline.profiles).toEqual(before.profiles);
  expect(afterOffline.drafts).toEqual(before.drafts);
  expect(
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open('dune-imperium-timer:fixture');

        r.onsuccess = () => resolve(r.result);
      });

      return new Promise((resolve) => {
        const r = db.transaction('data').objectStore('data').get('value');

        r.onsuccess = () => {
          db.close();
          resolve(r.result);
        };
      });
    }),
  ).toBe('synthetic');
  expect(
    await page.evaluate(async () =>
      Boolean(await (await caches.open('other-app-fixture')).match('/other-app/sentinel')),
    ),
  ).toBe(true);
});
