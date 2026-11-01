import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { fillResults, stopGame } from './helpers';

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
}

async function saved(page: Page) {
  await expect(page.getByText('Сохраняем…', { exact: true })).toHaveCount(0);
}

async function getData(page: Page) {
  return page.evaluate(async () => {
    const { GameRepository } = await import('/src/entities/game/index.ts');

    return (await new GameRepository().read()).data;
  });
}

test('ordinary turns, reveal, combat reopens after action and next round rotates', async ({
  page,
}) => {
  await start(page);

  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'Завершить раскрытие', exact: true }).click();
  }

  await expect(page.getByText('Сражение', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Пас →', exact: true }).click();
  await page.getByRole('button', { name: 'Действие завершено →', exact: true }).click();
  await expect(page.getByText('0 / 4', { exact: true })).toBeVisible();

  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: 'Пас →', exact: true }).click();
  }

  await expect(page.getByRole('timer', { name: 'Общий секундомер' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать следующий раунд' }).click();
  await expect(page.getByRole('timer', { name: 'Время Игрок 2' })).toBeVisible();
  await saved(page);
  const data = await getData(page);

  expect(data.current.round).toBe(2);
  expect(data.current.first).toBe(1);
});

test('reload, background elapsed time, pause and correction', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-30T12:00:00Z') });
  await start(page);
  await page.clock.fastForward(5000);
  await expect(page.getByRole('timer')).toHaveText('29:55');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('timer')).toHaveText('29:55');
  await page.getByRole('button', { name: 'Ⅱ Пауза', exact: true }).click();
  await page.clock.fastForward(60000);
  await expect(page.getByRole('timer')).toHaveText('29:55');
  await page.getByRole('button', { name: '± Время', exact: true }).click();
  await page.getByLabel('Изменить запас на, минут').fill('2');
  await page.getByRole('button', { name: 'Применить поправку' }).click();
  await expect(page.getByRole('timer')).toHaveText('31:55');
  await page.getByRole('button', { name: '▶ Продолжить', exact: true }).click();
  await page.clock.fastForward(2000);
  await expect(page.getByRole('timer')).toHaveText('31:53');
});

