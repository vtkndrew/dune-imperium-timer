import { expect, it } from 'vitest';

import { COLORS, defaultSettings, makePlayer } from './engine';
import { colorConflicts, nextPlayerColor } from './setupValidation';
import { validSettings } from './validation';

it('reports every participant in multiple case-insensitive color conflicts without invalidating stored settings', () => {
  const settings = defaultSettings();

  settings.players = Array.from({ length: 6 }, (_, i) => makePlayer(i, 30));
  const players = settings.players;

  players[0].color = '#ABCDEF';
  players[1].color = '#abcdef';
  players[2].color = '#abcdef';
  players[4].color = players[5].color;
  const before = structuredClone(settings);
  const conflicts = colorConflicts(players);

  expect(Object.keys(conflicts).sort()).toEqual([0, 1, 2, 4, 5].map((i) => players[i].id).sort());
  expect(conflicts[players[0].id].map((p) => p.id)).toEqual([players[1].id, players[2].id]);
  expect(validSettings(settings)).toBe(true);
  expect(settings).toEqual(before);
  players.forEach((p, i) => {
    p.color = makePlayer(i, 30).color;
  });
  expect(colorConflicts(players)).toEqual({});
});

it('selects the first unused palette color regardless of case, keeping existing choices intact', () => {
  const players = [COLORS[3].toUpperCase(), COLORS[1], COLORS[0]].map((color) => ({ color }));
  const before = structuredClone(players);

  expect(nextPlayerColor(players, 4)).toBe(COLORS[2]);
  expect(players).toEqual(before);
  expect(nextPlayerColor([{ color: COLORS[1] }, { color: COLORS[1] }], 3)).toBe(COLORS[0]);
});

it('uses each newly assigned color when expanding to six participants', () => {
  const players = [COLORS[1], COLORS[3]].map((color) => ({ color }));

  for (let count = 3; count <= 6; count++) {
    players.push({ color: nextPlayerColor(players, count) });
  }

  expect(players.map((p) => p.color)).toEqual([
    COLORS[1],
    COLORS[3],
    COLORS[0],
    COLORS[2],
    COLORS[4],
    COLORS[5],
  ]);
  expect(defaultSettings().players.map((p) => p.color)).toEqual(COLORS.slice(0, 4));
});
