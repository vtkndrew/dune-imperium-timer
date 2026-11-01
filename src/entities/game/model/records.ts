import { makePlayer, statistics, upgradeDefaultColors } from './engine';
import type {
  AppData,
  ArchivedGame,
  Expansion,
  FinalValues,
  MetricKey,
  Player,
  Profile,
} from './types';

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

/** IDs belong to people only in v2; legacy seat IDs are deliberately ignored. */
export function bindPlayers(profiles: Profile[], players: Player[], legacy = false) {
  const next = structuredClone(profiles);
  const bound = players.map((player) => {
    let profile =
      !legacy && player.profileId
        ? next.find(
            (p) => p.id === player.profileId || p.sourceIds?.includes(player.profileId as string),
          )
        : undefined;

    profile ??= next.find((p) => nameKey(p.name) === nameKey(player.name));

    if (!profile) {
      profile = {
        id: legacy || !player.profileId ? crypto.randomUUID() : player.profileId,
        name: cleanName(player.name),
      };
      next.push(profile);
    } else if (!legacy && player.profileId && profile.id !== player.profileId) {
      profile.sourceIds = [...new Set([...(profile.sourceIds ?? []), player.profileId])];
    }

    return { ...player, profileId: profile.id, name: profile.name };
  });

  return { profiles: next, players: bound };
}

export function migrateData(legacy: Pick<AppData, 'settings' | 'current' | 'archive'>): AppData {
  let profiles: Profile[] = [];

  const bind = (players: Player[]) => {
    const result = bindPlayers(profiles, players, true);

    profiles = result.profiles;

    return result.players;
  };

  const settings = {
    ...upgradeDefaultColors(legacy.settings),
    players: bind(upgradeDefaultColors(legacy.settings).players),
  };
  const archive = legacy.archive.map((entry) => ({
    ...entry,
    game: { ...entry.game, players: bind(entry.game.players) },
  }));
  let current = legacy.current
    ? { ...legacy.current, players: bind(legacy.current.players) }
    : null;

  if (current?.undo) {
    current = { ...current, undo: { ...current.undo, players: current.players } };
  }

  return { settings, archive, current, profiles, drafts: [] };
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

const numeric = (values: FinalValues, key: MetricKey) => Number(values[key] ?? 0);

export function compareFinish(game: ArchivedGame, a: string, b: string, reveal = true) {
  const av = game.finals?.[a] ?? {};
  const bv = game.finals?.[b] ?? {};
  const criteria: [string, number, number][] = [
    ['Победные очки', numeric(av, 'points'), numeric(bv, 'points')],
    [
      'Chaumurky',
      game.expansions?.includes('ix') ? numeric(av, 'chaumurky') : 0,
      game.expansions?.includes('ix') ? numeric(bv, 'chaumurky') : 0,
    ],
    ['Пряность', numeric(av, 'spice'), numeric(bv, 'spice')],
    ['Солярии', numeric(av, 'solari'), numeric(bv, 'solari')],
    ['Вода', numeric(av, 'water'), numeric(bv, 'water')],
    [
      'Войска в гарнизоне',
      numeric(av, 'troops') +
        (game.expansions?.includes('bloodlines') ? numeric(av, 'garrisonCommanders') : 0),
      numeric(bv, 'troops') +
        (game.expansions?.includes('bloodlines') ? numeric(bv, 'garrisonCommanders') : 0),
    ],
  ];

  for (const [reason, first, second] of criteria) {
    if (first !== second) {
      return { order: second - first, reason };
    }
  }

  const order = game.lastRevealOrder ?? (!isManual(game) ? game.revealed : []);

  if (reveal && order.includes(a) && order.includes(b)) {
    return { order: order.indexOf(b) - order.indexOf(a), reason: 'Более позднее раскрытие' };
  }

  return { order: 0, reason: 'Нужен порядок раскрытия или подтверждение совместного места' };
}

export function suggestedRanks(game: ArchivedGame) {
  const sorted = [...game.players].sort((a, b) => compareFinish(game, a.id, b.id, false).order);
  const groups: Player[][] = [];

  for (const player of sorted) {
    const last = groups.at(-1);

    if (last && compareFinish(game, last[0].id, player.id, false).order === 0) {
      last.push(player);
    } else {
      groups.push([player]);
    }
  }

  const ranks: Record<string, number> = {};
  const unresolved: string[][] = [];
  let position = 1;
  const order = game.lastRevealOrder ?? (!isManual(game) ? game.revealed : []);

  for (const group of groups) {
    if (group.length > 1 && !group.every((p) => order.includes(p.id))) {
      unresolved.push(group.map((p) => p.id));
    } else {
      group
        .sort((a, b) => compareFinish(game, a.id, b.id).order)
        .forEach((p, i) => {
          ranks[p.id] = position + i;
        });
    }

    position += group.length;
  }

  return { ranks, unresolved, sorted: groups.flat() };
}

export function resultProblems(game: ArchivedGame, includeRanks = true): string[] {
  const errors: string[] = [];

  if (
    new Set(game.players.map((p) => p.profileId)).size !== game.players.length ||
    game.players.some((p) => !p.profileId)
  ) {
    errors.push('Выберите разных игроков для всех мест.');
  }

  for (const player of game.players) {
    const values = game.finals?.[player.id] ?? {};

    for (const field of applicableMetrics(game)) {
      const value = values[field.key];

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

    if (values.chaumurky && !numeric(values, 'technologies')) {
      errors.push(`${player.name}: Chaumurky входит в число технологий.`);
    }

    if (numeric(values, 'garrisonCommanders') > numeric(values, 'commanders')) {
      errors.push(`${player.name}: в гарнизоне больше командиров, чем приобретено.`);
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
    if (!game.resultsConfirmed || game.rated === false || resultProblems(game).length) {
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
