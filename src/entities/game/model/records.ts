import { makePlayer, statistics } from './engine';
import type { AppData, ArchivedGame, Expansion, MetricKey, Player, Profile } from './types';

export const EXPANSIONS: { id: Expansion; name: string }[] = [
  { id: 'ix', name: 'Икс' },
  { id: 'immortality', name: 'Бессмертие' },
  { id: 'bloodlines', name: 'Кровные узы' },
];
export const METRICS: {
  key: MetricKey;
  label: string;
  boolean?: boolean;
  expansion?: Expansion;
  max?: number;
}[] = [
  { key: 'points', label: 'Победные очки' },
  { key: 'spice', label: 'Пряность' },
  { key: 'solari', label: 'Солярии' },
  { key: 'water', label: 'Вода' },
  { key: 'troops', label: 'Обычные войска в гарнизоне' },
  { key: 'emperor', label: 'Влияние: Император', max: 6 },
  { key: 'guild', label: 'Влияние: Гильдия', max: 6 },
  { key: 'bene', label: 'Влияние: Бене Гессерит', max: 6 },
  { key: 'fremen', label: 'Влияние: Фримены', max: 6 },
  { key: 'emperorAlliance', label: 'Союз с Императором', boolean: true },
  { key: 'guildAlliance', label: 'Союз с Гильдией', boolean: true },
  { key: 'beneAlliance', label: 'Союз с Бене Гессерит', boolean: true },
  { key: 'fremenAlliance', label: 'Союз с Фрименами', boolean: true },
  { key: 'swordmaster', label: 'Мечник', boolean: true },
  { key: 'council', label: 'Высший совет', boolean: true },
  { key: 'dreadnoughts', label: 'Приобретённые дредноуты', expansion: 'ix', max: 2 },
  { key: 'technologies', label: 'Оставшиеся технологии', expansion: 'ix' },
  { key: 'chaumurky', label: 'Технология Chaumurky', boolean: true, expansion: 'ix' },
  { key: 'specimens', label: 'Оставшиеся образцы', expansion: 'immortality' },
  { key: 'research', label: 'Этап исследования (столбец)', expansion: 'immortality' },
  { key: 'tleilaxu', label: 'Положение на шкале тлейлаксу', expansion: 'immortality' },
  { key: 'commanders', label: 'Приобретённые командиры', expansion: 'bloodlines' },
  { key: 'garrisonCommanders', label: 'Командиры в гарнизоне', expansion: 'bloodlines' },
];
export const applicableMetrics = (game: { expansions?: Expansion[] }) =>
  METRICS.filter((m) => !m.expansion || game.expansions?.includes(m.expansion));
export const cleanName = (name: string) => name.trim().replace(/\s+/gu, ' ');
export const nameKey = (name: string) => cleanName(name).toLocaleLowerCase('ru');
export const isManual = (game: ArchivedGame): game is Extract<ArchivedGame, { kind: 'manual' }> =>
  'kind' in game && game.kind === 'manual';

/** Participant IDs identify seats; profile IDs identify people. */
export function bindPlayers(profiles: Profile[], players: Player[]) {
  const next = structuredClone(profiles);
  const bound = players.map((player) => {
    let profile = player.profileId
      ? next.find(
          (p) => p.id === player.profileId || p.sourceIds?.includes(player.profileId as string),
        )
      : undefined;

    profile ??= next.find((p) => nameKey(p.name) === nameKey(player.name));

    if (!profile) {
      profile = {
        id: player.profileId ?? crypto.randomUUID(),
        name: cleanName(player.name),
      };
      next.push(profile);
    } else if (player.profileId && profile.id !== player.profileId) {
      profile.sourceIds = [...new Set([...(profile.sourceIds ?? []), player.profileId])];
    }

    return { ...player, profileId: profile.id, name: profile.name };
  });

  return { profiles: next, players: bound };
}

