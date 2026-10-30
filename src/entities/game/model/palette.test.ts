import { expect, it } from 'vitest';

import { COLORS, defaultSettings, makePlayer, startGame, upgradeDefaultColors } from './engine';

it('upgrades only old defaults at the matching seat, without changing game snapshots', () => {
  const old = ['#a45539', '#47798a', '#697849', '#87628a', '#bb842b', '#5963a5'];
  const settings = {
    ...defaultSettings(),
    players: old.map((color, i) => ({ ...makePlayer(i), color })),
  };
  const game = startGame(settings, 1000);
  const snapshot = structuredClone(game);

  expect(upgradeDefaultColors(settings).players.map((p) => p.color)).toEqual(COLORS);
  expect(settings.players.map((p) => p.color)).toEqual(old);
  expect(game).toEqual(snapshot);
  settings.players[0].color = '#123456';
  settings.players[1].color = old[0];
  const upgraded = upgradeDefaultColors(settings);

  expect(upgraded.players.slice(0, 2)).toEqual(settings.players.slice(0, 2));
  expect(upgradeDefaultColors(upgraded)).toBe(upgraded);
});
