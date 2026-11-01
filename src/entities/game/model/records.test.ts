import { describe, expect, it } from 'vitest';

import { defaultSettings, makePlayer, initialData, startGame, transition } from './engine';
import {
  applicableMetrics,
  bindPlayers,
  compareFinish,
  changeFinalValue,
  eloHistory,
  isManual,
  manualGame,
  playerSummary,
  prepareImport,
  renameProfile,
  resultProblems,
  suggestedRanks,
} from './records';
import type { AppData, ArchivedGame, FinalValues, ManualGame } from './types';
import { exportGame, parseGameFile, validData, validRecord } from './validation';

function fixture(count = 4) {
  const bound = bindPlayers(
    [],
    Array.from({ length: count }, (_, index) => makePlayer(index)),
  );
  const game = manualGame(bound.players, 1000) as ManualGame;

  game.finals = Object.fromEntries(
    game.players.map((p, i) => [
      p.id,
      Object.fromEntries(
        applicableMetrics(game).map((field) => [field.key, field.boolean ? false : 10 - i]),
      ),
    ]),
  );

  for (const values of Object.values(game.finals)) {
    for (const key of ['emperor', 'guild', 'bene', 'fremen'] as const) {
      values[key] = 0;
    }
  }

  game.rankings = suggestedRanks(game).ranks;
  game.resultsConfirmed = true;
  game.winnerIds = [game.players[0].id];
  const data: AppData = {
    ...initialData(),
    profiles: bound.profiles,
    archive: [{ game, importedAt: null }],
  };

  return { game, data, profiles: bound.profiles };
}

describe('profiles', () => {
  it('rename updates all snapshots, frees old name and respects stable import IDs', () => {
    const { data, game, profiles } = fixture();

    data.drafts = [
      {
        id: 'draft',
        game: { ...structuredClone(game), resultsConfirmed: false },
        editingId: game.id,
        importedAt: null,
      },
    ];
    const renamed = renameProfile(data, profiles[0].id, 'Новое имя');

    expect(renamed.archive[0].game.players[0].name).toBe('Новое имя');
    expect(renamed.drafts[0].game.players[0].name).toBe('Новое имя');
    expect(prepareImport(renamed, game).game.players[0].name).toBe('Новое имя');
    expect(() =>
      renameProfile(renamed, profiles[0].id, ` ${profiles[1].name.toUpperCase()} `),
    ).toThrow();
    const bound = bindPlayers(renamed.profiles, [{ ...game.players[0], profileId: undefined }]);

    expect(bound.profiles).toHaveLength(5);
    expect(bound.players[0].profileId).not.toBe(profiles[0].id);
    expect(validData(renamed)).toBe(true);
  });
});