export function renameProfile(data: AppData, id: string, name: string): AppData {
  const normalized = cleanName(name);

  if (
    !normalized ||
    normalized.length > 60 ||
    data.profiles.some((p) => p.id !== id && nameKey(p.name) === nameKey(normalized))
  ) {
    throw new Error('Укажите уникальное имя длиной от 1 до 60 символов.');
  }

  const players = (items: Player[]) =>
    items.map((p) => (p.profileId === id ? { ...p, name: normalized } : p));

  const game = <T extends ArchivedGame>(value: T): T => {
    const next = { ...value, players: players(value.players) };

    if (!isManual(next) && next.undo) {
      next.undo = { ...next.undo, players: next.players };
    }

    return next;
  };

  return {
    ...data,
    profiles: data.profiles.map((p) => (p.id === id ? { ...p, name: normalized } : p)),
    settings: { ...data.settings, players: players(data.settings.players) },
    current: data.current ? game(data.current) : null,
    archive: data.archive.map((e) => ({ ...e, game: game(e.game) })),
    drafts: data.drafts.map((d) => ({ ...d, game: game(d.game) })),
  };
}

export function manualGame(players: Player[], now = Date.now()): ArchivedGame {
  return {
    kind: 'manual',
    id: crypto.randomUUID(),
    startedAt: now,
    endedAt: now,
    updatedAt: now,
    players: structuredClone(players.length >= 2 ? players : [makePlayer(0), makePlayer(1)]),
    round: 1,
    winnerIds: null,
    expansions: [],
    finals: {},
    rated: true,
    timing: { kind: 'none', duration: null, players: {} },
  };
}

const validPoints = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000;

export function compareFinish(game: ArchivedGame, a: string, b: string) {
  const first = game.finals?.[a]?.points;
  const second = game.finals?.[b]?.points;

  if (!validPoints(first) || !validPoints(second)) {
    return { order: 0, reason: 'Укажите ПО всех игроков' };
  }

  return {
    order: second - first,
    reason: first === second ? 'Равные ПО — подтвердите места' : 'Победные очки',
  };
}

export function suggestedRanks(game: ArchivedGame) {
  const ready = game.players.every((p) => validPoints(game.finals?.[p.id]?.points));
  const ranks: Record<string, number> = {};
  const unresolved: string[][] = [];

  if (!ready) {
    return { ranks, unresolved, sorted: [...game.players], ready };
  }

  const sorted = [...game.players].sort((a, b) => compareFinish(game, a.id, b.id).order);

  for (let index = 0; index < sorted.length;) {
    let end = index + 1;

    while (
      end < sorted.length &&
      compareFinish(game, sorted[index].id, sorted[end].id).order === 0
    ) {
      end += 1;
    }

    if (end - index > 1) {
      unresolved.push(sorted.slice(index, end).map((p) => p.id));
    } else {
      ranks[sorted[index].id] = index + 1;
    }

    index = end;
  }

  return { ranks, unresolved, sorted, ready };
}

// Keep unaffected choices, but never reuse places after their group or positions changed.
export function changeFinalValue(
  game: ArchivedGame,
  playerId: string,
  key: MetricKey,
  value: number | boolean | undefined,
): ArchivedGame {
  const values = { ...game.finals?.[playerId] };

  if (values[key] === value) {
    return game;
  }

  if (value === undefined) {
    delete values[key];
  } else {
    values[key] = value;
  }

  const next = { ...game, finals: { ...game.finals, [playerId]: values } };

  if (key !== 'points') {
    return next;
  }

  const before = suggestedRanks(game);
  const after = suggestedRanks(next);
  const rankings: Record<string, number> = {};

  if (before.ready && after.ready) {
    const signature = (
      record: ArchivedGame,
      proposal: ReturnType<typeof suggestedRanks>,
      id: string,
    ) => {
      const group = proposal.unresolved.find((g) => g.includes(id)) ?? [id];

      return JSON.stringify([
        record.finals?.[id]?.points,
        group,
        proposal.sorted.findIndex((p) => p.id === group[0]),
      ]);
    };

    for (const p of game.players) {
      if (
        game.rankings?.[p.id] !== undefined &&
        signature(game, before, p.id) === signature(next, after, p.id)
      ) {
        rankings[p.id] = game.rankings[p.id];
      }
    }
  }

  return { ...next, rankings, sharedPlacesConfirmed: false };
}

