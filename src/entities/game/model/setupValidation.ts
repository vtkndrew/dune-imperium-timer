import { COLORS } from './engine';
import type { Player } from './types';

// A preparation constraint, deliberately separate from persisted-data validation.
export function colorConflicts(players: readonly Player[]): Record<string, Player[]> {
  const conflicts: Record<string, Player[]> = Object.create(null);

  for (const player of players) {
    const others = players.filter(
      (other) => other.id !== player.id && other.color.toLowerCase() === player.color.toLowerCase(),
    );

    if (others.length) {
      conflicts[player.id] = others;
    }
  }

  return conflicts;
}

export function nextPlayerColor(players: readonly Pick<Player, 'color'>[], count: number): string {
  const used = new Set(players.map((player) => player.color.toLowerCase()));
  const color = COLORS.slice(0, count > 4 ? 6 : 4).find((candidate) => !used.has(candidate));

  if (!color) {
    throw new Error('No available color for another player');
  }

  return color;
}
