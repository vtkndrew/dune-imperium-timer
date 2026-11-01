import { StorageConflict } from '@/shared/lib';

import { initialData } from './engine';
import { migrateData } from './records';
import type { AppData } from './types';
import { validData, validLegacyData } from './validation';

export const DATABASE = 'dune-imperium-timer:v1';
export class GameRepository {
  private connection?: Promise<IDBDatabase>;
  private open(): Promise<IDBDatabase> {
    this.connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 2);

      let upgradeError: Error | null = null;

      request.onupgradeneeded = (event) => {
        const db = request.result;

        if (event.oldVersion === 0) {
          db.createObjectStore('app');
          db.createObjectStore('archive', { keyPath: 'game.id' });

          return;
        }

        const tx = request.transaction;

        if (!tx) {
          return;
        }

        const app = tx.objectStore('app');
        const archives = tx.objectStore('archive');
        const meta = app.get('meta');
        const settings = app.get('settings');
        const current = app.get('current');
        const records = archives.getAll();

        records.onsuccess = () => {
          if (
            meta.result === undefined &&
            settings.result === undefined &&
            current.result === undefined &&
            !records.result.length
          ) {
            return;
          }

          try {
            const legacy = {
              settings: settings.result,
              current: current.result,
              archive: records.result,
            };

            if (
              meta.result?.version !== 1 ||
              !Number.isSafeInteger(meta.result.revision) ||
              meta.result.revision < 1 ||
              !validLegacyData(legacy)
            ) {
              throw new Error('Сохранение повреждено. Миграция отменена, данные не удалены.');
            }

            const next = migrateData(legacy);

            if (!validData(next)) {
              throw new Error('Не удалось преобразовать сохранение. Данные не удалены.');
            }

            app.put({ version: 2, revision: meta.result.revision + 1 }, 'meta');

            for (const key of ['settings', 'current', 'profiles', 'drafts'] as const) {
              app.put(next[key], key);
            }

            for (const entry of next.archive) {
              archives.put(entry);
            }
          } catch (error) {
            upgradeError = error instanceof Error ? error : new Error('Миграция не выполнена.');
            tx.abort();
          }
        };
      };

      request.onerror = () => {
        this.connection = undefined;
        reject(upgradeError ?? request.error);
      };

      request.onblocked = () => {
        this.connection = undefined;
        reject(new Error('Закройте другие окна приложения и повторите.'));
      };

      request.onsuccess = () => {
        const db = request.result;

        db.onversionchange = () => {
          db.close();
          this.connection = undefined;
        };

        resolve(db);
      };
    });

    return this.connection;
  }
  async read(): Promise<{ revision: number; data: AppData }> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['app', 'archive']);
      const app = tx.objectStore('app');
      const meta = app.get('meta');
      const settings = app.get('settings');
      const current = app.get('current');
      const profiles = app.get('profiles');
      const drafts = app.get('drafts');
      const archive = tx.objectStore('archive').getAll();

      tx.onabort = () => reject(tx.error);

      tx.onerror = () => {};

      tx.oncomplete = () => {
        if (
          meta.result === undefined &&
          settings.result === undefined &&
          current.result === undefined &&
          profiles.result === undefined &&
          drafts.result === undefined &&
          archive.result.length === 0
        ) {
          resolve({ revision: 0, data: initialData() });

          return;
        }

        const data = {
          settings: settings.result,
          current: current.result,
          archive: archive.result,
          profiles: profiles.result,
          drafts: drafts.result,
        };

        if (
          meta.result?.version !== 2 ||
          !Number.isSafeInteger(meta.result?.revision) ||
          meta.result.revision < 1 ||
          !validData(data)
        ) {
          reject(
            new Error(
              'Сохранение повреждено или создано новой версией. Данные не удалены. Обновите приложение или восстановите экспорт.',
            ),
          );

          return;
        }

        resolve({ revision: meta.result.revision, data });
      };
    });
  }
  async save(revision: number, data: AppData, previous: AppData | null): Promise<number> {
    if (!validData(data)) {
      throw new Error('Не удалось сохранить: проверьте имена, лимиты и данные партии.');
    }

    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['app', 'archive'], 'readwrite');
      const app = tx.objectStore('app');
      const records = tx.objectStore('archive');
      const request = app.get('meta');
      let failure: unknown;

      request.onsuccess = () => {
        try {
          if (request.result !== undefined && request.result.version !== 2) {
            throw new Error('Неизвестная версия сохранения.');
          }

          if ((request.result?.revision ?? 0) !== revision) {
            throw new StorageConflict();
          }

          app.put({ version: 2, revision: revision + 1 }, 'meta');

          if (previous?.profiles !== data.profiles) {
            app.put(data.profiles, 'profiles');
          }

          if (previous?.drafts !== data.drafts) {
            app.put(data.drafts, 'drafts');
          }

          if (previous?.settings !== data.settings) {
            app.put(data.settings, 'settings');
          }

          if (!previous || previous.current !== data.current) {
            app.put(data.current, 'current');
          }

          for (const entry of data.archive) {
            if (previous?.archive.find((a) => a.game.id === entry.game.id) !== entry) {
              records.put(entry);
            }
          }

          for (const entry of previous?.archive ?? []) {
            if (!data.archive.some((a) => a.game.id === entry.game.id)) {
              records.delete(entry.game.id);
            }
          }
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };

      tx.oncomplete = () => resolve(revision + 1);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error('Ошибка записи. Повторите сохранение.'));

      tx.onerror = () => {};
    });
  }
}