export function additionalResultProblems(game: ArchivedGame): string[] {
  const errors: string[] = [];

  for (const player of game.players) {
    const values = game.finals?.[player.id] ?? {};

    for (const field of applicableMetrics(game).filter((field) => field.key !== 'points')) {
      const value = values[field.key];

      if (value === undefined) {
        continue;
      }

      if (
        field.boolean
          ? typeof value !== 'boolean'
          : typeof value !== 'number' ||
            !Number.isSafeInteger(value) ||
            value < 0 ||
            value > (field.max ?? 1000000)
      ) {
        errors.push(
          `${player.name}: ${field.label} — укажите ${field.boolean ? 'да или нет' : 'целое неотрицательное значение'}.`,
        );
      }
    }

    if (
      values.chaumurky === true &&
      typeof values.technologies === 'number' &&
      values.technologies === 0
    ) {
      errors.push(`${player.name}: Chaumurky входит в число технологий.`);
    }

    if (
      typeof values.garrisonCommanders === 'number' &&
      typeof values.commanders === 'number' &&
      values.garrisonCommanders > values.commanders
    ) {
      errors.push(`${player.name}: в гарнизоне больше командиров, чем приобретено.`);
    }
  }

  for (const key of [
    'emperorAlliance',
    'guildAlliance',
    'beneAlliance',
    'fremenAlliance',
    'chaumurky',
  ] as MetricKey[]) {
    if (game.players.filter((p) => game.finals?.[p.id]?.[key] === true).length > 1) {
      errors.push(`Несколько владельцев: ${METRICS.find((m) => m.key === key)?.label}.`);
    }
  }

  return errors;
}

