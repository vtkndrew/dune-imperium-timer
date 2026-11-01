export type Phase = 'turns' | 'combat' | 'shared';
export type Category = 'turns' | 'combat' | 'hero' | 'shared' | 'pause';
export type Player = {
  id: string;
  name: string;
  profileId?: string;
  color: string;
  heroId: string;
  heroName: string;
  initialMs: number;
};
export type Expansion = 'ix' | 'immortality' | 'bloodlines';
export type Profile = { id: string; name: string; sourceIds?: string[] };
export type Settings = {
  expansions?: Expansion[];
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
export type MetricKey =
  | 'points'
  | 'spice'
  | 'solari'
  | 'water'
  | 'troops'
  | 'emperor'
  | 'guild'
  | 'bene'
  | 'fremen'
  | 'emperorAlliance'
  | 'guildAlliance'
  | 'beneAlliance'
  | 'fremenAlliance'
  | 'swordmaster'
  | 'council'
  | 'dreadnoughts'
  | 'technologies'
  | 'chaumurky'
  | 'specimens'
  | 'research'
  | 'tleilaxu'
  | 'commanders'
  | 'garrisonCommanders';
export type FinalValues = Partial<Record<MetricKey, number | boolean>>;
export type RecordResults = {
  expansions?: Expansion[];
  finals?: Record<string, FinalValues>;
  rankings?: Record<string, number>;
  resultsConfirmed?: boolean;
  sharedPlacesConfirmed?: boolean;
  rated?: boolean;
  lastRevealOrder?: string[];
};
export type GameCore = RecordResults & {
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
export type ManualTime = { total: number | null; turns?: number; combat?: number; hero?: number };
export type ManualGame = RecordResults & {
  kind: 'manual';
  id: string;
  startedAt: number;
  updatedAt: number;
  endedAt: number;
  players: Player[];
  round: number;
  winnerIds: string[] | null;
  timing: {
    kind: 'none' | 'summary';
    duration: number | null;
    players: Record<string, ManualTime>;
  };
};
export type ArchivedGame = Game | ManualGame;
export type ArchiveEntry = { game: ArchivedGame; importedAt: number | null };
export type ResultDraft = {
  id: string;
  game: ArchivedGame;
  editingId: string | null;
  importedAt: number | null;
};
export type AppData = {
  settings: Settings;
  current: Game | null;
  archive: ArchiveEntry[];
  profiles: Profile[];
  drafts: ResultDraft[];
};
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
