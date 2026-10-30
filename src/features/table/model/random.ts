import { HEROES, type Player } from '@/entities/game';

export function randomIndex(length: number): number {
  if (!Number.isInteger(length) || length < 1 || length > 2 ** 32) {
    throw new RangeError('Invalid pool size');
  }

  const limit = Math.floor(2 ** 32 / length) * length;
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % length;
}

export function availableHeroes(players: Player[]) {
  const used = new Set(players.map((p) => p.heroId));

  return HEROES.filter((hero) => !used.has(hero.id));
}
