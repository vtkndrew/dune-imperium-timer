import { useState } from 'react';

import { HEROES, heroFor, makePlayer, validSettings, type Settings } from '@/entities/game';

import { SandChoice } from './SandChoice';
import styles from './Table.module.css';
import { availableHeroes } from '../model/random';
import { useSandChoice } from '../model/useSandChoice';

export function Setup({
  settings,
  onChange,
  onStart,
  disabled,
}: {
  settings: Settings;
  onChange: (value: Settings) => void;
  onStart: () => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  const random = useSandChoice();

  const change = (next: Settings) => {
    setDraft(next);

    if (validSettings(next)) {
      onChange({ ...next, sound: settings.sound, vibration: settings.vibration });
    }
  };

  const playerChange = (index: number, patch: Partial<Settings['players'][number]>) =>
    change({
      ...draft,
      players: draft.players.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });

  const count = (amount: number) => {
    const players = draft.players.slice(0, amount);

    while (players.length < amount) {
      players.push(makePlayer(players.length, draft.minutes));
    }

    change({ ...draft, players, first: Math.min(draft.first, amount - 1) });
  };

  const minutes = (value: number) =>
    change({
      ...draft,
      minutes: value,
      players: draft.players.map((p) => ({ ...p, initialMs: value * 60_000 })),
    });

  return (
    <section className={styles.setup}>
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
            <button
              aria-label="Убрать игрока"
              disabled={draft.players.length <= 2 || disabled}
              onClick={() => count(draft.players.length - 1)}
            >
              −
            </button>
            <b aria-label="Количество игроков">{draft.players.length}</b>
            <button
              aria-label="Добавить игрока"
              disabled={draft.players.length >= 6 || disabled}
              onClick={() => count(draft.players.length + 1)}
            >
              +
            </button>
          </div>
        </div>
        <label className={styles.timeSetting}>
          Каждому на всю партию{' '}
          <span>
            <input
              aria-label="Минут каждому"
              type="number"
              min="1"
              max="1440"
              value={draft.minutes || ''}
              onChange={(e) => minutes(Number(e.target.value))}
            />
            <span>мин</span>
          </span>
        </label>
        <div className={styles.presets}>
          {[15, 20, 30, 45, 60].map((value) => (
            <button
              key={value}
              aria-pressed={draft.minutes === value}
              onClick={() => minutes(value)}
            >
              {value} мин
            </button>
          ))}
        </div>
      </div>
      <div className={styles.sectionHeading}>
        <h3>Кто за столом</h3>
        <span>Лимит можно изменить отдельно</span>
      </div>
      <div className={styles.playerForms}>
        {draft.players.map((player, i) => (
          <fieldset key={player.id} className={styles.playerForm}>
            <legend>
              <span style={{ background: player.color }} className={styles.dot} />
              Место {i + 1}
              {draft.first === i && <span className={styles.firstBadge}>Первый</span>}
            </legend>
            <div className={styles.nameColor}>
              <input
                aria-label={`Имя игрока ${i + 1}`}
                maxLength={60}
                value={player.name}
                onChange={(e) => playerChange(i, { name: e.target.value })}
              />
              <input
                type="color"
                aria-label={`Цвет игрока ${i + 1}`}
                value={player.color}
                onChange={(e) => playerChange(i, { color: e.target.value })}
              />
            </div>
            <label>
              Герой
              <select
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
              </select>
            </label>
            <button
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
            </button>
            <label className={styles.playerMinutes}>
              Личное время{' '}
              <span>
                <input
                  aria-label={`Минут игроку ${i + 1}`}
                  type="number"
                  min="1"
                  max="1440"
                  value={player.initialMs / 60_000 || ''}
                  onChange={(e) => playerChange(i, { initialMs: Number(e.target.value) * 60_000 })}
                />{' '}
                мин
              </span>
            </label>
          </fieldset>
        ))}
      </div>
      <div className={styles.firstChoice}>
        <label>
          Первый игрок
          <select
            aria-label="Первый игрок"
            value={draft.first}
            onChange={(e) => change({ ...draft, first: Number(e.target.value) })}
          >
            {draft.players.map((p, i) => (
              <option key={p.id} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
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
        </button>
      </div>
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
      {!validSettings(draft) && <p role="alert">Укажите имена и целое число минут от 1 до 1440.</p>}
      <button
        className={`primary ${styles.start}`}
        disabled={disabled || !validSettings(draft)}
        onClick={onStart}
      >
        Начать партию <span>→</span>
      </button>
      <p className={styles.footnote}>Без регистрации · Работает офлайн после загрузки</p>
      {random.choice && <SandChoice choice={random.choice} onClose={random.cancel} />}
    </section>
  );
}
