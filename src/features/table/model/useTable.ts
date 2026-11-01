import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GameRepository,
  bindPlayers,
  cleanName,
  colorConflicts,
  nameKey,
  renameProfile,
  manualGame,
  prepareImport,
  resultProblems,
  suggestedRanks,
  initialData,
  sameGame,
  startGame,
  statistics,
  transition,
  OutdatedStorage,
  type AppData,
  type Command,
  type ArchivedGame,
  type ResultDraft,
  type Settings,
} from '@/entities/game';
import { StorageConflict } from '@/shared/lib';

export function useTable() {
  const [data, setData] = useState<AppData>(initialData);
  const [ready, setReady] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    let mounted = true;

    void repo.current
      .read()
      .then((result) => {
        if (!mounted) {
          return;
        }

        const next = result.data;

        latest.current = next;
        saved.current = result.revision ? result.data : null;
        revision.current = result.revision;
        setData(next);

        setReady(true);
      })
      .catch((e) => {
        if (mounted) {
          setError(e instanceof Error ? e.message : 'Не удалось открыть хранилище.');
          setOutdated(e instanceof OutdatedStorage);
        }
      });

    return () => {
      mounted = false;
    };
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
  const resetOutdated = useCallback(async () => {
    if (!outdated || ready) {
      return;
    }

    await repo.current.resetOutdated();
    location.reload();
  }, [outdated, ready]);
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
      if (command.type === 'finish' || atomic.current || conflict || !latest.current.current) {
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
    },
    [commit, conflict, unlockAudio],
  );
  const begin = useCallback(() => {
    if (atomic.current || latest.current.current || conflict) {
      return;
    }

    if (Object.keys(colorConflicts(latest.current.settings.players)).length) {
      return;
    }

    const bound = bindPlayers(latest.current.profiles, latest.current.settings.players);

    if (new Set(bound.players.map((p) => p.profileId)).size !== bound.players.length) {
      return;
    }

    unlockAudio();
    alerted.current.clear();
    const settings = { ...latest.current.settings, players: bound.players };

    commit({
      ...latest.current,
      profiles: bound.profiles,
      settings,
      current: startGame(settings, Date.now()),
    });
  }, [commit, conflict, unlockAudio]);
  const configure = useCallback(
    (settings: Settings) => {
      if (atomic.current || conflict) {
        return;
      }

      if (new Set(settings.players.map((p) => nameKey(p.name))).size !== settings.players.length) {
        return;
      }

      const bound = bindPlayers(latest.current.profiles, settings.players);

      commit({
        ...latest.current,
        profiles: bound.profiles,
        settings: { ...settings, players: bound.players },
      });
    },
    [commit, conflict],
  );
  const archiveWrite = useCallback(
    async (build: (current: AppData) => AppData) => {
      if (atomic.current || conflict) {
        throw new Error('Сначала дождитесь сохранения или загрузите актуальные данные.');
      }

      atomic.current = true;
      setSaving(true);

      try {
        await flush();
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
    async (source: ArchivedGame, replace: boolean, mapping: Record<string, string> = {}) => {
      await archiveWrite((current) => {
        if (
          current.current?.id === source.id ||
          current.drafts.some((d) => d.game.id === source.id)
        ) {
          throw new Error(
            'Для этой партии есть текущая игра или черновик. Сначала завершите или удалите черновик.',
          );
        }

        const bound = prepareImport(current, source, mapping);

        if (
          new Set(bound.game.players.map((p) => p.profileId)).size !== bound.game.players.length
        ) {
          throw new Error(
            'Один профиль нельзя использовать для двух участников партии. Исправьте привязку.',
          );
        }

        const existing = current.archive.find((a) => a.game.id === source.id);

        if (existing && sameGame(existing.game, bound.game)) {
          return current;
        }

        if (existing && !replace) {
          throw new Error('Для замены партии требуется подтверждение.');
        }

        return {
          ...current,
          profiles: bound.profiles,
          archive: [
            { game: bound.game, importedAt: Date.now() },
            ...current.archive.filter((a) => a.game.id !== source.id),
          ],
        };
      });
    },
    [archiveWrite],
  );
  const rename = useCallback(
    async (id: string, name: string) => {
      await archiveWrite((current) => renameProfile(current, id, cleanName(name)));
    },
    [archiveWrite],
  );
  const remove = useCallback(
    async (id: string) => {
      await archiveWrite((current) => ({
        ...current,
        archive: current.archive.filter((e) => e.game.id !== id),
        drafts: current.drafts.filter((d) => d.game.id !== id),
      }));
    },
    [archiveWrite],
  );
  const discardDraft = useCallback(
    async (id: string) => {
      await archiveWrite((current) => ({
        ...current,
        drafts: current.drafts.filter((d) => d.id !== id),
      }));
    },
    [archiveWrite],
  );
  const edit = useCallback(
    async (id?: string) => {
      let draftId = '';

      await archiveWrite((current) => {
        const existing = current.drafts.find((d) => d.editingId === id);

        if (existing) {
          draftId = existing.id;

          return current;
        }

        const entry = current.archive.find((e) => e.game.id === id);
        const bound = bindPlayers(current.profiles, current.settings.players);
        const game = entry ? structuredClone(entry.game) : manualGame(bound.players);

        game.resultsConfirmed = false;
        const draft = {
          id: crypto.randomUUID(),
          game,
          editingId: entry?.game.id ?? null,
          importedAt: entry?.importedAt ?? null,
        };

        draftId = draft.id;

        return { ...current, profiles: bound.profiles, drafts: [...current.drafts, draft] };
      });

      return draftId;
    },
    [archiveWrite],
  );
  const updateDraft = useCallback(
    (draft: ResultDraft) => {
      if (atomic.current || conflict || !latest.current.drafts.some((d) => d.id === draft.id)) {
        return;
      }

      const bound = bindPlayers(latest.current.profiles, draft.game.players);
      const next = {
        ...draft,
        game: {
          ...draft.game,
          players: bound.players,
          resultsConfirmed: false,
          updatedAt: Date.now(),
        },
      };

      commit({
        ...latest.current,
        profiles: bound.profiles,
        drafts: latest.current.drafts.map((d) => (d.id === draft.id ? next : d)),
      });
    },
    [commit, conflict],
  );
  const completeDraft = useCallback(
    async (id: string) => {
      let gameId = '';

      await archiveWrite((current) => {
        const draft = current.drafts.find((d) => d.id === id);

        if (!draft) {
          throw new Error('Черновик не найден.');
        }

        const game = {
          ...draft.game,
          rankings: { ...suggestedRanks(draft.game).ranks, ...draft.game.rankings },
        };
        const problems = resultProblems(game);

        if (problems.length) {
          throw new Error(problems[0]);
        }

        game.winnerIds = game.players.filter((p) => game.rankings[p.id] === 1).map((p) => p.id);
        game.resultsConfirmed = true;
        game.updatedAt = Date.now();
        gameId = game.id;

        return {
          ...current,
          drafts: current.drafts.filter((d) => d.id !== id),
          archive: [
            { game, importedAt: draft.importedAt },
            ...current.archive.filter((e) => e.game.id !== game.id),
          ],
        };
      });

      return gameId;
    },
    [archiveWrite],
  );
  const finish = useCallback(async () => {
    const current = latest.current;

    if (atomic.current || conflict || !current.current) {
      throw new Error('Партия уже остановлена или сохранение ещё не завершено.');
    }

    const game = transition(current.current, { type: 'finish' }, Date.now());
    const id = crypto.randomUUID();

    // Freeze the clocks immediately. A failed write keeps this exact draft available for retry.
    commit({
      ...current,
      current: null,
      drafts: [...current.drafts, { id, game, editingId: null, importedAt: null }],
    });

    return id;
  }, [commit, conflict]);

  useEffect(() => {
    const game = data.current;

    if (!game || game.paused) {
      return;
    }

    const checkExpiry = () => {
      const stats = statistics(game, Date.now());

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
    };

    checkExpiry();
    const timer = window.setInterval(checkExpiry, 200);

    document.addEventListener('visibilitychange', checkExpiry);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [data]);
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
    outdated,
    resetOutdated,
    error,
    conflict,
    saving,
    dispatch,
    begin,
    configure,
    importGame,
    rename,
    remove,
    edit,
    updateDraft,
    completeDraft,
    discardDraft,
    finish,
    flush,
    retry,
    reload,
  };
}
