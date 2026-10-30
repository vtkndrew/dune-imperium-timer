export type Phase = 'turns' | 'combat' | 'shared';
export type Category = 'turns' | 'combat' | 'hero' | 'shared' | 'pause';
export type Player = {
  id: string;
  name: string;
  color: string;
  heroId: string;
  heroName: string;
  initialMs: number;
};
export type Settings = {
  players: Player[];
  first: number;
  minutes: number;
  sound: boolean;
  vibration: boolean;
};
export type Ability = {
  playerId: string;
  title: string;
  text: string;
  optional: boolean;
  source: string;
};
export type Interval = {
  start: number;
  end: number;
  owner: string | null;
  category: Category;
  round: number;
};
export type Adjustment = { playerId: string; at: number; deltaMs: number };
export type GameCore = {
  id: string;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  players: Player[];
  first: number;
  active: number;
  round: number;
  phase: Phase;
  revealed: string[];
  turns: Record<string, number>;
  passes: number;
  paused: boolean;
  queue: Ability[];
  clockAt: number;
  intervals: Interval[];
  adjustments: Adjustment[];
  winnerIds: string[] | null;
};
export type Game = GameCore & { undo: GameCore | null };
export type ArchiveEntry = { game: Game; importedAt: number | null };
export type AppData = { settings: Settings; current: Game | null; archive: ArchiveEntry[] };
export type Command =
  | {
      type:
        | 'next'
        | 'reveal'
        | 'pass'
        | 'combat-action'
        | 'next-round'
        | 'pause'
        | 'resume'
        | 'ability-done'
        | 'undo'
        | 'finish';
    }
  | { type: 'ability'; playerId: string }
  | { type: 'adjust'; playerId: string; deltaMs: number };
