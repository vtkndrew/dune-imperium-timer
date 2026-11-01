import { HEROES } from './heroes';
import { METRICS, nameKey, resultProblems } from './records';
import type {
  AppData,
  ArchivedGame,
  ArchiveEntry,
  Game,
  GameCore,
  Player,
  Settings,
  ResultDraft,
} from './types';

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value);
const stamp = (value: unknown): value is number =>
  integer(value) && value >= 0 && value <= 8_640_000_000_000_000;
const text = (value: unknown, max = 120): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const ids = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => text(id)) && new Set(value).size === value.length;

export function validPlayer(value: unknown): value is Player {
  return (
    object(value) &&
    text(value.id) &&
    text(value.name, 60) &&
    (value.profileId === undefined || text(value.profileId)) &&
    typeof value.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(value.color) &&
    HEROES.some((h) => h.id === value.heroId) &&
    text(value.heroName) &&
    integer(value.initialMs) &&
    value.initialMs >= 60_000 &&
    value.initialMs <= 1440 * 60_000
  );
}

function validPlayers(value: unknown): value is Player[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 6 &&
    value.every(validPlayer) &&
    new Set(value.map((p) => p.id)).size === value.length
  );
}

export function validSettings(value: unknown): value is Settings {
  return (
    object(value) &&
    validPlayers(value.players) &&
    integer(value.first) &&
    value.first >= 0 &&
    value.first < value.players.length &&
    integer(value.minutes) &&
    value.minutes >= 1 &&
    value.minutes <= 1440 &&
    typeof value.sound === 'boolean' &&
    typeof value.vibration === 'boolean'
  );
}

function validCore(value: unknown): value is GameCore {
  if (!object(value) || !text(value.id) || !validPlayers(value.players)) {
    return false;
  }

  const players = value.players;
  const hasPlayer = (id: unknown) => players.some((p) => p.id === id);

  if (
    !stamp(value.startedAt) ||
    !stamp(value.updatedAt) ||
    !stamp(value.clockAt) ||
    value.clockAt < value.startedAt ||
    value.updatedAt < value.clockAt ||
    (value.endedAt !== null && (!stamp(value.endedAt) || value.endedAt !== value.clockAt))
  ) {
    return false;
  }

  if (
    !integer(value.first) ||
    value.first < 0 ||
    value.first >= players.length ||
    !integer(value.active) ||
    value.active < 0 ||
    value.active >= players.length ||
    !integer(value.round) ||
    value.round < 1 ||
    value.round > 10000 ||
    !['turns', 'combat', 'shared'].includes(String(value.phase)) ||
    typeof value.paused !== 'boolean'
  ) {
    return false;
  }

  if (
    !ids(value.revealed) ||
    !value.revealed.every(hasPlayer) ||
    !integer(value.passes) ||
    value.passes < 0 ||
    value.passes > players.length ||
    !object(value.turns)
  ) {
    return false;
  }

  const turns = value.turns;

  if (
    Object.keys(turns).length !== players.length ||
    !players.every((p) => integer(turns[p.id]) && Number(turns[p.id]) >= 0)
  ) {
    return false;
  }

  if (
    value.winnerIds !== null &&
    (!ids(value.winnerIds) || !value.winnerIds.length || !value.winnerIds.every(hasPlayer))
  ) {
    return false;
  }

  if (
    !Array.isArray(value.queue) ||
    value.queue.length > 12 ||
    !value.queue.every(
      (a) =>
        object(a) &&
        hasPlayer(a.playerId) &&
        text(a.title, 150) &&
        text(a.text, 2000) &&
        typeof a.optional === 'boolean' &&
        typeof a.source === 'string' &&
        /^https:\/\/(d19y2ttatozxjp.cloudfront.net|dunecardshub.com)\//.test(a.source),
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(value.adjustments) ||
    value.adjustments.length > 10000 ||
    !value.adjustments.every(
      (a) =>
        object(a) &&
        hasPlayer(a.playerId) &&
        stamp(a.at) &&
        a.at >= Number(value.startedAt) &&
        a.at <= Number(value.clockAt) &&
        integer(a.deltaMs) &&
        Math.abs(a.deltaMs) <= 86_400_000,
    )
  ) {
    return false;
  }

  if (!Array.isArray(value.intervals) || value.intervals.length > 100000) {
    return false;
  }

  let cursor = value.startedAt;

  for (const interval of value.intervals) {
    if (
      !object(interval) ||
      !stamp(interval.start) ||
      !stamp(interval.end) ||
      interval.start !== cursor ||
      interval.end <= interval.start ||
      !integer(interval.round) ||
      interval.round < 1 ||
      interval.round > value.round
    ) {
      return false;
    }

    const personal = ['turns', 'combat', 'hero'].includes(String(interval.category));

    if (
      personal
        ? !hasPlayer(interval.owner)
        : !['shared', 'pause'].includes(String(interval.category)) || interval.owner !== null
    ) {
      return false;
    }

    cursor = interval.end;
  }

  return cursor === value.clockAt;
}

export function validGame(value: unknown): value is Game {
  if (!object(value)) {
    return false;
  }

  const undo = value.undo;

  if (!validCore(value)) {
    return false;
  }

  if (undo === null) {
    return true;
  }

  return (
    value.endedAt === null &&
    validCore(undo) &&
    undo.endedAt === null &&
    undo.id === value.id &&
    undo.startedAt === value.startedAt &&
    undo.clockAt <= value.clockAt &&
    JSON.stringify(undo.players) === JSON.stringify(value.players)
  );
}

export function validLegacyArchive(value: unknown): value is ArchiveEntry {
  return (
    object(value) &&
    validGame(value.game) &&
    value.game.endedAt !== null &&
    value.game.undo === null &&
    (value.importedAt === null || stamp(value.importedAt))
  );
}

export function validLegacyData(
  value: unknown,
): value is Pick<AppData, 'settings' | 'current' | 'archive'> {
  return (
    object(value) &&
    validSettings(value.settings) &&
    (value.current === null || (validGame(value.current) && value.current.endedAt === null)) &&
    Array.isArray(value.archive) &&
    value.archive.every(validLegacyArchive) &&
    new Set(value.archive.map((a) => a.game.id)).size === value.archive.length &&
    !value.archive.some((a) => a.game.id === (value.current as Game | null)?.id)
  );
}

const expansions = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((v) => ['ix', 'immortality', 'bloodlines'].includes(v)));

