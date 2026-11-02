import { useCallback, useState } from 'react';

import {
  COLORS,
  HEROES,
  applicableMetrics,
  compareFinish,
  changeFinalValue,
  recordTime,
  formatTime,
  heroFor,
  isManual,
  makePlayer,
  nextPlayerColor,
  resultProblems,
  suggestedRanks,
  type ArchivedGame,
  type Expansion,
  type MetricKey,
  type Player,
  type Profile,
  type ResultDraft,
} from '@/entities/game';
import {
  TrophyIcon,
  Stack,
  Button,
  Field,
  Input,
  NumberInput,
  useNumberInputValidation,
  Select,
  Checkbox,
} from '@/shared/ui';

import { ExpansionPicker, ProfilePicker } from './Choices';
import styles from './Records.module.css';

const localDate = (at: number) =>
  new Date(at - new Date(at).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// Match the stored millisecond precision without replacing the user’s decimal text.
const normalizeMinutes = (value: number) => Math.round(value * 60000) / 60000;

export function ResultEditor({
  draft,
  profiles,
  onChange,
  onSave,
  onBack,
  onDiscard,
  disabled,
}: {
  draft: ResultDraft;
  profiles: Profile[];
  onChange: (draft: ResultDraft) => void;
  onSave: () => void;
  onBack: () => void;
  onDiscard: () => void;
  disabled: boolean;
}) {
  const [choose, setChoose] = useState<number | null>(null);
  const numbers = useNumberInputValidation();
  const game = draft.game;
  const manual = isManual(game);
  const proposal = suggestedRanks(game);
  const effectiveRanks = { ...proposal.ranks, ...game.rankings };
  const sharedPlaces = [...new Set(Object.values(effectiveRanks))]
    .filter((rank) => Number.isInteger(rank) && rank >= 1 && rank <= game.players.length)
    .sort((a, b) => a - b)
    .map((rank) => ({ rank, players: game.players.filter((p) => effectiveRanks[p.id] === rank) }))
    .filter((group) => group.players.length > 1);
  const problems = resultProblems({ ...game, rankings: effectiveRanks });
  const patch = useCallback(
    (next: ArchivedGame) => onChange({ ...draft, game: next }),
    [draft, onChange],
  );
  const patchPlayer = useCallback(
    (index: number, value: Partial<Player>) =>
      patch({
        ...game,
        players: game.players.map((p, i) => (i === index ? { ...p, ...value } : p)),
      }),
    [game, patch],
  );
  const closeChoose = useCallback(() => setChoose(null), []);

  const chooseProfile = useCallback(
    (profile: { id?: string; name: string }) => {
      if (choose !== null) {
        patchPlayer(choose, { profileId: profile.id, name: profile.name });
      }
    },
    [choose, patchPlayer],
  );

  const changeExpansions = useCallback(
    (expansions: Expansion[]) => {
      const keys = applicableMetrics({ expansions }).map((f) => f.key);
      const finals = Object.fromEntries(
        Object.entries(game.finals ?? {}).map(([id, values]) => [
          id,
          Object.fromEntries(
            Object.entries(values).filter(([key]) => keys.includes(key as MetricKey)),
          ),
        ]),
      );

      patch({ ...game, expansions, finals });
    },
    [game, patch],
  );

  const changeMetric = (playerId: string, key: MetricKey, value: number | boolean | undefined) => {
    patch(changeFinalValue(game, playerId, key, value));
  };

  const changeCount = (count: number) => {
    if (!isManual(game)) {
      return;
    }

    const players = game.players.slice(0, count);

    while (players.length < count) {
      players.push({
        ...makePlayer(players.length),
        color: nextPlayerColor(players, count),
      });
    }

    const ids = new Set(players.map((p) => p.id));

    patch({
      ...game,
      players:
        count >= game.players.length
          ? players
          : players.map((p, i) =>
              COLORS.slice(0, count > 4 ? 6 : 4).includes(p.color) ? p : { ...p, color: COLORS[i] },
            ),
      finals: Object.fromEntries(Object.entries(game.finals ?? {}).filter(([id]) => ids.has(id))),
      rankings: {},
      sharedPlacesConfirmed: false,
      timing: {
        ...game.timing,
        players: Object.fromEntries(
          Object.entries(game.timing.players).filter(([id]) => ids.has(id)),
        ),
      },
    });
  };

  const changeTime = (
    playerId: string,
    key: 'total' | 'turns' | 'combat' | 'hero',
    minutes: number | undefined,
  ) => {
    if (!isManual(game)) {
      return;
    }

    const value = minutes === undefined ? undefined : Math.round(minutes * 60000);

    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 31536000000)) {
      return;
    }

    const time = { ...(game.timing.players[playerId] ?? { total: null }) };

    if (key === 'total') {
      time.total = value ?? null;
    } else if (value === undefined) {
      delete time[key];
    } else {
      time[key] = value;
    }

    patch({
      ...game,
      timing: { ...game.timing, players: { ...game.timing.players, [playerId]: time } },
    });
  };

  return (
    <Stack as="section" className={styles.editor}>
      <Button onClick={onBack}>← История</Button>
      <span className={styles.eyebrow}>
        {draft.editingId ? 'ПРАВКИ СОХРАНЯЮТСЯ В ЧЕРНОВИК' : 'ЧЕРНОВИК ИТОГОВ'}
      </span>
      <h2>{manual ? 'Добавить партию' : 'Часы остановлены.'}</h2>
      <p className={styles.hint}>
        Укажите ПО после эффектов конца игры и подтвердите места. Остальная статистика
        необязательна. Можно вернуться позже или начать новую партию.{' '}
        {draft.editingId && 'Прежние результаты действуют до подтверждения правок.'}
      </p>
      <Stack as="fieldset" disabled={disabled} className={styles.bodyFieldset}>
        {manual && (
          <div className={styles.fieldGrid}>
            <Field>
              Дата и время партии
              <Input
                type="datetime-local"
                value={localDate(game.startedAt)}
                onChange={(e) => {
                  const at = new Date(e.target.value).getTime();

                  if (Number.isFinite(at)) {
                    patch({ ...game, startedAt: at, endedAt: at + (game.timing.duration ?? 0) });
                  }
                }}
              />
            </Field>
            <Field>
              Раундов
              <NumberInput
                aria-label="Раундов"
                min={1}
                max={10000}
                required
                value={game.round}
                onValidityChange={numbers.onValidityChange}
                onValueChange={(value) => {
                  if (value !== undefined) {
                    patch({ ...game, round: value });
                  }
                }}
              />
            </Field>
            <Field>
              Участников
              <Select
                value={game.players.length}
                onChange={(e) => changeCount(Number(e.target.value))}
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </Field>
            <Field>
              Длительность партии, мин (если известна)
              <NumberInput
                aria-label="Длительность партии, мин (если известна)"
                min={0}
                max={525600}
                decimal
                normalizeValue={normalizeMinutes}
                value={game.timing.duration === null ? undefined : game.timing.duration / 60000}
                onValidityChange={numbers.onValidityChange}
                onValueChange={(value) => {
                  const duration = value === undefined ? null : Math.round(value * 60000);

                  patch({
                    ...game,
                    endedAt: game.startedAt + (duration ?? 0),
                    timing: { ...game.timing, duration },
                  });
                }}
              />
            </Field>
            <Field inline className={styles.check}>
              <Checkbox
                checked={game.timing.kind === 'none'}
                onChange={(e) =>
                  patch({
                    ...game,
                    timing: {
                      ...game.timing,
                      kind: e.target.checked ? 'none' : 'summary',
                      players: {},
                    },
                  })
                }
              />
              Без таймера
            </Field>
          </div>
        )}
        <details>
          <summary>Настройки партии — дополнения</summary>
          <ExpansionPicker value={game.expansions ?? []} onChange={changeExpansions} />
        </details>
        <div className={styles.resultPlayers}>
          {game.players.map((player, index) => (
            <Stack
              as="article"
              key={player.id}
              data-player-id={player.id}
              aria-label={`Итоги: ${player.name}`}
              className={styles.playerEditor}
            >
              <h3>{player.name}</h3>
              <p className={styles.hint}>{player.heroName}</p>
              {!manual && (
                <p className={styles.hint}>
                  Измеренное личное время: {formatTime(recordTime(game, player.id) ?? 0)}
                </p>
              )}
              <Field>
                Победные очки
                <NumberInput
                  aria-label="Победные очки"
                  min={0}
                  max={1000000}
                  required
                  value={game.finals?.[player.id]?.points as number | undefined}
                  onValidityChange={numbers.onValidityChange}
                  onValueChange={(value) => changeMetric(player.id, 'points', value)}
                />
              </Field>
              <details>
                <summary>Изменить участника и героя</summary>
                <Stack>
                  <Button
                    onClick={(e) => {
                      e.currentTarget.focus();
                      setChoose(index);
                    }}
                  >
                    Выбрать профиль: {player.name}
                  </Button>
                  <Field>
                    Герой
                    <Select
                      aria-label={`Герой ${player.name}`}
                      value={player.heroId}
                      onChange={(e) => {
                        const hero = heroFor(e.target.value);

                        patchPlayer(index, { heroId: hero.id, heroName: hero.name });
                      }}
                    >
                      {HEROES.map((hero) => (
                        <option key={hero.id} value={hero.id}>
                          {hero.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </Stack>
              </details>
              <details>
                <summary>Дополнительная статистика</summary>
                <p className={styles.hint}>
                  Заполняйте только известные значения. Пустое поле не означает ноль или «Нет».
                </p>
                <div className={styles.fieldGrid}>
                  {applicableMetrics(game)
                    .filter((field) => field.key !== 'points')
                    .map((field) => (
                      <Field key={field.key}>
                        {field.label}
                        {field.boolean ? (
                          <Select
                            aria-label={field.label}
                            value={
                              game.finals?.[player.id]?.[field.key] === undefined
                                ? ''
                                : String(game.finals?.[player.id]?.[field.key])
                            }
                            onChange={(e) =>
                              changeMetric(
                                player.id,
                                field.key,
                                e.target.value === '' ? undefined : e.target.value === 'true',
                              )
                            }
                          >
                            <option value="">Не указано</option>
                            <option value="true">Да</option>
                            <option value="false">Нет</option>
                          </Select>
                        ) : (
                          <NumberInput
                            aria-label={field.label}
                            min={0}
                            max={field.max ?? 1000000}
                            value={game.finals?.[player.id]?.[field.key] as number | undefined}
                            onValidityChange={numbers.onValidityChange}
                            onValueChange={(value) => changeMetric(player.id, field.key, value)}
                          />
                        )}
                      </Field>
                    ))}
                </div>
              </details>
              {isManual(game) && game.timing.kind === 'summary' && (
                <Stack as="fieldset">
                  <legend>Личное время</legend>
                  <Field>
                    Общий расход, мин
                    <NumberInput
                      aria-label="Общий расход, мин"
                      min={0}
                      max={525600}
                      decimal
                      normalizeValue={normalizeMinutes}
                      required
                      value={
                        game.timing.players[player.id]?.total == null
                          ? undefined
                          : Number(game.timing.players[player.id].total) / 60000
                      }
                      onValidityChange={numbers.onValidityChange}
                      onValueChange={(value) => changeTime(player.id, 'total', value)}
                    />
                  </Field>
                  <details>
                    <summary>Разбивка времени — необязательно</summary>
                    <p>
                      Если заполняете, укажите все три категории. Их сумма должна совпадать с общим
                      расходом.
                    </p>
                    <Stack>
                      {(['turns', 'combat', 'hero'] as const).map((key, i) => (
                        <Field key={key}>
                          {['Ходы и раскрытие, мин', 'Сражения, мин', 'Действия героя, мин'][i]}
                          <NumberInput
                            aria-label={
                              ['Ходы и раскрытие, мин', 'Сражения, мин', 'Действия героя, мин'][i]
                            }
                            min={0}
                            max={525600}
                            decimal
                            normalizeValue={normalizeMinutes}
                            value={
                              game.timing.players[player.id]?.[key] === undefined
                                ? undefined
                                : Number(game.timing.players[player.id][key]) / 60000
                            }
                            onValidityChange={numbers.onValidityChange}
                            onValueChange={(value) => changeTime(player.id, key, value)}
                          />
                        </Field>
                      ))}
                    </Stack>
                  </details>
                </Stack>
              )}
            </Stack>
          ))}
        </div>
        <Stack className={styles.review}>
          <h3>Итоговые места</h3>
          <p>
            Места предложены по убыванию ПО. При равных очках укажите фактический порядок.
            Дополнительная статистика не влияет на места.
          </p>
          {!proposal.ready && <p>Введите ПО всех игроков, чтобы определить места.</p>}
          {proposal.ready &&
            proposal.sorted.map((p, i) => {
              const group = proposal.unresolved.find((g) => g.includes(p.id));
              const first = group
                ? proposal.sorted.findIndex((candidate) => group.includes(candidate.id)) + 1
                : 0;

              return (
                <div className={styles.rankRow} key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {i > 0
                        ? compareFinish(game, proposal.sorted[i - 1].id, p.id).reason
                        : 'Начало итогового порядка'}
                    </small>
                  </div>
                  {group ? (
                    <Field>
                      Место
                      <Select
                        aria-label={`Место: ${p.name}`}
                        value={game.rankings?.[p.id] ?? ''}
                        onChange={(e) => {
                          const rankings = { ...game.rankings };

                          if (e.target.value) {
                            rankings[p.id] = Number(e.target.value);
                          } else {
                            delete rankings[p.id];
                          }

                          patch({ ...game, rankings, sharedPlacesConfirmed: false });
                        }}
                      >
                        <option value="">Уточните</option>
                        {Array.from({ length: group.length }, (_, offset) => first + offset).map(
                          (rank) => (
                            <option key={rank}>{rank}</option>
                          ),
                        )}
                      </Select>
                    </Field>
                  ) : (
                    <b>
                      {effectiveRanks[p.id] === 1 && <TrophyIcon />} {effectiveRanks[p.id]}
                    </b>
                  )}
                </div>
              );
            })}
          {sharedPlaces.length > 0 && (
            <>
              {sharedPlaces.map(({ rank, players }) => (
                <p key={rank}>
                  Одинаковое {rank}-е место: {players.map((p) => p.name).join(', ')}.
                </p>
              ))}
              <p>
                Если это ошибка, выберите разные места. Если партия действительно закончилась
                вничью, подтвердите результат.
              </p>
              <Field inline className={styles.check}>
                <Checkbox
                  checked={game.sharedPlacesConfirmed ?? false}
                  onChange={(e) => patch({ ...game, sharedPlacesConfirmed: e.target.checked })}
                />
                Подтверждаю ничью между указанными игроками
              </Field>
            </>
          )}
          <Field inline className={styles.check}>
            <Checkbox
              checked={game.rated === false}
              onChange={(e) => patch({ ...game, rated: !e.target.checked })}
            />
            Не учитывать в рейтинге
          </Field>
          {numbers.invalid && <p role="status">Исправьте значения в отмеченных полях.</p>}
          {problems.length > 0 && (
            <div role="status" className={styles.validation}>
              <strong>Осталось заполнить или исправить: {problems.length}</strong>
              <ul>
                {problems.slice(0, 8).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}
          <Button
            variant="primary"
            disabled={disabled || numbers.invalid || problems.length > 0}
            onClick={onSave}
          >
            Подтвердить итоги и сохранить
          </Button>
        </Stack>
      </Stack>
      <Button className={styles.discard} onClick={onDiscard} disabled={disabled}>
        Удалить черновик
      </Button>
      {choose !== null && (
        <ProfilePicker
          profiles={profiles}
          excluded={game.players.filter((_, i) => i !== choose).map((p) => p.profileId ?? '')}
          onChoose={chooseProfile}
          onClose={closeChoose}
        />
      )}
    </Stack>
  );
}
