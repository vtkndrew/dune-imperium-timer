import { useState } from 'react';

import {
  COLORS,
  EXPANSIONS,
  cleanName,
  nameKey,
  type Expansion,
  type Profile,
} from '@/entities/game';
import { Dialog } from '@/shared/ui';

import styles from './Records.module.css';

const colorNames = ['Красный', 'Жёлтый', 'Зелёный', 'Синий', 'Голубой', 'Серый'];

export function ColorPicker({
  count,
  value,
  onChoose,
  onClose,
}: {
  count: number;
  value: string;
  onChoose: (color: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Цвет игрока" onClose={onClose}>
      <p>Можно выбрать цвет, который уже использует другой игрок.</p>
      <div className={styles.colors}>
        {COLORS.slice(0, count > 4 ? 6 : 4).map((color, index) => (
          <button
            key={color}
            aria-pressed={value === color}
            onClick={() => {
              onChoose(color);
              onClose();
            }}
          >
            <span className={styles.swatch} style={{ background: color }}>
              {value === color ? '✓' : ''}
            </span>
            {colorNames[index]}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function ProfilePicker({
  profiles,
  excluded = [],
  onChoose,
  onClose,
}: {
  profiles: Profile[];
  excluded?: string[];
  onChoose: (profile: Pick<Profile, 'name'> & { id?: string }) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const name = cleanName(search);
  const matches = profiles
    .filter((p) => nameKey(p.name).includes(nameKey(search)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const exists = profiles.some((p) => nameKey(p.name) === nameKey(name));

  return (
    <Dialog title="Выбрать игрока" onClose={onClose}>
      <label>
        Поиск или имя нового игрока
        <input
          autoFocus
          maxLength={60}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className={styles.choices}>
        {matches.map((profile) => (
          <button
            key={profile.id}
            disabled={excluded.includes(profile.id)}
            onClick={() => {
              onChoose(profile);
              onClose();
            }}
          >
            {profile.name}
            {excluded.includes(profile.id) ? ' · уже за столом' : ''}
          </button>
        ))}
      </div>
      {!profiles.length && <p>Пока нет сохранённых игроков. Введите первое имя.</p>}
      <button
        className="primary"
        disabled={!name || exists}
        onClick={() => {
          onChoose({ name });
          onClose();
        }}
      >
        Новый игрок{name ? `: ${name}` : ''}
      </button>
    </Dialog>
  );
}

export function ExpansionPicker({
  value,
  onChange,
}: {
  value: Expansion[];
  onChange: (value: Expansion[]) => void;
}) {
  return (
    <fieldset className={styles.expansions}>
      <legend>Использованные дополнения</legend>
      <small>База включена всегда. Выбор определяет поля итогов.</small>
      {EXPANSIONS.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={value.includes(item.id)}
            onChange={(e) =>
              onChange(
                e.target.checked ? [...value, item.id] : value.filter((id) => id !== item.id),
              )
            }
          />
          {item.name}
        </label>
      ))}
    </fieldset>
  );
}
