import { heroAbility, heroFor } from './heroes';
import type {
  Ability,
  AppData,
  Category,
  Command,
  Game,
  GameCore,
  Interval,
  Player,
  Settings,
} from './types';

export const COLORS = ['#a45539', '#47798a', '#697849', '#87628a', '#bb842b', '#5963a5'];

export function defaultSettings(): Settings {
  return {
    players: Array.from({ length: 4 }, (_, i) => makePlayer(i)),
    first: 0,
    minutes: 30,
    sound: true,
    vibration: true,
  };
}

export function makePlayer(index: number, minutes = 30): Player {
  const hero = heroFor(['paul', 'leto', 'ilban', 'ariana', 'memnon', 'rabban'][index]);

  return {
    id: crypto.randomUUID(),
    name: `Игрок ${index + 1}`,
    color: COLORS[index],
    heroId: hero.id,
    heroName: hero.name,
    initialMs: minutes * 60_000,
  };
}

export function initialData(): AppData {
  return { settings: defaultSettings(), current: null, archive: [] };
}

function ordered(game: GameCore): Player[] {
  return game.players.map((_, offset) => game.players[(game.first + offset) % game.players.length]);
}

function abilities(game: GameCore, kind: 'setup' | 'round'): Ability[] {
  return ordered(game).flatMap((player) => {
    const ability = heroAbility(player, kind);

    return ability ? [ability] : [];
  });
}

export function startGame(settings: Settings, now: number): Game {
  const game: Game = {
    id: crypto.randomUUID(),
    startedAt: now,
    updatedAt: now,
    endedAt: null,
    players: structuredClone(settings.players),
    first: settings.first,
    active: settings.first,
    round: 1,
    phase: 'turns',
    revealed: [],
    turns: Object.fromEntries(settings.players.map((p, i) => [p.id, i === settings.first ? 1 : 0])),
    passes: 0,
    paused: false,
    queue: [],
    clockAt: now,
    intervals: [],
    adjustments: [],
    winnerIds: null,
    undo: null,
  };

  game.queue = [...abilities(game, 'setup'), ...abilities(game, 'round')];

  return game;
}

export function clockOwner(game: GameCore): { owner: string | null; category: Category } {
  if (game.paused) {
    return { owner: null, category: 'pause' };
  }

  if (game.queue.length) {
    return { owner: game.queue[0].playerId, category: 'hero' };
  }

  if (game.phase === 'shared') {
    return { owner: null, category: 'shared' };
  }

  return { owner: game.players[game.active].id, category: game.phase };
}

export function intervalsAt(game: GameCore, now: number): Interval[] {
  const end = game.endedAt ?? Math.max(now, game.clockAt);

  if (end <= game.clockAt || game.endedAt !== null) {
    return game.intervals;
  }

  return [...game.intervals, { start: game.clockAt, end, ...clockOwner(game), round: game.round }];
}

export function statistics(game: GameCore, now = Date.now()) {
  const players = Object.fromEntries(
    game.players.map((player) => [
      player.id,
      { turns: 0, combat: 0, hero: 0, total: 0, adjustment: 0, remaining: player.initialMs },
    ]),
  );
  let shared = 0;
  let pause = 0;

  for (const interval of intervalsAt(game, now)) {
    const duration = interval.end - interval.start;

    if (interval.category === 'shared') {
      shared += duration;
    } else if (interval.category === 'pause') {
      pause += duration;
    } else if (interval.owner && players[interval.owner]) {
      const player = players[interval.owner];

      player[interval.category] += duration;
      player.total += duration;
      player.remaining -= duration;
    }
  }

  for (const adjustment of game.adjustments) {
    players[adjustment.playerId].adjustment += adjustment.deltaMs;
    players[adjustment.playerId].remaining += adjustment.deltaMs;
  }

  return { players, shared, pause, total: Math.max(0, (game.endedAt ?? now) - game.startedAt) };
}

function snapshot(game: Game): GameCore {
  const { undo: _undo, ...core } = structuredClone(game);

  return core;
}

function settle(game: Game, now: number): Game {
  const at = Math.max(now, game.clockAt);

  return { ...structuredClone(game), intervals: intervalsAt(game, at), clockAt: at, updatedAt: at };
}

