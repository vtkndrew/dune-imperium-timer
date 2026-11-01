import { useCallback, useState, type MouseEvent } from 'react';

import {
  exportGame,
  formatTime,
  parseGameFile,
  sameGame,
  recordDuration,
  prepareImport,
  type ArchivedGame,
} from '@/entities/game';
import { PwaPanel } from '@/features/pwa';
import {
  GameDetails,
  History,
  LiveGame,
  Setup,
  ResultEditor,
  PlayerStatistics,
  useTable,
} from '@/features/table';
import {
  Button,
  NumberInput,
  useNumberInputValidation,
  ActionGroup,
  Field,
  Checkbox,
  Select,
  Dialog,
} from '@/shared/ui';

import styles from './TablePage.module.css';

type Modal =
  | 'app'
  | 'finish'
  | 'ability'
  | 'adjust'
  | 'delete'
  | 'discard'
  | 'import'
  | 'reload'
  | 'reset'
  | null;

export function TablePage() {
  const table = useTable();
  const [tab, setTab] = useState<'play' | 'history' | 'stats'>('play');
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [modalError, setModalError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<ArchivedGame | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const [adjustPlayer, setAdjustPlayer] = useState('');
  const [adjustMinutes, setAdjustMinutes] = useState(1);
  const adjustmentNumbers = useNumberInputValidation();
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (!busy) {
      setModal(null);
      setModalError('');
    }
  }, [busy]);
  const openApp = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    setModal('app');
    setModalError('');
  }, []);
  const openAbility = useCallback(() => {
    setModal('ability');
    setModalError('');
  }, []);
  const openAdjust = useCallback(() => {
    setAdjustPlayer(table.data.current?.players[0].id ?? '');
    setAdjustMinutes(1);
    setModal('adjust');
    setModalError('');
  }, [table.data]);
  const openFinish = useCallback(() => {
    setModal('finish');
    setModalError('');
  }, []);
  const back = useCallback(() => {
    setSelected(null);
    setDraftId(null);
  }, []);
  const entry = table.data.archive.find((a) => a.game.id === selected);
  const draft = table.data.drafts.find((d) => d.id === draftId);

  const run = useCallback(
    async (task: () => Promise<void>) => {
      if (busy) {
        return;
      }

      setBusy(true);
      setModalError('');
      setMessage('');

      try {
        await task();
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Не удалось сохранить.';

        setMessage(error);
        setModalError(error);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const openResult = useCallback(
    () =>
      void run(async () => {
        if (entry) {
          setDraftId(await table.edit(entry.game.id));
          setSelected(null);
        }
      }),
    [run, entry, table],
  );
  const openManual = useCallback(
    () =>
      void run(async () => {
        setDraftId(await table.edit());
        setSelected(null);
        setTab('history');
      }),
    [run, table],
  );

  const openDelete = useCallback(() => {
    setModal('delete');
    setModalError('');
  }, []);

  const openDiscard = useCallback(() => {
    setModal('discard');
    setModalError('');
  }, []);

  const complete = useCallback(
    () =>
      void run(async () => {
        if (draft) {
          setSelected(await table.completeDraft(draft.id));
          setDraftId(null);
        }
      }),
    [run, draft, table],
  );

  const selectGame = useCallback((id: string) => {
    setTab('history');
    setSelected(id);
    setDraftId(null);
  }, []);

  const selectDraft = useCallback((id: string) => {
    setTab('history');
    setSelected(null);
    setDraftId(id);
  }, []);

  const { flush } = table;
  const download = useCallback(async () => {
    if (!entry) {
      return;
    }

    try {
      await flush();
      const blob = new Blob([exportGame(entry.game)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `dune-${new Date(entry.game.startedAt).toISOString().slice(0, 10)}-${entry.game.id.slice(0, 8)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Не удалось экспортировать партию.');
    }
  }, [entry, flush]);

  const finish = () =>
    run(async () => {
      const id = await table.finish();

      setDraftId(id);
      setSelected(null);
      setTab('history');
      setModal(null);
    });

  const confirmImport = async () => {
    if (!preview) {
      return;
    }

    setBusy(true);
    setModalError('');

    try {
      await table.importGame(preview, true, mapping);
      setSelected(preview.id);
      setDraftId(null);
      setTab('history');
      setModal(null);
      setMessage('Партия добавлена в историю.');
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Импорт не выполнен.');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setModalError('');
    setMessage('');

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Файл больше 5 МБ. Выберите экспорт одной партии.');
      }

      const game = parseGameFile(await file.text());

      if (table.data.current?.id === game.id) {
        throw new Error('Эта партия сейчас идёт. Её нельзя заменить импортом.');
      }

      setMapping({});
      setPreview(game);
      setModal('import');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Не удалось прочитать файл.');
    }
  };

  const mappedPreview = preview ? prepareImport(table.data, preview, mapping).game : null;
  const existing = table.data.archive.find((a) => a.game.id === preview?.id);
  const duplicate = Boolean(existing && mappedPreview && sameGame(existing.game, mappedPreview));
  let saveStatus = table.error ? 'Не сохранено' : 'На этом устройстве';

  if (table.saving) {
    saveStatus = 'Сохраняем…';
  }

  const importLabel = existing ? 'Заменить эту партию' : 'Добавить в историю';
  const title = {
    app: 'Приложение',
    finish: 'Завершить партию',
    ability: 'Чьё личное действие?',
    adjust: 'Поправка времени',
    delete: 'Удалить партию?',
    discard: 'Удалить черновик?',
    import: 'Импорт партии',
    reload: 'Загрузить сохранённые данные',
    reset: 'Сбросить тестовые данные?',
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="38" height="38" alt="" />
          <div>
            <h1>DUNE IMPERIUM</h1>
            <span>Т А Й М Е Р П А Р Т И И</span>
          </div>
        </div>
        <Button onClick={openApp} disabled={!table.ready} aria-label="Приложение">
          ⚙
        </Button>
      </header>
      <nav className={styles.nav} aria-label="Основные разделы">
        <Button
          aria-current={tab === 'play' ? 'page' : undefined}
          onClick={() => {
            setTab('play');
            setMessage('');
          }}
        >
          {table.data.current ? 'За столом' : 'Новая партия'}
        </Button>
        <Button
          aria-current={tab === 'history' ? 'page' : undefined}
          onClick={() => {
            setTab('history');
            setDraftId(null);
            setSelected(null);
            setMessage('');
          }}
        >
          История <span>{table.data.archive.length}</span>
        </Button>
        <Button
          aria-current={tab === 'stats' ? 'page' : undefined}
          onClick={() => {
            setTab('stats');
            setMessage('');
          }}
        >
          Статистика
        </Button>
      </nav>
      {table.error && (
        <div className={styles.error} role="alert">
          <p>{table.error}</p>
          <p>
            {table.ready
              ? 'Несохранённые изменения остаются в этом окне.'
              : 'Сохранённые данные не изменены.'}
          </p>
          {table.outdated && (
            <Button
              onClick={(event) => {
                event.currentTarget.focus();
                setModal('reset');
              }}
            >
              Сбросить тестовые данные
            </Button>
          )}
          {table.conflict ? (
            <Button onClick={() => setModal('reload')}>Загрузить актуальную версию</Button>
          ) : (
            <Button onClick={table.ready ? table.retry : table.reload}>Повторить</Button>
          )}
        </div>
      )}
      {message && (
        <div className={styles.message} role="status">
          {message}
          <Button aria-label="Скрыть сообщение" onClick={() => setMessage('')}>
            ×
          </Button>
        </div>
      )}
      {!table.ready ? (
        !table.error && <p className={styles.loading}>Открываем ваш стол…</p>
      ) : (
        <>
          {tab === 'play' &&
            (table.data.current ? (
              <LiveGame
                game={table.data.current}
                disabled={table.conflict}
                onCommand={table.dispatch}
                onAbility={openAbility}
                onAdjust={openAdjust}
                onFinish={openFinish}
              />
            ) : (
              <Setup
                profiles={table.data.profiles}
                settings={table.data.settings}
                onChange={table.configure}
                onStart={table.begin}
                disabled={table.conflict}
              />
            ))}
          {tab === 'history' && draft && (
            <ResultEditor
              key={draft.id}
              draft={draft}
              profiles={table.data.profiles}
              onChange={table.updateDraft}
              onSave={complete}
              onBack={back}
              onDiscard={openDiscard}
              disabled={busy || table.conflict}
            />
          )}
          {tab === 'history' && !draft && entry && (
            <GameDetails
              game={entry.game}
              imported={entry.importedAt !== null}
              onBack={back}
              onExport={download}
              onResult={openResult}
              onDelete={openDelete}
            />
          )}
          {tab === 'history' && !draft && !entry && (
            <History
              entries={table.data.archive}
              drafts={table.data.drafts}
              onSelect={selectGame}
              onDraft={selectDraft}
              onImport={importFile}
              onManual={openManual}
            />
          )}
          {tab === 'stats' && (
            <PlayerStatistics data={table.data} onSelectGame={selectGame} onRename={table.rename} />
          )}
        </>
      )}
      <footer className={styles.footer}>
        <span>ЛИЧНЫЕ ЧАСЫ · ОБЩИЙ СТОЛ</span>
        <span role="status">{saveStatus}</span>
      </footer>
      {modal && (
        <Dialog title={title[modal]} onClose={close}>
          {modal === 'reset' && (
            <>
              <p>
                Будут удалены настройки, текущая партия, история, профили и черновики этого
                приложения на этом устройстве. Скачанные JSON-файлы и данные других приложений
                сохранятся.
              </p>
              <ActionGroup>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => void run(table.resetOutdated)}
                >
                  Сбросить и начать заново
                </Button>
                <Button disabled={busy} onClick={close}>
                  Отмена
                </Button>
              </ActionGroup>
            </>
          )}
          {modal === 'app' && (
            <>
              <div className={styles.preferences}>
                <Field inline>
                  <Checkbox
                    checked={table.data.settings.sound}
                    onChange={(e) =>
                      table.configure({ ...table.data.settings, sound: e.target.checked })
                    }
                  />{' '}
                  Звук при истечении времени
                </Field>
                <Field inline>
                  <Checkbox
                    checked={table.data.settings.vibration}
                    onChange={(e) =>
                      table.configure({ ...table.data.settings, vibration: e.target.checked })
                    }
                  />{' '}
                  Вибрация, если поддерживается
                </Field>
              </div>
              <p className={styles.hint}>
                Часы продолжают идти при блокировке экрана. Для остановки используйте паузу.
                Приложение удерживает экран включённым, если это разрешает устройство.
              </p>
              <PwaPanel beforeUpdate={table.flush} />
            </>
          )}
          {modal === 'ability' && (
            <>
              <p>
                Личное время выбранного игрока заменит текущие часы. После «Готово» очередь
                вернётся.
              </p>
              <div className={styles.choiceList}>
                {table.data.current?.players.map((p) => (
                  <Button
                    key={p.id}
                    onClick={() => {
                      table.dispatch({ type: 'ability', playerId: p.id });
                      setModal(null);
                    }}
                  >
                    <strong>{p.name}</strong>
                    <small>{p.heroName}</small>
                  </Button>
                ))}
              </div>
            </>
          )}
          {modal === 'adjust' && (
            <>
              <Field className={styles.field}>
                Игрок
                <Select value={adjustPlayer} onChange={(e) => setAdjustPlayer(e.target.value)}>
                  {table.data.current?.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field className={styles.field}>
                Изменить запас на, минут
                <NumberInput
                  aria-label="Изменить запас на, минут"
                  min={-1440}
                  max={1440}
                  required
                  value={adjustMinutes}
                  onValidityChange={adjustmentNumbers.onValidityChange}
                  onValueChange={(value) => {
                    if (value !== undefined) {
                      setAdjustMinutes(value);
                    }
                  }}
                />
              </Field>
              <p className={styles.hint}>
                Положительное число добавляет время, отрицательное убирает. Потраченное время в
                статистике не меняется.
              </p>
              <Button
                variant="primary"
                disabled={
                  adjustmentNumbers.invalid ||
                  !Number.isInteger(adjustMinutes) ||
                  Math.abs(adjustMinutes) > 1440 ||
                  adjustMinutes === 0
                }
                onClick={() => {
                  table.dispatch({
                    type: 'adjust',
                    playerId: adjustPlayer,
                    deltaMs: adjustMinutes * 60_000,
                  });
                  setModal(null);
                }}
              >
                Применить поправку
              </Button>
            </>
          )}
          {modal === 'finish' && (
            <>
              <p>
                Остановить часы и перейти к итогам? Время будет зафиксировано. Черновик можно
                заполнить позже, даже после следующей партии.
              </p>
              <ActionGroup>
                <Button
                  variant="primary"
                  disabled={busy || table.conflict}
                  onClick={() => void finish()}
                >
                  Остановить и заполнить итоги
                </Button>
                <Button disabled={busy} onClick={close}>
                  Отмена
                </Button>
              </ActionGroup>
            </>
          )}
          {(modal === 'delete' || modal === 'discard') && (
            <>
              <p>
                {modal === 'delete'
                  ? 'Партия и черновик её правок будут удалены. Статистика и последующий Elo пересчитаются.'
                  : 'Незаполненные итоги будут удалены. Если это правки существующей партии, прежняя запись останется.'}
              </p>
              <ActionGroup>
                <Button
                  variant="danger"
                  disabled={busy || table.conflict}
                  onClick={() =>
                    void run(async () => {
                      if (modal === 'delete' && entry) {
                        await table.remove(entry.game.id);
                        setSelected(null);
                      } else if (draft) {
                        await table.discardDraft(draft.id);
                        setDraftId(null);
                      }

                      setModal(null);
                    })
                  }
                >
                  Удалить
                </Button>
                <Button disabled={busy} onClick={close}>
                  Отмена
                </Button>
              </ActionGroup>
            </>
          )}
          {modal === 'import' && preview && (
            <>
              <p>
                <strong>{new Date(preview.startedAt).toLocaleString('ru')}</strong>
              </p>
              <p>{preview.players.map((p) => p.name).join(' · ')}</p>
              <p>
                {preview.round} раундов ·{' '}
                {recordDuration(preview) === null
                  ? 'Длительность не указана'
                  : formatTime(recordDuration(preview) as number)}
              </p>
              <fieldset className={styles.preferences}>
                <legend>Привязка игроков</legend>
                {preview.players.map((p) => (
                  <Field key={p.id}>
                    {p.name}
                    <Select
                      aria-label={`Профиль: ${p.name}`}
                      value={mapping[p.id] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [p.id]: e.target.value })}
                    >
                      <option value="">
                        Автоматически:{' '}
                        {mappedPreview?.players.find((candidate) => candidate.id === p.id)?.name}
                      </option>
                      {table.data.profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </fieldset>
              <p className={styles.hint}>Текущая игра и остальные записи не изменятся.</p>
              {duplicate ? (
                <>
                  <p>Эта партия уже есть в истории. Дубликат не будет создан.</p>
                  <Button onClick={close}>Закрыть</Button>
                </>
              ) : (
                <>
                  {existing && (
                    <p role="alert">
                      Партия с таким ID уже есть, но её содержимое отличается. Подтверждение заменит
                      существующую архивную запись.
                    </p>
                  )}
                  <ActionGroup>
                    <Button
                      variant="primary"
                      disabled={busy || table.conflict}
                      onClick={() => void confirmImport()}
                    >
                      {busy ? 'Сохраняем…' : importLabel}
                    </Button>
                    <Button disabled={busy} onClick={close}>
                      Отмена
                    </Button>
                  </ActionGroup>
                </>
              )}
            </>
          )}
          {modal === 'reload' && (
            <>
              <p>
                Загрузится последняя сохранённая версия из другого окна. Несохранённые изменения
                этого окна будут потеряны.
              </p>
              <ActionGroup>
                <Button variant="primary" onClick={table.reload}>
                  Загрузить сохранённую версию
                </Button>
                <Button onClick={close}>Остаться в этом окне</Button>
              </ActionGroup>
            </>
          )}
          {modalError && (
            <div role="alert">
              <p>{modalError}</p>
              {table.ready && table.error && !table.conflict && (
                <Button onClick={table.retry}>Повторить сохранение</Button>
              )}
            </div>
          )}
        </Dialog>
      )}
    </main>
  );
}
