import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GameRepository,
  initialData,
  sameGame,
  startGame,
  statistics,
  transition,
  type AppData,
  type Command,
  type Game,
  type Settings,
} from '@/entities/game';
import { StorageConflict } from '@/shared/lib';

export function useTable() {
  const [data, setData] = useState<AppData>(initialData);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now);
  const repo = useRef(new GameRepository());
  const latest = useRef(data);
  const saved = useRef<AppData | null>(null);
  const revision = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const failure = useRef<Error | null>(null);
  const pending = useRef(0);
  const atomic = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const alerted = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;

    void repo.current
      .read()
      .then((result) => {
        if (!mounted) {
          return;
        }

        latest.current = result.data;
        saved.current = result.revision ? result.data : null;
        revision.current = result.revision;
        setData(result.data);
        setReady(true);
      })
      .catch((e) => {
        if (mounted) {
          setError(e instanceof Error ? e.message : 'Не удалось открыть хранилище.');
        }
      });

    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);

    return () => window.clearInterval(timer);
  }, []);

  const enqueue = useCallback((next: AppData) => {
    pending.current += 1;
    setSaving(true);
    chain.current = chain.current
      .then(async () => {
        if (failure.current) {
          return;
        }

        try {
          revision.current = await repo.current.save(revision.current, next, saved.current);
          saved.current = next;
          setError('');
        } catch (e) {
          failure.current =
            e instanceof Error
              ? e
              : new Error('Запись не выполнена. Данные остаются в открытом окне.');
          setError(failure.current.message);
          setConflict(e instanceof StorageConflict);
        }
      })
      .finally(() => {
        pending.current -= 1;

        if (!pending.current) {
          setSaving(false);
        }
      });
  }, []);
  const commit = useCallback(
    (next: AppData) => {
      latest.current = next;
      setData(next);
      enqueue(next);
    },
    [enqueue],
  );
  const flush = useCallback(async () => {
    await chain.current;

    if (failure.current) {
      throw failure.current;
    }
  }, []);
  const retry = useCallback(() => {
    if (conflict) {
      return;
    }

    failure.current = null;
    enqueue(latest.current);
  }, [conflict, enqueue]);
  const reload = useCallback(() => {
    location.reload();
  }, []);

  useEffect(() => {
    const checkpoint = () => {
      void flush().catch(() => {});
    };

    const foreground = () => {
      checkpoint();

      if (document.visibilityState !== 'visible' || pending.current || atomic.current || !ready) {
        return;
      }

      void repo.current
        .read()
        .then((result) => {
          if (pending.current || atomic.current || result.revision === revision.current) {
            return;
          }

          failure.current = new StorageConflict();
          setConflict(true);
          setError(failure.current.message);
        })
        .catch(() => {});
    };

    window.addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', foreground);
    const timer = window.setInterval(checkpoint, 30_000);

    return () => {
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', foreground);
      window.clearInterval(timer);
    };
  }, [flush, ready]);

  const unlockAudio = useCallback(() => {
    if (!latest.current.settings.sound) {
      return;
    }

    try {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => {});
    } catch {
      /* Audio may not be available. */
    }
  }, []);
  const dispatch = useCallback(
    (command: Command) => {
      if (atomic.current || conflict || !latest.current.current) {
        return;
      }

      unlockAudio();
      const game = transition(latest.current.current, command, Date.now());

      if (game === latest.current.current) {
        return;
      }

      if (game.endedAt !== null) {
        commit({
          ...latest.current,
          current: null,
          archive: [{ game, importedAt: null }, ...latest.current.archive],
        });
      } else {
        commit({ ...latest.current, current: game });
      }

      setNow(Date.now());
    },
    [commit, conflict, unlockAudio],
  );
  const begin = useCallback(() => {
    if (atomic.current || latest.current.current || conflict) {
      return;
    }

    unlockAudio();
    alerted.current.clear();
    commit({ ...latest.current, current: startGame(latest.current.settings, Date.now()) });
  }, [commit, conflict, unlockAudio]);
  const configure = useCallback(
    (settings: Settings) => {
      if (!atomic.current && !conflict) {
        commit({ ...latest.current, settings });
      }
    },
    [commit, conflict],
  );
  const archiveWrite = useCallback(
    async (build: (current: AppData) => AppData) => {
      if (atomic.current || conflict) {
        throw new Error('Сначала дождитесь сохранения или загрузите актуальные данные.');
      }

      await flush();
      atomic.current = true;
      setSaving(true);

      try {
        const next = build(latest.current);

        revision.current = await repo.current.save(revision.current, next, saved.current);
        saved.current = next;
        latest.current = next;
        setData(next);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось сохранить. Повторите действие.');

        if (e instanceof StorageConflict) {
          failure.current = e;
          setConflict(true);
        }

        throw e;
      } finally {
        atomic.current = false;
        setSaving(false);
      }
    },
    [conflict, flush],
  );
  const importGame = useCallback(
    async (game: Game, replace: boolean) => {
      await archiveWrite((current) => {
        if (current.current?.id === game.id) {
          throw new Error('Эта партия сейчас идёт. Импорт не может заменить текущую игру.');
        }

        const existing = current.archive.find((a) => a.game.id === game.id);

        if (existing && sameGame(existing.game, game)) {
          return current;
        }

        if (existing && !replace) {
          throw new Error('Для замены партии требуется подтверждение.');
        }

        return {
          ...current,
          archive: [
            { game, importedAt: Date.now() },
            ...current.archive.filter((a) => a.game.id !== game.id),
          ],
        };
      });
    },
    [archiveWrite],
  );
  const result = useCallback(
    async (id: string, winnerIds: string[] | null) => {
      await archiveWrite((current) => ({
        ...current,
        archive: current.archive.map((entry) =>
          entry.game.id === id
            ? { ...entry, game: { ...entry.game, winnerIds, updatedAt: Date.now() } }
            : entry,
        ),
      }));
    },
    [archiveWrite],
  );
  const finish = useCallback(
    async (winnerIds: string[] | null) => {
      let id = '';

      await archiveWrite((current) => {
        if (!current.current) {
          throw new Error('Партия уже завершена.');
        }

        const game = { ...transition(current.current, { type: 'finish' }, Date.now()), winnerIds };

        id = game.id;

        return {
          ...current,
          current: null,
          archive: [{ game, importedAt: null }, ...current.archive],
        };
      });

      return id;
    },
    [archiveWrite],
  );

  useEffect(() => {
    const game = data.current;

    if (!game || game.paused) {
      return;
    }

    const stats = statistics(game, now);

    for (const player of game.players) {
      const key = `${game.id}:${player.id}`;

      if (stats.players[player.id].remaining > 0) {
        alerted.current.delete(key);
        continue;
      }

      if (alerted.current.has(key)) {
        continue;
      }

      alerted.current.add(key);

      if (data.settings.vibration) {
        navigator.vibrate?.([120, 70, 120]);
      }

      const ctx = audio.current;

      if (!data.settings.sound || !ctx || ctx.state !== 'running') {
        continue;
      }

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.frequency.value = 660;
      gain.gain.value = 0.12;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      oscillator.stop(ctx.currentTime + 0.5);
    }
  }, [data, now]);
  const running = Boolean(data.current && !data.current.paused);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (!running || !('wakeLock' in navigator) || document.visibilityState !== 'visible') {
        return;
      }

      try {
        const next = await navigator.wakeLock.request('screen');

        if (cancelled) {
          await next.release();
        } else {
          lock = next;
        }
      } catch {
        /* The OS can refuse screen wake lock. Timing still works. */
      }
    };

    void request();
    document.addEventListener('visibilitychange', request);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, [running]);

  return {
    data,
    ready,
    error,
    conflict,
    saving,
    now,
    dispatch,
    begin,
    configure,
    importGame,
    result,
    finish,
    flush,
    retry,
    reload,
  };
}