function enterTurn(game: Game) {
  const player = game.players[game.active];

  game.turns[player.id] += 1;

  if (player.heroId === 'ilesa' && game.turns[player.id] === 2) {
    game.queue.push({
      playerId: player.id,
      title: 'Второй ход Илесы',
      text: 'Покажите и верните отложенную карту в руку. Бонус доступен только при отправке агента с этой картой.',
      optional: false,
      source: heroFor('ilesa').source,
    });
  }
}

function advanceTurn(game: Game) {
  if (game.revealed.length === game.players.length) {
    game.phase = 'combat';
    game.active = game.first;
    game.passes = 0;

    return;
  }

  for (let step = 1; step <= game.players.length; step += 1) {
    const index = (game.active + step) % game.players.length;

    if (!game.revealed.includes(game.players[index].id)) {
      game.active = index;
      enterTurn(game);

      return;
    }
  }
}

export function transition(current: Game, command: Command, now: number): Game {
  if (current.endedAt !== null) {
    return current;
  }

  if (command.type === 'undo') {
    if (!current.undo) {
      return current;
    }

    const previous = { ...structuredClone(current.undo), undo: null };

    return settle(previous, now);
  }

  const game = settle(current, now);

  game.undo = snapshot(game);

  if (command.type === 'pause') {
    if (game.paused) {
      return current;
    }

    game.paused = true;

    return game;
  }

  if (command.type === 'resume') {
    if (!game.paused) {
      return current;
    }

    game.paused = false;

    return game;
  }

  if (command.type === 'finish') {
    game.endedAt = game.clockAt;
    game.queue = [];
    game.undo = null;

    return game;
  }

  if (command.type === 'adjust') {
    if (
      !game.paused ||
      !game.players.some((p) => p.id === command.playerId) ||
      !Number.isSafeInteger(command.deltaMs)
    ) {
      return current;
    }

    game.adjustments.push({
      playerId: command.playerId,
      deltaMs: command.deltaMs,
      at: game.clockAt,
    });

    return game;
  }

  if (game.paused) {
    return current;
  }

  if (command.type === 'ability-done') {
    if (!game.queue.length) {
      return current;
    }

    game.queue.shift();

    return game;
  }

  if (game.queue.length) {
    return current;
  }

  if (command.type === 'ability') {
    const player = game.players.find((p) => p.id === command.playerId);

    if (!player) {
      return current;
    }

    const hero = heroFor(player.heroId);

    game.queue = [
      {
        playerId: player.id,
        title: 'Личное действие героя',
        text: hero.tip,
        optional: true,
        source: hero.source,
      },
    ];

    return game;
  }

  if (game.phase === 'turns' && (command.type === 'next' || command.type === 'reveal')) {
    const player = game.players[game.active];

    if (command.type === 'reveal') {
      game.revealed.push(player.id);

      if (player.heroId === 'ilesa' && game.turns[player.id] === 1) {
        game.queue.push({
          playerId: player.id,
          title: 'Раннее раскрытие Илесы',
          text: 'Добавьте отложенную карту к раскрытым. Бонус пряности или солярия не даётся.',
          optional: false,
          source: heroFor('ilesa').source,
        });
      }
    }

    advanceTurn(game);

    return game;
  }

  if (game.phase === 'combat' && (command.type === 'pass' || command.type === 'combat-action')) {
    game.passes = command.type === 'pass' ? game.passes + 1 : 0;
    game.active = (game.active + 1) % game.players.length;

    if (game.passes === game.players.length) {
      game.phase = 'shared';
    }

    return game;
  }

  if (game.phase === 'shared' && command.type === 'next-round') {
    game.first = (game.first + 1) % game.players.length;
    game.active = game.first;
    game.round += 1;
    game.phase = 'turns';
    game.revealed = [];
    game.passes = 0;
    game.turns = Object.fromEntries(game.players.map((p) => [p.id, 0]));
    game.queue = abilities(game, 'round');
    enterTurn(game);

    return game;
  }

  return current;
}

export function formatTime(ms: number): string {
  const negative = ms < 0;
  const seconds = Math.ceil(Math.abs(ms) / 1000);
  const minutes = Math.floor(seconds / 60);

  return `${negative ? '−' : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