describe('final results and ranking', () => {
  it('accepts omitted resources, preserves explicit zero and checks exclusive ownership', () => {
    const { game } = fixture(2);

    expect(resultProblems(game)).toEqual([]);
    const id = game.players[0].id;

    delete game.finals?.[id]?.water;
    expect(resultProblems(game)).toEqual([]);
    (game.finals as Record<string, FinalValues>)[id].water = 0;
    expect(resultProblems(game)).toEqual([]);

    for (const values of Object.values(game.finals ?? {})) {
      values.emperorAlliance = true;
    }

    expect(resultProblems(game).some((s) => s.includes('Несколько владельцев'))).toBe(true);
  });
  it.each([2, 3, 4, 5, 6])(
    'saves and round trips only points and places for %i players',
    (count) => {
      const { game, data, profiles } = fixture(count);

      game.finals = Object.fromEntries(
        game.players.map((p, i) => [p.id, { points: count - i - 1 }]),
      );
      expect(resultProblems(game)).toEqual([]);
      expect(validRecord(game)).toBe(true);
      expect(parseGameFile(exportGame(game))).toEqual(game);
      expect(eloHistory(data.archive, profiles).ratings[profiles[0].id]).toBe(1016);
      delete game.finals[game.players[0].id].points;
      expect(suggestedRanks(game).ready).toBe(false);
      expect(resultProblems(game).some((s) => s.includes('победные очки'))).toBe(true);
    },
  );
  it('uses confirmed equal-points places independently of resources and reveal order', () => {
    const { game, data, profiles } = fixture(2);
    const [a, b] = game.players.map((p) => p.id);

    game.expansions = ['ix', 'bloodlines'];
    game.finals = {
      [a]: { points: 10 },
      [b]: { points: 10, chaumurky: true, spice: 100, garrisonCommanders: 2 },
    };
    game.lastRevealOrder = [a, b];
    expect(compareFinish(game, a, b).order).toBe(0);
    expect(suggestedRanks(game).unresolved).toEqual([[a, b]]);
    expect(resultProblems(game)).toEqual([]);
    expect(eloHistory(data.archive, profiles).ratings[profiles[0].id]).toBe(1016);
    expect(parseGameFile(exportGame(game))).toEqual(game);
    expect(changeFinalValue(game, a, 'water', 0).rankings).toEqual(game.rankings);
    game.finals[b].technologies = 0;
    game.finals[b].commanders = 1;
    expect(resultProblems(game).length).toBe(2);
    game.finals[b].technologies = 1;
    game.finals[b].commanders = 2;
    expect(resultProblems(game)).toEqual([]);
    game.finals[b].spice = -1;
    expect(resultProblems(game).some((s) => s.includes('Пряность'))).toBe(true);
  });
  it('resets only affected equal-points groups and keeps optional edits independent', () => {
    const { game } = fixture(6);
    const ids = game.players.map((p) => p.id);

    game.finals = Object.fromEntries(ids.map((id, i) => [id, { points: [10, 10, 8, 8, 6, 6][i] }]));
    game.rankings = Object.fromEntries(ids.map((id, i) => [id, i + 1]));
    const optional = changeFinalValue(game, ids[0], 'water', 0);

    expect(optional.rankings).toEqual(game.rankings);
    const changed = changeFinalValue(game, ids[0], 'points', 9);

    expect(changed.rankings).toEqual(Object.fromEntries(ids.slice(2).map((id, i) => [id, i + 3])));
    const moved = changeFinalValue(game, ids[0], 'points', 7);

    expect(moved.rankings).toEqual({ [ids[4]]: 5, [ids[5]]: 6 });
    expect(changeFinalValue(game, ids[0], 'points', undefined).rankings).toEqual({});
    expect(game.finals?.[ids[0]].points).toBe(10);
  });
  it('records reveals across rounds and restores the sequence on undo', () => {
    let game = startGame(defaultSettings(), 1000);

    game = transition(game, { type: 'reveal' }, 2000);
    expect(game.lastRevealOrder).toEqual([game.players[0].id]);
    game = transition(game, { type: 'undo' }, 3000);
    expect(game.lastRevealOrder).toEqual([]);

    for (let i = 0; i < 4; i += 1) {
      game = transition(game, { type: 'reveal' }, game.clockAt + 1);
    }

    for (let i = 0; i < 4; i += 1) {
      game = transition(game, { type: 'pass' }, game.clockAt + 1);
    }

    const order = game.lastRevealOrder;

    game = transition(game, { type: 'next-round' }, game.clockAt + 1);
    expect(game.lastRevealOrder).toEqual(order);
  });
});

