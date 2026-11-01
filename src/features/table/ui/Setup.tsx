import { useCallback, useState } from 'react';

import {
  COLORS,
  colorConflicts,
  HEROES,
  heroFor,
  makePlayer,
  nameKey,
  validSettings,
  type Settings,
  type Profile,
} from '@/entities/game';
import {
  SandwormIcon,
  Stack,
  Button,
  Field,
  NumberInput,
  useNumberInputValidation,
  Select,
} from '@/shared/ui';

import { ColorPicker, ProfilePicker, ExpansionPicker } from './Choices';
import { SandChoice } from './SandChoice';
import styles from './Table.module.css';
import { availableHeroes } from '../model/random';
import { useSandChoice } from '../model/useSandChoice';

export function Setup({
  settings,
  profiles,
  onChange,
  onStart,
  disabled,
}: {
  settings: Settings;
  profiles: Profile[];
  onChange: (value: Settings) => void;
  onStart: () => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  const random = useSandChoice();
  const numbers = useNumberInputValidation();
  const [timeReset, setTimeReset] = useState(0);
  const [presetReset, setPresetReset] = useState(0);
  const [picker, setPicker] = useState<{ index: number; kind: 'profile' | 'color' } | null>(null);
  const unique = new Set(draft.players.map((p) => nameKey(p.name))).size === draft.players.length;
  const conflicts = colorConflicts(draft.players);
  const hasColorConflicts = Object.keys(conflicts).length > 0;
  const closePicker = useCallback(() => setPicker(null), []);

  const change = useCallback(
    (next: Settings) => {
      setDraft(next);

      if (validSettings(next)) {
        onChange({ ...next, sound: settings.sound, vibration: settings.vibration });
      }
    },
    [onChange, settings.sound, settings.vibration],
  );

  const playerChange = useCallback(
    (index: number, patch: Partial<Settings['players'][number]>) =>
      change({
        ...draft,
        players: draft.players.map((p, i) => (i === index ? { ...p, ...patch } : p)),
      }),
    [change, draft],
  );

  const count = (amount: number) => {
    const players = draft.players.slice(0, amount);

    while (players.length < amount) {
      players.push(makePlayer(players.length, draft.minutes));
    }

    const available = COLORS.slice(0, amount > 4 ? 6 : 4);
    const colored = players.map((p, i) =>
      available.includes(p.color) ? p : { ...p, color: COLORS[i] },
    );

    change({ ...draft, players: colored, first: Math.min(draft.first, amount - 1) });
  };

  const minutes = (value: number, preset = false) => {
    setTimeReset((n) => n + 1);

    if (preset) {
      setPresetReset((n) => n + 1);
    }

    change({
      ...draft,
      minutes: value,
      players: draft.players.map((p) => ({ ...p, initialMs: value * 60_000 })),
    });
  };

  const selectColor = useCallback(
    (color: string) => {
      if (picker) {
        playerChange(picker.index, { color });
      }
    },
    [picker, playerChange],
  );
  const selectProfile = useCallback(
    (profile: { id?: string; name: string }) => {
      if (picker) {
        playerChange(picker.index, { name: profile.name, profileId: profile.id });
      }
    },
    [picker, playerChange],
  );
  const changeExpansions = useCallback(
    (expansions: NonNullable<Settings['expansions']>) => change({ ...draft, expansions }),
    [change, draft],
  );

  return (
    <Stack as="section" className={styles.setup}>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>ПАРТИЯ В ВАШЕМ РИТМЕ</span>
        <h2>Время — тоже ресурс.</h2>
        <p>
          Личные часы для каждого решения.
          <br />
          От первого агента до последней интриги.
        </p>
      </div>
      <div className={styles.configuration}>
        <div className={styles.settingRow}>
          <div>
            <strong>Игроки</strong>
            <small>Порядок по часовой стрелке</small>
          </div>
          <div className={styles.stepper}>
            <Button
              aria-label="Убрать игрока"
              disabled={draft.players.length <= 2 || disabled}
              onClick={() => count(draft.players.length - 1)}
            >
              −
            </Button>
            <b aria-label="Количество игроков">{draft.players.length}</b>
            <Button
              aria-label="Добавить игрока"
              disabled={draft.players.length >= 6 || disabled}
              onClick={() => count(draft.players.length + 1)}
            >
              +
            </Button>
          </div>
        </div>
        <Field inline className={styles.timeSetting}>
          Каждому на всю партию{' '}
          <span>
            <NumberInput
              aria-label="Минут каждому"
              min={1}
              max={1440}
              required
              resetKey={presetReset}
              value={draft.minutes}
              onValidityChange={numbers.onValidityChange}
              onValueChange={(value) => {
                if (value !== undefined) {
                  minutes(value);
                }
              }}
            />
            <span>мин</span>
          </span>
        </Field>
        <div className={styles.presets}>
          {[15, 20, 30, 45, 60].map((value) => (
            <Button
              key={value}
              aria-pressed={draft.minutes === value}
              onClick={() => minutes(value, true)}
            >
              {value} мин
            </Button>
          ))}
        </div>
      </div>
      <div className={styles.sectionHeading}>
        <h3>Кто за столом</h3>
        <span>Лимит можно изменить отдельно</span>
      </div>
      <div className={styles.playerForms}>
        {draft.players.map((player, i) => (
          <Stack
            as="fieldset"
            gap={12}
            key={player.id}
            className={styles.playerForm}
            data-color-conflict={Boolean(conflicts[player.id])}
          >
            <legend>
              <span style={{ background: player.color }} className={styles.dot} />
              Место {i + 1}
              {draft.first === i && (
                <span className={styles.firstBadge}>
                  <SandwormIcon /> Первый
                </span>
              )}
            </legend>
            <div className={styles.nameColor}>
              <Button
                aria-label={`Имя игрока ${i + 1}`}
                onClick={(e) => {
                  e.currentTarget.focus();
                  setPicker({ index: i, kind: 'profile' });
                }}
              >
                {player.name} ▾
              </Button>
              <Button
                aria-label={`Цвет игрока ${i + 1}`}
                aria-describedby={conflicts[player.id] ? `color-conflict-${player.id}` : undefined}
                style={{ background: player.color, minWidth: 44, padding: 0 }}
                onClick={(e) => {
                  e.currentTarget.focus();
                  setPicker({ index: i, kind: 'color' });
                }}
              >
                <span aria-hidden="true">◇</span>
              </Button>
            </div>
            {conflicts[player.id] && (
              <p id={`color-conflict-${player.id}`} className={styles.colorError}>
                Этот цвет выбран ещё у {conflicts[player.id].map((other) => other.name).join(', ')}.
              </p>
            )}
            <Field>
              Герой
              <Select
                aria-label={`Герой игрока ${i + 1}`}
                value={player.heroId}
                onChange={(e) => {
                  const hero = heroFor(e.target.value);

                  playerChange(i, { heroId: hero.id, heroName: hero.name });
                }}
              >
                {['База', 'Икс', 'Кровные узы'].map((set) => (
                  <optgroup key={set} label={set}>
                    {HEROES.filter((hero) => hero.set === set).map((hero) => (
                      <option key={hero.id} value={hero.id}>
                        {hero.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Button
              className={styles.randomHero}
              disabled={disabled}
              onClick={(e) => {
                e.currentTarget.focus();
                const heroes = availableHeroes(draft.players);

                random.begin(
                  `Герой · ${player.name}`,
                  heroes.map((h) => h.name),
                  (index) => {
                    const hero = heroes[index];

                    playerChange(i, { heroId: hero.id, heroName: hero.name });
                  },
                );
              }}
            >
              Случайный герой
            </Button>
            <Field className={styles.playerMinutes}>
              Личное время{' '}
              <span>
                <NumberInput
                  aria-label={`Минут игроку ${i + 1}`}
                  min={1}
                  max={1440}
                  required
                  resetKey={timeReset}
                  value={player.initialMs / 60_000}
                  onValidityChange={numbers.onValidityChange}
                  onValueChange={(value) => {
                    if (value !== undefined) {
                      playerChange(i, { initialMs: value * 60_000 });
                    }
                  }}
                />{' '}
                мин
              </span>
            </Field>
          </Stack>
        ))}
      </div>
      <div className={styles.firstChoice}>
        <Field>
          Первый игрок
          <Select
            aria-label="Первый игрок"
            value={draft.first}
            onChange={(e) => change({ ...draft, first: Number(e.target.value) })}
          >
            {draft.players.map((p, i) => (
              <option key={p.id} value={i}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          disabled={disabled}
          onClick={(e) => {
            e.currentTarget.focus();
            random.begin(
              'Первый игрок',
              draft.players.map((p) => p.name),
              (first) => change({ ...draft, first }),
            );
          }}
        >
          ⚄ Случайно
        </Button>
      </div>
      <ExpansionPicker value={draft.expansions ?? []} onChange={changeExpansions} />
      <details className={styles.notes}>
        <summary>Перед началом партии</summary>
        <p>
          Разложите поле, получите начальные ресурсы и карты. После запуска таймер проведёт по
          личным решениям героев. В эпическом режиме сначала раздайте всем стартовые интриги.
        </p>
        <p>
          В наборе: база, Икс, Бессмертие и совместимые герои «Кровных уз». Для Коты нужны
          технологии. Автоматический соперник — Дом Хагаль — не поддерживается. Командные правила
          «Восстания» не учитываются.
        </p>
        {draft.players.map((p) => (
          <p key={p.id}>
            <strong>{p.heroName}:</strong> {heroFor(p.heroId).tip}
          </p>
        ))}
      </details>
      {hasColorConflicts && (
        <p role="alert">Для начала партии выберите каждому игроку отдельный цвет</p>
      )}
      {!unique && <p role="alert">Выберите разных игроков: имена должны быть уникальны.</p>}
      {!validSettings(draft) && <p role="alert">Укажите имена и целое число минут от 1 до 1440.</p>}
      <Button
        variant="primary"
        className={styles.start}
        disabled={
          disabled || numbers.invalid || !unique || hasColorConflicts || !validSettings(draft)
        }
        onClick={onStart}
      >
        Начать партию <span>→</span>
      </Button>
      <p className={styles.footnote}>Без регистрации · Работает офлайн после загрузки</p>
      {picker?.kind === 'color' && (
        <ColorPicker
          count={draft.players.length}
          value={draft.players[picker.index].color}
          onChoose={selectColor}
          onClose={closePicker}
        />
      )}
      {picker?.kind === 'profile' && (
        <ProfilePicker
          profiles={profiles}
          excluded={draft.players
            .filter((_, i) => i !== picker.index)
            .map(
              (p) =>
                profiles.find(
                  (profile) =>
                    profile.id === p.profileId || nameKey(profile.name) === nameKey(p.name),
                )?.id ?? '',
            )}
          onChoose={selectProfile}
          onClose={closePicker}
        />
      )}
      {random.choice && <SandChoice choice={random.choice} onClose={random.cancel} />}
    </Stack>
  );
}
