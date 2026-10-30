import { HEROES } from './heroes';
import type { AppData, ArchiveEntry, Game, GameCore, Player, Settings } from './types';

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

export function validArchive(value: unknown): value is ArchiveEntry {
  return (
    object(value) &&
    validGame(value.game) &&
    value.game.endedAt !== null &&
    value.game.undo === null &&
    (value.importedAt === null || stamp(value.importedAt))
  );
}

export function validData(value: unknown): value is AppData {
  return (
    object(value) &&
    validSettings(value.settings) &&
    (value.current === null || (validGame(value.current) && value.current.endedAt === null)) &&
    Array.isArray(value.archive) &&
    value.archive.every(validArchive) &&
    new Set(value.archive.map((a) => a.game.id)).size === value.archive.length &&
    !value.archive.some((a) => a.game.id === (value.current as Game | null)?.id)
  );
}

export function parseGameFile(contents: string): Game {
  if (new TextEncoder().encode(contents).length > 5 * 1024 * 1024) {
    throw new Error('Файл больше 5 МБ. Выберите экспорт одной партии.');
  }

  let value: unknown;

  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('Не удалось прочитать JSON. Файл повреждён.');
  }

  if (!object(value) || value.app !== 'dune-imperium-timer' || value.formatVersion !== 1) {
    throw new Error('Это не экспорт Dune Imperium Timer или версия файла пока не поддерживается.');
  }

  if (!validGame(value.game) || value.game.endedAt === null || value.game.undo !== null) {
    throw new Error(
      'Некорректные данные партии. Можно импортировать только завершённую игру с полной историей времени.',
    );
  }

  return value.game;
}

export function exportGame(game: Game): string {
  if (!validGame(game) || game.endedAt === null || game.undo !== null) {
    throw new Error('Сначала завершите партию.');
  }

  return JSON.stringify({ app: 'dune-imperium-timer', formatVersion: 1, game }, null, 2);
}

export function sameGame(a: Game, b: Game): boolean {
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
