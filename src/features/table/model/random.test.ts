import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultSettings, HEROES } from '@/entities/game';

import { availableHeroes, randomIndex } from './random';

afterEach(() => vi.restoreAllMocks());
describe('random choice', () => {
  it('rejects the biased tail and keeps every index reachable', () => {
    const mock = vi.spyOn(crypto, 'getRandomValues');

    for (let index = 0; index < 6; index += 1) {
      mock.mockImplementationOnce((array: any) => {
        array[0] = 4294967295;

        return array;
      });
      mock.mockImplementationOnce((array: any) => {
        array[0] = index;

        return array;
      });
      expect(randomIndex(6)).toBe(index);
    }

    expect(mock).toHaveBeenCalledTimes(12);
    expect(() => randomIndex(0)).toThrow(RangeError);
  });
  it('excludes the current hero and heroes of every other participant', () => {
    const players = defaultSettings().players;
    const available = availableHeroes(players);

    expect(available).toHaveLength(HEROES.length - players.length);
    expect(available.every((h) => players.every((p) => p.heroId !== h.id))).toBe(true);
  });
});

it('uses all fifty distinct end phrases before repeating', async () => {
  const { nextSandPhrase, SAND_PHRASES } = await import('./sandPhrases');

  expect(SAND_PHRASES).toHaveLength(50);
  expect(new Set(SAND_PHRASES).size).toBe(50);
  const batch = Array.from({ length: 50 }, nextSandPhrase);

  expect(new Set(batch).size).toBe(50);
  expect(nextSandPhrase()).not.toBe(batch.at(-1));
});