function validResults(value: Record<string, unknown>, players: Player[]) {
  const member = (id: string) => players.some((p) => p.id === id);

  if (
    !expansions(value.expansions) ||
    ['rated', 'resultsConfirmed', 'sharedPlacesConfirmed'].some(
      (key) => value[key] !== undefined && typeof value[key] !== 'boolean',
    )
  ) {
    return false;
  }

  if (
    value.lastRevealOrder !== undefined &&
    (!ids(value.lastRevealOrder) || !value.lastRevealOrder.every(member))
  ) {
    return false;
  }

  if (
    value.finals !== undefined &&
    (!object(value.finals) ||
      !Object.entries(value.finals).every(
        ([id, fields]) =>
          member(id) &&
          object(fields) &&
          Object.entries(fields).every(([key, v]) => {
            const field = METRICS.find((m) => m.key === key);

            return (
              field &&
              (field.boolean
                ? typeof v === 'boolean'
                : integer(v) && v >= 0 && v <= (field.max ?? 1000000))
            );
          }),
      ))
  ) {
    return false;
  }

  return (
    value.rankings === undefined ||
    (object(value.rankings) &&
      Object.entries(value.rankings).every(
        ([id, v]) => member(id) && integer(v) && v >= 1 && v <= players.length,
      ))
  );
}

export function validRecord(value: unknown, draft = false): value is ArchivedGame {
  if (!object(value) || !validPlayers(value.players) || !validResults(value, value.players)) {
    return false;
  }

  if (value.kind === 'manual') {
    if (
      !text(value.id) ||
      !stamp(value.startedAt) ||
      !stamp(value.updatedAt) ||
      !stamp(value.endedAt) ||
      value.endedAt < value.startedAt ||
      !integer(value.round) ||
      value.round < 1 ||
      value.round > 10000
    ) {
      return false;
    }

    if (
      value.winnerIds !== null &&
      (!ids(value.winnerIds) ||
        !value.winnerIds.length ||
        !value.winnerIds.every((id) => (value.players as Player[]).some((p) => p.id === id)))
    ) {
      return false;
    }

    const timing = value.timing;

    if (
      !object(timing) ||
      !['none', 'summary'].includes(String(timing.kind)) ||
      (timing.duration !== null &&
        (!integer(timing.duration) || timing.duration < 0 || timing.duration > 31536000000)) ||
      !object(timing.players)
    ) {
      return false;
    }

    if (
      !Object.entries(timing.players).every(
        ([id, v]) =>
          (value.players as Player[]).some((p) => p.id === id) &&
          object(v) &&
          (v.total === null || (integer(v.total) && v.total >= 0 && v.total <= 31536000000)) &&
          ['turns', 'combat', 'hero'].every(
            (key) =>
              v[key] === undefined ||
              (integer(v[key]) && Number(v[key]) >= 0 && Number(v[key]) <= 31536000000),
          ),
      )
    ) {
      return false;
    }

    if (timing.kind === 'none' && Object.keys(timing.players).length) {
      return false;
    }

    if (!draft && value.resultsConfirmed !== true) {
      return false;
    }
  } else if (
    value.kind !== undefined ||
    !validGame(value) ||
    value.endedAt === null ||
    value.undo !== null
  ) {
    return false;
  }

  if (value.resultsConfirmed === true) {
    const record = value as ArchivedGame;

    if (resultProblems(record).length) {
      return false;
    }

    const winners = record.players
      .filter((p) => record.rankings?.[p.id] === 1)
      .map((p) => p.id)
      .sort();

    if (JSON.stringify(winners) !== JSON.stringify([...(record.winnerIds ?? [])].sort())) {
      return false;
    }
  }

  return true;
}

