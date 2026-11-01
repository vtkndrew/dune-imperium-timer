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
