import { describe, expect, it } from 'vitest';

import { defaultSettings, initialData, startGame, transition } from './engine';
import {
  applicableMetrics,
  bindPlayers,
  compareFinish,
  eloHistory,
  isManual,
  manualGame,
  migrateData,
  playerSummary,
  prepareImport,
  renameProfile,
  resultProblems,
  suggestedRanks,
} from './records';
import type { AppData, ArchivedGame, FinalValues, ManualGame } from './types';
import { exportGame, parseGameFile, validData, validRecord } from './validation';

function fixture(count = 4) {
  const bound = bindPlayers([], defaultSettings().players.slice(0, count));
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

describe('profiles and migration', () => {
  it('groups names, not legacy seat IDs, without changing intervals', () => {
    const settings = defaultSettings();

    settings.players[0].name = '  Андрей  Петров ';
    const first = transition(startGame(settings, 10), { type: 'finish' }, 1000);
    const second = structuredClone(first);

    second.id = 'other-game';
    second.players[0].name = 'Борис';
    second.players[1].name = 'АНДРЕЙ   ПЕТРОВ';
    const migrated = migrateData({
      settings,
      current: null,
      archive: [
        { game: first, importedAt: null },
        { game: second, importedAt: null },
      ],
    });
    const [a, b] = migrated.archive.map((e) => e.game.players);

    expect(a[0].profileId).toBe(b[1].profileId);
    expect(a[0].profileId).not.toBe(b[0].profileId);
    expect(migrated.archive[0].game).toMatchObject({
      intervals: first.intervals,
      players: first.players.map((p) => ({ id: p.id })),
    });
    expect(validData(migrated)).toBe(true);
  });
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
  it('requires explicit values, distinguishes unknown from zero and checks exclusivity', () => {
    const { game } = fixture(2);

    expect(resultProblems(game)).toEqual([]);
    const id = game.players[0].id;

    delete game.finals?.[id]?.water;
    expect(resultProblems(game).some((s) => s.includes('Вода'))).toBe(true);
    (game.finals as Record<string, FinalValues>)[id].water = 0;
    expect(resultProblems(game)).toEqual([]);

    for (const values of Object.values(game.finals ?? {})) {
      values.emperorAlliance = true;
    }

    expect(resultProblems(game).some((s) => s.includes('Несколько владельцев'))).toBe(true);
  });
  it.each(['points', 'spice', 'solari', 'water', 'troops'] as const)(
    'compares %s in the rule hierarchy',
    (key) => {
      const { game } = fixture(2);
      const [a, b] = game.players.map((p) => p.id);

      game.finals = { [a]: {}, [b]: {} };
      game.finals[a][key] = 1;
      expect(compareFinish(game, a, b).order).toBeLessThan(0);
      expect(suggestedRanks(game).ranks).toEqual({ [a]: 1, [b]: 2 });
    },
  );
  it('handles Chaumurky, commanders, late reveal and unknown reveal without inventing a draw', () => {
    const { game } = fixture(2);
    const [a, b] = game.players.map((p) => p.id);

    game.expansions = ['ix', 'bloodlines'];
    game.finals = { [a]: { chaumurky: true }, [b]: { spice: 100, dreadnoughts: 2 } };
    expect(compareFinish(game, a, b).reason).toBe('Chaumurky');
    game.finals = { [a]: { garrisonCommanders: 1 }, [b]: { dreadnoughts: 2 } };
    expect(compareFinish(game, a, b).order).toBeLessThan(0);
    game.finals = { [a]: {}, [b]: {} };
    expect(suggestedRanks(game).unresolved).toEqual([[a, b]]);
    game.lastRevealOrder = [a, b];
    expect(suggestedRanks(game).ranks).toEqual({ [a]: 2, [b]: 1 });
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
    game.rankings = { [a]: 1, [b]: 1 };
    game.winnerIds = [a, b];
    expect(resultProblems(game)).toContain('Подтвердите совместное место явно.');
    game.sharedPlacesConfirmed = true;
    expect(resultProblems(game)).toEqual([]);
    expect(eloHistory(data.archive, profiles).ratings[profiles[0].id]).toBe(1000);
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

it('round trips manual v2 without fake intervals; reads v1; rejects contradictory results', () => {
  const { game } = fixture(2);

  expect(validRecord(game)).toBe(true);
  expect(parseGameFile(exportGame(game))).toEqual(game);
  expect(isManual(game)).toBe(true);
  expect('intervals' in game).toBe(false);
  const old = transition(startGame(defaultSettings(), 1), { type: 'finish' }, 100);

  expect(
    parseGameFile(JSON.stringify({ app: 'dune-imperium-timer', formatVersion: 1, game: old })),
  ).toEqual(old);
  const broken: ArchivedGame = { ...game, winnerIds: [game.players[1].id] };

  expect(validRecord(broken)).toBe(false);
  expect(() =>
    parseGameFile(JSON.stringify({ app: 'dune-imperium-timer', formatVersion: 2, game: broken })),
  ).toThrow();
});
