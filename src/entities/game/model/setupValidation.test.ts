import { expect, it } from 'vitest';

import { defaultSettings, makePlayer } from './engine';
import { colorConflicts } from './setupValidation';
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
