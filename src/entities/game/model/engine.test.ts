import { describe, expect, it } from 'vitest';

import {
  clockOwner,
  defaultSettings,
  formatTime,
  makePlayer,
  startGame,
  statistics,
  transition,
} from './engine';
import { HEROES, heroFor } from './heroes';
import type { Command, Game } from './types';
import { exportGame, parseGameFile, sameGame, validGame } from './validation';

function create(count = 4, heroes: string[] = []): Game {
  const settings = defaultSettings();

  settings.players = Array.from({ length: count }, (_, i) => {
    const player = makePlayer(i);
    const hero = heroFor(heroes[i] ?? 'paul');

    return { ...player, heroId: hero.id, heroName: hero.name };
  });

  return startGame(settings, 1000);
}

function apply(game: Game, type: Command['type'], elapsed = 1000): Game {
  return transition(game, { type } as Command, game.clockAt + elapsed);
}

function combat(count = 4) {
  let game = create(count);

  for (let i = 0; i < count; i += 1) {
    game = apply(game, 'reveal');
  }

  return game;
}

function finished() {
  return apply(combat(), 'finish');
}

describe('личные часы и раунды', () => {
  it.each([2, 4, 6])('полный раунд для %i игроков', (count) => {
    let game = combat(count);

    expect(game.phase).toBe('combat');
    expect(game.active).toBe(game.first);

    for (let i = 0; i < count; i += 1) {
      game = apply(game, 'pass');
    }

    expect(game.phase).toBe('shared');
    expect(clockOwner(game).owner).toBeNull();
    game = apply(game, 'next-round', 12000);
    expect(game.round).toBe(2);
    expect(game.first).toBe(1);
    expect(game.active).toBe(1);
    expect(game.revealed).toEqual([]);
    expect(statistics(game, game.clockAt).shared).toBe(12000);
    expect(validGame(game)).toBe(true);
  });
  it('боевое действие сбрасывает серию, ранее пасовавший получает очередь снова', () => {
    let game = apply(combat(), 'pass');

    expect(game.active).toBe(1);
    game = apply(game, 'combat-action');
    expect(game.passes).toBe(0);
    game = apply(apply(game, 'pass'), 'pass');
    expect(game.active).toBe(0);
    expect(game.phase).toBe('combat');
    game = apply(apply(game, 'pass'), 'pass');
    expect(game.phase).toBe('shared');
  });
  it('последний нераскрывшийся игрок ходит снова', () => {
    let game = create(2);

    game = apply(game, 'reveal');
    game = apply(game, 'next');
    expect(game.active).toBe(1);
    expect(game.turns[game.players[1].id]).toBe(2);
    expect(game.phase).toBe('turns');
  });
  it('пауза не списывает запас, поправка не меняет потраченное время', () => {
    let game = apply(create(), 'pause', 2000);

    expect(transition(game, { type: 'next' }, 9000)).toBe(game);
    game = transition(
      game,
      { type: 'adjust', playerId: game.players[0].id, deltaMs: 60000 },
      10000,
    );
    game = apply(game, 'resume');
    const stat = statistics(game, game.clockAt).players[game.players[0].id];

    expect(stat.total).toBe(2000);
    expect(stat.remaining).toBe(1858000);
    expect(statistics(game, game.clockAt).pause).toBe(8000);
  });
  it('отмена возвращает время ошибочного перехода предыдущему игроку', () => {
    let game = apply(create(), 'next', 5000);

    game = apply(game, 'undo', 3000);
    expect(game.active).toBe(0);
    expect(game.undo).toBeNull();
    const stats = statistics(game, game.clockAt);

    expect(stats.players[game.players[0].id].total).toBe(8000);
    expect(stats.players[game.players[1].id].total).toBe(0);
    expect(validGame(game)).toBe(true);
  });
  it('продолжает время после сериализации и в фоне, допускает перерасход', () => {
    const game = JSON.parse(JSON.stringify(create())) as Game;

    expect(statistics(game, 1_900_000).players[game.players[0].id].remaining).toBe(-99000);
    expect(formatTime(-99000)).toBe('−01:39');
    expect(formatTime(29_999)).toBe('00:30');
  });
  it('отмена начала раунда восстанавливает жетон и общий таймер', () => {
    let game = combat(2);

    game = apply(apply(game, 'pass'), 'pass');
    game = apply(game, 'next-round');
    game = apply(game, 'undo', 2000);
    expect(game.first).toBe(0);
    expect(game.round).toBe(1);
    expect(game.phase).toBe('shared');
    expect(statistics(game, game.clockAt).shared).toBe(3000);
  });
});
describe('герои и временные действия', () => {
  it('20 проверенных героев, только 4 подготовительных решения и одно начало раунда', () => {
    expect(HEROES).toHaveLength(20);
    expect(HEROES.filter((h) => h.setup).map((h) => h.id)).toEqual([
      'baron',
      'hundro',
      'yrkoon',
      'kota',
    ]);
    expect(HEROES.filter((h) => h.round).map((h) => h.id)).toEqual(['ilesa']);

    for (const hero of HEROES) {
      const game = create(2, [hero.id]);

      expect(validGame(game)).toBe(true);
      expect(hero.source.startsWith('https://')).toBe(true);
    }
  });
  it('подготовка героев проходит от первого игрока до обычной очереди', () => {
    let game = create(4, ['baron', 'hundro', 'yrkoon', 'kota']);

    expect(game.queue.map((a) => a.playerId)).toEqual(game.players.map((p) => p.id));

    for (let i = 0; i < 4; i += 1) {
      expect(clockOwner(game).owner).toBe(game.players[i].id);
      game = apply(game, 'ability-done');
    }

    expect(game.active).toBe(0);
    expect(game.turns[game.players[0].id]).toBe(1);
    expect(statistics(game, game.clockAt).players[game.players[2].id].hero).toBe(1000);
  });
  it('Илеса: подготовка и второй собственный ход не создают дополнительную очередь', () => {
    let game = create(2, ['ilesa']);

    expect(game.queue[0].title).toBe('Перед началом раунда');
    game = apply(game, 'ability-done');
    game = apply(apply(game, 'next'), 'next');
    expect(game.queue[0].title).toBe('Второй ход Илесы');
    expect(game.turns[game.players[0].id]).toBe(2);
    game = apply(game, 'ability-done');
    expect(game.active).toBe(0);
  });
  it('Илеса: раннее раскрытие возвращает карту и затем передаёт часы', () => {
    let game = create(2, ['ilesa']);

    game = apply(game, 'ability-done');
    game = apply(game, 'reveal');
    expect(game.queue[0].title).toBe('Раннее раскрытие Илесы');
    expect(clockOwner(game).owner).toBe(game.players[0].id);
    game = apply(game, 'ability-done');
    expect(game.active).toBe(1);
    expect(clockOwner(game).owner).toBe(game.players[1].id);
  });
  it('ручная способность сохраняет серию пасов и возвращает предыдущие часы', () => {
    let game = apply(combat(), 'pass');

    game = transition(game, { type: 'ability', playerId: game.players[3].id }, game.clockAt + 1000);
    expect(clockOwner(game).owner).toBe(game.players[3].id);
    game = apply(game, 'ability-done', 4000);
    expect(game.passes).toBe(1);
    expect(game.active).toBe(1);
    expect(statistics(game, game.clockAt).players[game.players[3].id].hero).toBe(4000);
  });
  it('личное действие прерывает общий секундомер без двойного списания', () => {
    let game = combat(2);

    game = apply(apply(game, 'pass'), 'pass');
    game = transition(game, { type: 'ability', playerId: game.players[1].id }, game.clockAt + 3000);
    game = apply(game, 'ability-done', 5000);
    expect(clockOwner(game).category).toBe('shared');
    expect(statistics(game, game.clockAt).shared).toBe(3000);
    const stats = statistics(game, game.clockAt);

    expect(
      Object.values(stats.players).reduce((sum, p) => sum + p.total, 0) +
        stats.shared +
        stats.pause,
    ).toBe(stats.total);
  });
});
describe('версионированный JSON', () => {
  it.each([null, 'one', 'many'])('сохраняет все поля и результат %s', (result) => {
    const game = finished();

    game.winnerIds =
      result === null ? null : game.players.slice(0, result === 'one' ? 1 : 2).map((p) => p.id);
    const restored = parseGameFile(exportGame(game));

    expect(restored).toEqual(game);

    if (!validGame(restored)) {
      throw new Error('Expected a measured game');
    }

    expect(statistics(restored)).toEqual(statistics(game));
    expect(sameGame(game, restored)).toBe(true);
  });
  it('не экспортирует текущую партию', () => {
    expect(() => exportGame(create())).toThrow();
  });
  it('не принимает повреждённый JSON, новый формат, чужого победителя и разрыв интервалов', () => {
    expect(() => parseGameFile('{')).toThrow();
    const payload = JSON.parse(exportGame(finished()));

    expect(() => parseGameFile(JSON.stringify({ ...payload, formatVersion: 3 }))).toThrow();
    const winner = structuredClone(payload);

    winner.game.winnerIds = ['unknown'];
    expect(() => parseGameFile(JSON.stringify(winner))).toThrow();
    const gap = structuredClone(payload);

    gap.game.intervals[1].start += 1;
    expect(() => parseGameFile(JSON.stringify(gap))).toThrow();
    const invalid = structuredClone(payload);

    invalid.game.players[0].initialMs = -1;
    expect(() => parseGameFile(JSON.stringify(invalid))).toThrow();
  });
  it('порядок ключей не создаёт ложную изменённую запись', () => {
    const game = finished();
    const reverse = Object.fromEntries(Object.entries(game).reverse()) as Game;

    expect(sameGame(game, reverse)).toBe(true);
    expect(sameGame(game, { ...game, winnerIds: [game.players[0].id] })).toBe(false);
  });
  it('история остаётся валидной и сумма времени сходится на длинной партии', () => {
    let game = create(6, ['baron', 'ilesa', 'piter', 'kota', 'chani', 'helena']);

    for (let i = 0; i < 300; i += 1) {
      let command: Command = { type: 'next' };

      if (game.queue.length) {
        command = { type: 'ability-done' };
      } else if (game.phase === 'shared') {
        command = { type: 'next-round' };
      } else if (game.phase === 'combat') {
        command = { type: i % 5 === 0 ? 'combat-action' : 'pass' };
      } else {
        command = { type: i % 3 === 0 ? 'next' : 'reveal' };
      }

      game = transition(game, command, game.clockAt + 333);
      expect(validGame(game)).toBe(true);
      const stat = statistics(game, game.clockAt);

      expect(
        stat.shared + stat.pause + Object.values(stat.players).reduce((sum, p) => sum + p.total, 0),
      ).toBe(stat.total);
    }
  });
});