export function validDraft(value: unknown): value is ResultDraft {
  return (
    object(value) &&
    text(value.id) &&
    validRecord(value.game, true) &&
    (value.editingId === null || value.editingId === value.game.id) &&
    (value.importedAt === null || stamp(value.importedAt))
  );
}

export function validArchive(value: unknown): value is ArchiveEntry {
  return (
    object(value) &&
    validRecord(value.game) &&
    (value.importedAt === null || stamp(value.importedAt))
  );
}

export function validData(value: unknown): value is AppData {
  if (
    !object(value) ||
    !validSettings(value.settings) ||
    !expansions(value.settings.expansions) ||
    !Array.isArray(value.profiles) ||
    !Array.isArray(value.drafts) ||
    !Array.isArray(value.archive)
  ) {
    return false;
  }

  const profiles = value.profiles;

  if (
    !profiles.every(
      (p) =>
        object(p) &&
        text(p.id) &&
        text(p.name, 60) &&
        (p.sourceIds === undefined || ids(p.sourceIds)),
    ) ||
    new Set(profiles.map((p) => p.id)).size !== profiles.length ||
    new Set(profiles.map((p) => nameKey(p.name))).size !== profiles.length
  ) {
    return false;
  }

  if (
    !(
      value.current === null ||
      (validGame(value.current) &&
        value.current.endedAt === null &&
        validResults(value.current, value.current.players))
    ) ||
    !value.archive.every(validArchive) ||
    !value.drafts.every(validDraft)
  ) {
    return false;
  }

  if (
    new Set(value.archive.map((e) => e.game.id)).size !== value.archive.length ||
    new Set(value.drafts.map((d) => d.id)).size !== value.drafts.length ||
    new Set(value.drafts.map((d) => d.game.id)).size !== value.drafts.length
  ) {
    return false;
  }

  const current = value.current as Game | null;
  const archive = value.archive;

  if (
    value.archive.some((e) => e.game.id === current?.id) ||
    value.drafts.some(
      (d) =>
        d.game.id === current?.id ||
        (d.editingId
          ? !archive.some((e) => e.game.id === d.editingId)
          : archive.some((e) => e.game.id === d.game.id)),
    )
  ) {
    return false;
  }

  const groups = [
    value.settings.players,
    ...(current ? [current.players] : []),
    ...value.archive.map((e) => e.game.players),
    ...value.drafts.map((d) => d.game.players),
  ];

  return groups.every((players) =>
    players.every(
      (p: Player) =>
        !p.profileId ||
        profiles.some((profile) => profile.id === p.profileId && profile.name === p.name),
    ),
  );
}

export function parseGameFile(contents: string): ArchivedGame {
  if (new TextEncoder().encode(contents).length > 5 * 1024 * 1024) {
    throw new Error('Файл больше 5 МБ. Выберите экспорт одной партии.');
  }

  let value: unknown;

  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('Не удалось прочитать JSON. Файл повреждён.');
  }

  if (
    !object(value) ||
    value.app !== 'dune-imperium-timer' ||
    ![1, 2].includes(Number(value.formatVersion)) ||
    typeof value.formatVersion !== 'number'
  ) {
    throw new Error('Это не экспорт Dune Imperium Timer или версия файла пока не поддерживается.');
  }

  if (value.formatVersion === 1) {
    if (!validGame(value.game) || value.game.endedAt === null || value.game.undo !== null) {
      throw new Error(
        'Некорректные данные партии. Нужна завершённая игра с полной историей времени.',
      );
    }

    return {
      ...value.game,
      players: value.game.players.map(({ profileId: _profileId, ...player }) => player),
    };
  }

  if (!validRecord(value.game)) {
    throw new Error('Некорректные данные партии: проверьте время, участников, показатели и места.');
  }

  return value.game;
}

export function exportGame(game: ArchivedGame): string {
  if (!validRecord(game)) {
    throw new Error('Сначала завершите партию.');
  }

  return JSON.stringify({ app: 'dune-imperium-timer', formatVersion: 2, game }, null, 2);
}

export function sameGame(a: ArchivedGame, b: ArchivedGame): boolean {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(canonical);
    }

    if (object(value)) {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      );
    }

    return value;
  }

  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