describe('Elo and statistics', () => {
  it('updates everyone simultaneously and normalizes table size', () => {
    const { data, profiles } = fixture();
    const elo = eloHistory(data.archive, profiles);

    expect(profiles.map((p) => elo.ratings[p.id])).toEqual([
      1016,
      1000 + 32 / 6,
      1000 - 32 / 6,
      984,
    ]);
    expect(Object.values(elo.ratings).reduce((a, b) => a + b, 0)).toBe(4000);
    const duel = fixture(2);

    expect(eloHistory(duel.data.archive, duel.profiles).ratings[duel.profiles[0].id]).toBe(1016);
  });
  it('replays chronologically, excludes drafts and unrated games, recalculates after deletion', () => {
    const { data, game, profiles } = fixture(2);
    const other = structuredClone(game);

    other.id = 'later';
    other.startedAt = 2000;
    other.endedAt = 2000;
    data.archive.push({ game: other, importedAt: 5000 });
    const normal = eloHistory(data.archive, profiles);

    expect(eloHistory([...data.archive].reverse(), profiles)).toEqual(normal);
    expect(normal.ratings[profiles[0].id]).toBeGreaterThan(1016);
    other.rated = false;
    expect(eloHistory(data.archive, profiles).ratings[profiles[0].id]).toBe(1016);
    expect(eloHistory(data.archive.slice(1), profiles).ratings[profiles[0].id]).toBe(1000);
  });
  it('requires explicit shared places and treats a draw as half a point', () => {
    const { game, data, profiles } = fixture(2);
    const [a, b] = game.players.map((p) => p.id);

    game.finals = { [a]: { ...game.finals?.[a] }, [b]: { ...game.finals?.[a] } };
    game.rankings = {};
    expect(resultProblems(game)).not.toContain(
      'Указаны одинаковые места. Выберите разные или подтвердите ничью.',
    );
    game.rankings = { [a]: 1, [b]: 1 };
    game.winnerIds = [a, b];
    expect(resultProblems(game)).toContain(
      'Указаны одинаковые места. Выберите разные или подтвердите ничью.',
    );
    game.sharedPlacesConfirmed = true;
    expect(resultProblems(game)).toEqual([]);
    expect(eloHistory(data.archive, profiles).ratings[profiles[0].id]).toBe(1000);
  });
  it('counts only known optional values, including explicit zero and false', () => {
    const { game, data, profiles } = fixture(2);
    const id = game.players[0].id;

    game.finals = Object.fromEntries(game.players.map((p, i) => [p.id, { points: 10 - i }]));
    const known = structuredClone(game);

    known.id = 'known';
    (known.finals as Record<string, FinalValues>)[id].water = 0;
    (known.finals as Record<string, FinalValues>)[id].swordmaster = false;
    const another = structuredClone(known);

    another.id = 'another';
    (another.finals as Record<string, FinalValues>)[id].water = 6;
    (another.finals as Record<string, FinalValues>)[id].swordmaster = true;
    data.archive.push({ game: known, importedAt: null }, { game: another, importedAt: null });
    const summary = playerSummary(data.archive, profiles[0].id);

    expect(summary.metrics.water).toEqual({ value: 3, count: 2 });
    expect(summary.metrics.swordmaster).toEqual({ value: 0.5, count: 2 });
    expect(summary.metrics.spice).toEqual({ value: null, count: 0 });
    expect(summary.points.count).toBe(3);
  });
  it('does not count unmeasured time as zero and validates optional breakdown', () => {
    const { game, data, profiles } = fixture(2);

    expect(playerSummary(data.archive, profiles[0].id).time).toEqual({ value: null, count: 0 });
    game.timing = {
      kind: 'summary',
      duration: null,
      players: Object.fromEntries(game.players.map((p) => [p.id, { total: 60000 }])),
    };
    expect(playerSummary(data.archive, profiles[0].id).time).toEqual({ value: 60000, count: 1 });
    game.timing.players[game.players[0].id].turns = 100;
    expect(resultProblems(game).some((s) => s.includes('сумма'))).toBe(true);
  });
});

it('round trips manual v2 without fake intervals; rejects old formats and contradictory results', () => {
  const { game } = fixture(2);

  expect(validRecord(game)).toBe(true);
  expect(parseGameFile(exportGame(game))).toEqual(game);
  expect(isManual(game)).toBe(true);
  expect('intervals' in game).toBe(false);
  const old = transition(startGame(defaultSettings(), 1), { type: 'finish' }, 100);

  expect(() =>
    parseGameFile(JSON.stringify({ app: 'dune-imperium-timer', formatVersion: 1, game: old })),
  ).toThrow('JSON v2');
  const broken: ArchivedGame = { ...game, winnerIds: [game.players[1].id] };

  expect(validRecord(broken)).toBe(false);
  expect(() =>
    parseGameFile(JSON.stringify({ app: 'dune-imperium-timer', formatVersion: 2, game: broken })),
  ).toThrow();
});
