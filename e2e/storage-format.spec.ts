import { expect, test, type Page } from '@playwright/test';

async function seedOutdated(page: Page, version = 1, metaVersion = 1) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Приложение', exact: true })).toBeEnabled();
  await page.evaluate(
    async ({ version, metaVersion }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('dune-imperium-timer:v1');

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('dune-imperium-timer:v1', version);

        request.onupgradeneeded = () => {
          request.result.createObjectStore('app');
          request.result.createObjectStore('archive', { keyPath: 'game.id' });
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['app', 'archive'], 'readwrite');

        tx.objectStore('app').put({ version: metaVersion, revision: 7 }, 'meta');
        tx.objectStore('app').put({ fixture: 'settings preserved until consent' }, 'settings');
        tx.objectStore('archive').put({ game: { id: 'old-game', marker: 'keep' } });

        tx.oncomplete = () => {
          db.close();
          resolve();
        };

        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      });
      localStorage.setItem('other-app-fixture', 'keep');
      const other = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('other-app-fixture');

        request.onupgradeneeded = () => request.result.createObjectStore('data');
        request.onsuccess = () => resolve(request.result);
      });

      await new Promise<void>((resolve) => {
        const tx = other.transaction('data', 'readwrite');

        tx.objectStore('data').put('keep', 'value');

        tx.oncomplete = () => {
          other.close();
          resolve();
        };
      });
    },
    { version, metaVersion },
  );
  await page.reload();
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('dune-imperium-timer:v1');

      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['app', 'archive']);
      const app = tx.objectStore('app').getAll();
      const archive = tx.objectStore('archive').getAll();

      tx.oncomplete = () => {
        const result = { version: db.version, app: app.result, archive: archive.result };

        db.close();
        resolve(result);
      };

      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    });
  });
}

for (const version of [1, 2]) {
  test(`outdated database ${version} is preserved until explicit reset, and cancellation keeps it intact`, async ({
    page,
  }, info) => {
    await seedOutdated(page, version);
    await expect(page.getByRole('alert')).toContainText('устаревший формат');
    const before = await snapshot(page);

    await page.getByRole('button', { name: 'Сбросить тестовые данные', exact: true }).click();

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`reset-${width}.png`) });
    }

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Сбросить тестовые данные', exact: true }),
    ).toBeFocused();
    expect(await snapshot(page)).toEqual(before);
    await page.reload();
    expect(await snapshot(page)).toEqual(before);
    await page.getByRole('button', { name: 'Сбросить тестовые данные', exact: true }).click();
    await page.getByRole('button', { name: 'Сбросить и начать заново', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Начать партию' })).toBeVisible();
    const stored = await page.evaluate(async () => {
      const { GameRepository } = await import('/src/entities/game/index.ts');

      return (await new GameRepository().read()).data;
    });

    expect(stored.archive).toEqual([]);
    expect(stored.profiles).toEqual([]);
    expect(stored.drafts).toEqual([]);
    expect(stored.current).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('other-app-fixture'))).toBe('keep');
    expect(
      await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open('other-app-fixture');

          request.onsuccess = () => resolve(request.result);
        });

        return new Promise((resolve) => {
          const request = db.transaction('data').objectStore('data').get('value');

          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
        });
      }),
    ).toBe('keep');
    await page.getByRole('button', { name: 'Начать партию' }).click();
    await expect(page.getByRole('button', { name: 'Следующий ход →' })).toBeVisible();
  });
}

test('failed and blocked resets cannot delete data later; explicit retry succeeds', async ({
  page,
}) => {
  await seedOutdated(page);
  const before = await snapshot(page);

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.clear;

    (window as any).restoreClear = () => {
      IDBObjectStore.prototype.clear = original;
    };

    IDBObjectStore.prototype.clear = function () {
      throw new DOMException('Тест сброса: отказ записи', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Сбросить тестовые данные', exact: true }).click();
  await page.getByRole('button', { name: 'Сбросить и начать заново', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Тест сброса: отказ записи',
  );
  expect(await snapshot(page)).toEqual(before);
  await page.evaluate(async () => {
    (window as any).restoreClear();
    (window as any).blocker = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('dune-imperium-timer:v1');

      r.onsuccess = () => resolve(r.result);
    });
  });
  await page.getByRole('button', { name: 'Сбросить и начать заново', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Закройте другие окна');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.evaluate(() => (window as any).blocker.close());
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Сбросить тестовые данные', exact: true }).click();
  await page.getByRole('button', { name: 'Сбросить и начать заново', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать партию' })).toBeVisible();
});

test('current and newer schemas cannot be erased through the outdated reset operation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
  const before = await snapshot(page);

  expect(
    await page.evaluate(async () => {
      const { GameRepository } = await import('/src/entities/game/index.ts');

      try {
        await new GameRepository().resetOutdated();

        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(await snapshot(page)).toEqual(before);
  await seedOutdated(page, 2, 3);
  await expect(page.getByRole('alert')).toContainText('новой версией');
  await expect(
    page.getByRole('button', { name: 'Сбросить тестовые данные', exact: true }),
  ).toHaveCount(0);
});

test('JSON v1 is rejected without changing current game, profiles or archive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
  const before = await snapshot(page);
  const contents = await page.evaluate(async () => {
    const { GameRepository, transition } = await import('/src/entities/game/index.ts');
    const { data } = await new GameRepository().read();

    return JSON.stringify({
      app: 'dune-imperium-timer',
      formatVersion: 1,
      game: transition(data.current, { type: 'finish' }, Date.now()),
    });
  });

  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByLabel('Файл партии JSON').setInputFiles({
    name: 'old.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
  await expect(page.getByRole('status').filter({ hasText: 'JSON v2' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
});
