import type { Ability, Player } from './types';

export const FAQ = 'https://d19y2ttatozxjp.cloudfront.net/pdfs/DUNE_IMPERIUM_FAQ_25-1-13.pdf';
const IX =
  'https://d19y2ttatozxjp.cloudfront.net/pdfs/DUNE_IMPERIUM_RISE_OF_IX_Rulebook_22-2-11.pdf';
const BLOOD = 'https://d19y2ttatozxjp.cloudfront.net/pdfs/DUNE_IMPERIUM_BLOODLINES_Rulebook.pdf';

export type Hero = {
  id: string;
  name: string;
  english: string;
  set: 'База' | 'Икс' | 'Кровные узы';
  tip: string;
  setup?: string;
  round?: string;
  source: string;
};
export const HEROES: Hero[] = [
  {
    id: 'paul',
    name: 'Пол Атрейдес',
    english: 'Paul Atreides',
    set: 'База',
    tip: 'Просмотр верхней карты своей колоды и добор по печатке выполняются на ваших часах.',
    source: FAQ,
  },
  {
    id: 'leto',
    name: 'Герцог Лето Атрейдес',
    english: 'Duke Leto Atreides',
    set: 'База',
    tip: 'Скидка Ландсраада и выбор повышения влияния по печатке — внутри вашего хода.',
    source: FAQ,
  },
  {
    id: 'baron',
    name: 'Барон Владимир Харконнен',
    english: 'Baron Vladimir Harkonnen',
    set: 'База',
    tip: 'Когда выполнено условие «Уловки», раскройте выбранные фракции. Таймер не хранит ваш тайный выбор.',
    setup:
      'После общей подготовки тайно выберите две фракции для «Уловки». Не вводите их в приложение.',
    source: FAQ,
  },
  {
    id: 'rabban',
    name: 'Глоссу Раббан',
    english: 'Glossu Rabban',
    set: 'База',
    tip: 'Не забудьте дополнительные стартовые ресурсы и отряды. Печатка не меняет очередь.',
    source: FAQ,
  },
  {
    id: 'ilban',
    name: 'Граф Ильбан Ричез',
    english: 'Count Ilban Richese',
    set: 'База',
    tip: 'Добор за расход соляриев при отправке агента выполняется внутри вашего хода.',
    source: FAQ,
  },
  {
    id: 'helena',
    name: 'Хелена Ричез',
    english: 'Helena Richese',
    set: 'База',
    tip: 'Перед завершением раскрытия проверьте зарезервированную карту: если срок истёк и вы её не купили, уберите её по правилам.',
    source: FAQ,
  },
  {
    id: 'memnon',
    name: 'Граф Мемнон Торвальд',
    english: 'Earl Memnon Thorvald',
    set: 'База',
    tip: 'При получении места в Высшем Совете выберите фракцию для повышения влияния. Печатка даёт пряность; очередь не меняется.',
    source: FAQ,
  },
  {
    id: 'ariana',
    name: 'Графиня Ариана Торвальд',
    english: 'Countess Ariana Thorvald',
    set: 'База',
    tip: 'При сборе пряности проверьте личную способность; решение по печатке выполняйте на своих часах.',
    source: FAQ,
  },
  {
    id: 'armand',
    name: 'Эрцгерцог Арманд Эказ',
    english: 'Archduke Armand Ecaz',
    set: 'Икс',
    tip: 'Перед завершением раскрытия проверьте возможность уничтожить карту, если выполнено условие способности.',
    source: IX,
  },
  {
    id: 'ilesa',
    name: 'Илеса Эказ',
    english: 'Ilesa Ecaz',
    set: 'Икс',
    tip: 'В начале второго собственного хода верните отложенную карту. При раскрытии первым ходом добавьте её к раскрытым без бонуса.',
    round: 'Выберите одну карту из руки и отложите её лицевой стороной вниз.',
    source: IX,
  },
  {
    id: 'rhombur',
    name: 'Принц Ромбур Верниус',
    english: 'Prince Rhombur Vernius',
    set: 'Икс',
    tip: 'Выбор по печатке и эффекты технологий выполняйте в своём ходу.',
    source: IX,
  },
  {
    id: 'tessia',
    name: 'Тессия Верниус',
    english: 'Tessia Vernius',
    set: 'Икс',
    tip: 'При подготовке разместите жетоны на отметках 2 влияния. При достижении первого жетона можно сбросить карту за пряность; вне своего хода вызовите личное действие.',
    source: IX,
  },
  {
    id: 'hundro',
    name: 'Виконт Хундро Моритани',
    english: 'Viscount Hundro Moritani',
    set: 'Икс',
    tip: 'Выбор по печатке выполняйте внутри своего хода.',
    setup:
      'Посмотрите две верхние интриги, одну оставьте себе, вторую верните наверх. В эпическом режиме — после того, как все получили стартовые интриги.',
    source: IX,
  },
  {
    id: 'yuna',
    name: 'Принцесса Юна Моритани',
    english: 'Princess Yuna Moritani',
    set: 'Икс',
    tip: 'Начните без воды. Проверьте условие снижения стоимости; решения по печатке выполняйте в своём ходу.',
    source: IX,
  },
  {
    id: 'chani',
    name: 'Чани',
    english: 'Chani',
    set: 'Кровные узы',
    tip: 'Установите жетон тактики по числу игроков. При потерях/отступлении и разрешении боя применяйте награды; разные источники обрабатываются отдельно.',
    source: BLOOD,
  },
  {
    id: 'duncan',
    name: 'Дункан Айдахо',
    english: 'Duncan Idaho',
    set: 'Кровные узы',
    tip: 'По печатке можно отправить текущего агента в конфликт. Решение выполняется внутри своего хода и не даёт дополнительной очереди.',
    source: BLOOD,
  },
  {
    id: 'esmar',
    name: 'Эсмар Туэк',
    english: 'Esmar Tuek',
    set: 'Кровные узы',
    tip: 'При подготовке добавьте ситч Туэка. Во время общей подготовки проверьте накопление пряности на нём.',
    source: BLOOD,
  },
  {
    id: 'piter',
    name: 'Питер де Врийе',
    english: 'Piter De Vries',
    set: 'Кровные узы',
    tip: 'Подготовьте личную колоду. В начале каждого раунда возьмите одну личную интригу; сам добор не создаёт отдельного шага решения.',
    source: BLOOD,
  },
  {
    id: 'yrkoon',
    name: 'Навигатор Й’ркун',
    english: 'Steersman Y’rkoon',
    set: 'Кровные узы',
    tip: 'При достижении нужного влияния разыграйте следующую навигационную карту. В исходной базе не используйте карту со шпионом.',
    setup:
      'Без карты со шпионом выберите четыре навигационные карты из пяти и задайте их порядок. Проверьте особую подготовку воды и стартовой колоды.',
    source: BLOOD,
  },
  {
    id: 'kota',
    name: 'Кота Одакс с Икса',
    english: 'Kota Odax of Ix',
    set: 'Кровные узы',
    tip: 'Требуются технологии. Условные решения с технологией выполняйте на личных часах.',
    setup:
      'Посмотрите нижнюю технологию каждой из трёх стопок. Выберите одну и положите её закрытой на планшет согласно правилам лидера.',
    source: BLOOD,
  },
];

export function heroFor(id: string): Hero {
  return HEROES.find((hero) => hero.id === id) ?? HEROES[0];
}

export function heroAbility(player: Player, kind: 'setup' | 'round'): Ability | null {
  const hero = heroFor(player.heroId);
  const text = hero[kind];

  return text
    ? {
        playerId: player.id,
        title: kind === 'setup' ? 'Подготовка героя' : 'Перед началом раунда',
        text,
        optional: false,
        source: hero.source,
      }
    : null;
}