test('Ilesa preparations and manual reaction return the right clock', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  await page.getByRole('button', { name: 'Убрать игрока' }).click();
  await page.getByLabel('Герой игрока 1', { exact: true }).selectOption('ilesa');
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await expect(page.getByRole('heading', { name: 'Перед началом раунда' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово →' }).click();
  await page.getByRole('button', { name: 'Следующий ход →' }).click();
  await page.getByRole('button', { name: '◇ Способность' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Игрок 1 Илеса Эказ' }).click();
  await expect(page.getByRole('timer', { name: 'Время Игрок 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово →' }).click();
  await expect(page.getByRole('timer', { name: 'Время Игрок 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Следующий ход →' }).click();
  await expect(page.getByRole('heading', { name: 'Второй ход Илесы' })).toBeVisible();
});

test('export and import preserve a result; duplicate and replacement do not touch active game', async ({
  page,
  browser,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Завершить партию', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить и заполнить итоги' }).click();
  await fillResults(page);
  await expect(page.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
  const downloading = page.waitForEvent('download');

  await page.getByRole('button', { name: '↑ Экспорт JSON' }).click();
  const download = await downloading;
  const path = await download.path();

  if (!path) {
    throw new Error('Download path unavailable');
  }

  const payload = JSON.parse(await readFile(path, 'utf8'));

  expect(payload.game.winnerIds).toEqual([payload.game.players[0].id]);
  expect(payload.settings).toBeUndefined();
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5181' });
  const other = await context.newPage();

  try {
    await start(other);
    await saved(other);
    const currentId = (await getData(other)).current.id;

    await other.getByRole('button', { name: 'История 0' }).click();
    const upload = async (value: unknown) =>
      other.getByLabel('Файл партии JSON').setInputFiles({
        name: 'game.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(value)),
      });

    await upload(payload);
    await other.getByRole('button', { name: 'Добавить в историю', exact: true }).click();
    await expect(other.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
    let data = await getData(other);

    expect(data.archive[0].game).toMatchObject({
      ...payload.game,
      players: payload.game.players.map(({ profileId: _profileId, ...p }: any) => p),
    });
    expect(data.archive[0].game.players.map((p: any) => p.profileId)).toEqual(
      data.current.players.map((p: any) => p.profileId),
    );

    for (const source of payload.game.players) {
      expect(data.profiles.find((p: any) => p.name === source.name).sourceIds).toContain(
        source.profileId,
      );
    }

    expect(data.current.id).toBe(currentId);
    await other.getByRole('button', { name: '← Все партии' }).click();
    await upload(payload);
    await expect(
      other.getByText('Эта партия уже есть в истории. Дубликат не будет создан.'),
    ).toBeVisible();
    await other.getByRole('button', { name: 'Закрыть', exact: true }).click();
    payload.game.winnerIds = [payload.game.players[1].id];
    const [a, b] = payload.game.players.map((p: any) => p.id);

    [payload.game.finals[a].points, payload.game.finals[b].points] = [
      payload.game.finals[b].points,
      payload.game.finals[a].points,
    ];
    [payload.game.rankings[a], payload.game.rankings[b]] = [
      payload.game.rankings[b],
      payload.game.rankings[a],
    ];
    await upload(payload);
    await other.getByRole('button', { name: 'Отмена', exact: true }).click();
    expect((await getData(other)).archive[0].game.winnerIds).toEqual([payload.game.players[0].id]);
    await upload(payload);
    await other.getByRole('button', { name: 'Заменить эту партию' }).click();
    await expect(other.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
    data = await getData(other);
    expect(data.archive).toHaveLength(1);
    expect(data.archive[0].game.winnerIds).toEqual(payload.game.winnerIds);
    expect(data.current.id).toBe(currentId);
  } finally {
    await context.close();
  }
});

test('invalid import leaves archive untouched', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByLabel('Файл партии JSON').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByText('Не удалось прочитать JSON. Файл повреждён.')).toBeVisible();
  expect((await getData(page)).archive).toHaveLength(0);
});

test('failed finalization keeps the stopped draft and can be retried', async ({ page }) => {
  await start(page);
  await stopGame(page);
  await fillResults(page, 4, false);
  await saved(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;

    (window as any).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };

    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'archive') {
        throw new DOMException('Тест: нет места', 'QuotaExceededError');
      }

      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Подтвердить места и сохранить' }).click();
  await expect(page.getByRole('alert')).toContainText('Тест: нет места');
  let data = await getData(page);

  expect(data.archive).toHaveLength(0);
  expect(data.current).toBeNull();
  expect(data.drafts).toHaveLength(1);
  await page.evaluate(() => (window as any).restorePut());
  await page.getByRole('button', { name: 'Подтвердить места и сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
  data = await getData(page);
  expect(data.archive).toHaveLength(1);
  expect(data.drafts).toHaveLength(0);
});

test('stale tab cannot overwrite a newer game', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать партию' })).toBeVisible();
  const other = await context.newPage();

  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Начать партию' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await saved(page);
  const id = (await getData(page)).current.id;

  await other.getByRole('button', { name: 'Начать партию' }).click();
  await expect(other.getByRole('alert')).toContainText('Данные изменены в другом окне');
  expect((await getData(other)).current.id).toBe(id);
});

test('mobile, landscape and desktop layouts; screenshots', async ({ page }, testInfo) => {
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [844, 390],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Начать партию' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`setup-${width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Начать партию' }).click();
  await page.screenshot({ path: testInfo.outputPath('live-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Завершить партию', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('finish-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Остановить и заполнить итоги' }).click();
  await fillResults(page);
  await expect(page.getByRole('heading', { name: 'Партия завершена.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('archive-390.png'), fullPage: true });
});

test('corrupted persisted data is preserved, never silently cleared', async ({ page }) => {
  await start(page);
  await saved(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('dune-imperium-timer:v1');

      r.onsuccess = () => resolve(r.result);
    });

    await new Promise<void>((resolve) => {
      const tx = db.transaction('app', 'readwrite');

      tx.objectStore('app').put({ version: 99, revision: 8 }, 'meta');

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Сохранение повреждено');
  const meta = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('dune-imperium-timer:v1');

      r.onsuccess = () => resolve(r.result);
    });

    return new Promise((resolve) => {
      const request = db.transaction('app').objectStore('app').get('meta');

      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  });

  expect(meta).toEqual({ version: 99, revision: 8 });
});

test('import write failure does not modify in-memory or persisted archive', async ({ page }) => {
  await start(page);
  await saved(page);
  const payload = await page.evaluate(async () => {
    const { GameRepository, transition, exportGame } = await import('/src/entities/game/index.ts');
    const { data } = await new GameRepository().read();
    const game = transition(data.current, { type: 'finish' }, Date.now());

    game.id = crypto.randomUUID();

    return exportGame(game);
  });

  await page.getByRole('button', { name: 'История 0' }).click();
  await page.getByLabel('Файл партии JSON').setInputFiles({
    name: 'new.json',
    mimeType: 'application/json',
    buffer: Buffer.from(payload),
  });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;

    (window as any).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };

    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'archive') {
        throw new DOMException('Тест: импорт не записан', 'QuotaExceededError');
      }

      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Добавить в историю', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Тест: импорт не записан',
  );
  expect((await getData(page)).archive).toHaveLength(0);
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('button', { name: 'История 0' })).toBeVisible();
  await page.evaluate(() => (window as any).restorePut());
});