export function requiredResultProblems(game: ArchivedGame, includeRanks = true): string[] {
  const errors: string[] = [];

  if (
    new Set(game.players.map((p) => p.profileId)).size !== game.players.length ||
    game.players.some((p) => !p.profileId)
  ) {
    errors.push('Выберите разных игроков для всех мест.');
  }

  for (const player of game.players) {
    const values = game.finals?.[player.id] ?? {};

    if (!validPoints(values.points)) {
      errors.push(`${player.name}: укажите победные очки — целое число от 0 до 1000000.`);
    }

    if (isManual(game) && game.timing.kind === 'summary') {
      const time = game.timing.players[player.id];

      if (!time || time.total === null || !Number.isSafeInteger(time.total) || time.total < 0) {
        errors.push(`${player.name}: укажите личное время.`);
      }

      if (
        time &&
        [time.turns, time.combat, time.hero].some((v) => v !== undefined) &&
        (![time.turns, time.combat, time.hero].every(
          (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
        ) ||
          (time.turns ?? 0) + (time.combat ?? 0) + (time.hero ?? 0) !== time.total)
      ) {
        errors.push(
          `${player.name}: заполните три категории времени; их сумма должна совпадать с общим расходом.`,
        );
      }
    }
  }

  if (!includeRanks) {
    return errors;
  }

  const ranks = game.rankings ?? {};

  if (
    !game.players.every(
      (p) =>
        Number.isInteger(ranks[p.id]) && ranks[p.id] >= 1 && ranks[p.id] <= game.players.length,
    ) ||
    !Object.values(ranks).includes(1)
  ) {
    errors.push('Укажите итоговое место каждого участника, начиная с первого.');
  }

  for (let i = 0; i < game.players.length; i += 1) {
    for (let j = i + 1; j < game.players.length; j += 1) {
      const a = game.players[i].id;
      const b = game.players[j].id;
      const comparison = compareFinish(game, a, b);

      if (comparison.order && Math.sign(ranks[a] - ranks[b]) !== Math.sign(comparison.order)) {
        errors.push(`Места противоречат критерию «${comparison.reason}».`);
      }

      if (ranks[a] === ranks[b] && !game.sharedPlacesConfirmed) {
        errors.push('Подтвердите совместное место явно.');
      }
    }
  }

  return [...new Set(errors)];
}

export function resultProblems(game: ArchivedGame, includeRanks = true): string[] {
  return [
    ...new Set([...requiredResultProblems(game, includeRanks), ...additionalResultProblems(game)]),
  ];
}

export function recordTime(game: ArchivedGame, playerId: string): number | null {
  if (!isManual(game)) {
    return statistics(game).players[playerId].total;
  }

  return game.timing.kind === 'none' ? null : (game.timing.players[playerId]?.total ?? null);
}

export function recordDuration(game: ArchivedGame): number | null {
  return isManual(game) ? game.timing.duration : statistics(game).total;
}

export function eloHistory(entries: AppData['archive'], profiles: Profile[]) {
  const ratings: Record<string, number> = Object.fromEntries(profiles.map((p) => [p.id, 1000]));
  const history: Record<string, { gameId: string; at: number; rating: number; delta: number }[]> =
    Object.fromEntries(profiles.map((p) => [p.id, []]));
  const ordered = [...entries].sort(
    (a, b) => a.game.startedAt - b.game.startedAt || a.game.id.localeCompare(b.game.id),
  );

  for (const { game } of ordered) {
    if (!game.resultsConfirmed || game.rated === false || requiredResultProblems(game).length) {
      continue;
    }

    const changes: Record<string, number> = {};

    for (const player of game.players) {
      const id = player.profileId as string;
      const rating = ratings[id] ?? 1000;
      let delta = 0;

      for (const opponent of game.players.filter((p) => p.id !== player.id)) {
        const comparison = Math.sign(
          (game.rankings?.[opponent.id] ?? 0) - (game.rankings?.[player.id] ?? 0),
        );
        const score = (comparison + 1) / 2;
        const expected =
          1 / (1 + 10 ** (((ratings[opponent.profileId as string] ?? 1000) - rating) / 400));

        delta += score - expected;
      }

      changes[id] = (32 * delta) / (game.players.length - 1);
    }

    for (const [id, delta] of Object.entries(changes)) {
      ratings[id] = (ratings[id] ?? 1000) + delta;
      history[id] ??= [];
      history[id].push({ gameId: game.id, at: game.startedAt, rating: ratings[id], delta });
    }
  }

  return { ratings, history };
}

export function playerSummary(entries: AppData['archive'], profileId: string, heroId?: string) {
  const records = entries.flatMap(({ game }) =>
    game.players
      .filter((p) => p.profileId === profileId && (!heroId || p.heroId === heroId))
      .map((player) => ({ game, player })),
  );

  const average = (values: (number | null | undefined)[]) => {
    const known = values.filter((v): v is number => typeof v === 'number');

    return {
      count: known.length,
      value: known.length ? known.reduce((a, b) => a + b, 0) / known.length : null,
    };
  };

  const wins = records.filter(({ game, player }) => game.winnerIds?.includes(player.id)).length;
  const knownResults = records.filter(({ game }) => game.winnerIds !== null).length;

  return {
    records,
    games: records.length,
    wins,
    knownResults,
    winRate: knownResults ? wins / knownResults : null,
    points: average(
      records.map(({ game, player }) => {
        const v = game.finals?.[player.id]?.points;

        return typeof v === 'number' ? v : null;
      }),
    ),
    time: average(records.map(({ game, player }) => recordTime(game, player.id))),
    metrics: Object.fromEntries(
      METRICS.map((field) => [
        field.key,
        average(
          records.map(({ game, player }) => {
            if (field.expansion && !game.expansions?.includes(field.expansion)) {
              return null;
            }

            const value = game.finals?.[player.id]?.[field.key];

            return value === undefined ? null : Number(value);
          }),
        ),
      ]),
    ),
  };
}

export function prepareImport(
  data: AppData,
  source: ArchivedGame,
  mapping: Record<string, string> = {},
) {
  const overridden = source.players.map((p) => {
    const profile = data.profiles.find((candidate) => candidate.id === mapping[p.id]);

    return profile ? { ...p, profileId: profile.id, name: profile.name } : p;
  });
  const bound = bindPlayers(data.profiles, overridden);

  for (let i = 0; i < source.players.length; i += 1) {
    const sourceId = source.players[i].profileId;
    const target = bound.profiles.find((p) => p.id === bound.players[i].profileId);

    if (
      sourceId &&
      target &&
      !bound.profiles.some((p) => p.id === sourceId || p.sourceIds?.includes(sourceId))
    ) {
      target.sourceIds = [...(target.sourceIds ?? []), sourceId];
    }
  }

  return { profiles: bound.profiles, game: { ...source, players: bound.players } as ArchivedGame };
}
