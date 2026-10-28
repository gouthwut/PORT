# PORT// — требования к полному редизайну

Дата: 2026-10-28. Вход для отдельного дизайн-этапа после Stage 11.0.
Никакие макеты, tokens, новая дизайн-система или frontend implementation этим
документом не создаются. Связь: [blueprint](HUB_BLUEPRINT.md),
[методология совместимости](HUB_COMPATIBILITY.md).

## 1. Цель и обязательный масштаб

Полностью пересобрать информационную архитектуру, композицию страниц, навигацию,
типографическую и визуальную иерархию, систему действий и состояния web/Windows/CMS.
Смена палитры текущего лаунчера не считается полным редизайном.
PORT// должен помогать выбирать среди сотен проектов, сравнивать способы запуска,
понимать требования и доверие к загрузке, читать опыт других и управлять своей
локальной библиотекой без обязательного аккаунта.

Бренд PORT// и общая узнаваемость сохраняются; текущая dark-violet/glass композиция
не является обязательной. Не копировать RecompLauncher, его тексты, layout, artwork,
карточки или иконографию. Существующие Radix/React primitives и доступное поведение
можно сохранить. Новые визуальные tokens определяются только в отдельном design scope.

## 2. Роли и основные сценарии

1. Гость ищет конкретную игру по русскому/оригинальному названию; видит несколько
   проектов, выбирает подходящий своей ОС и понимает, что требуется собственная копия.
2. Пользователь проверяет конкретную сборку: source, digest, release date,
   platform/arch, prerelease, требования и scoped compatibility reports.
3. Читает актуальный гайд, скачивает официальный файл; никакого ложного Play/Installed
   после скачивания архива. На web локальные операции недоступны и объяснены.
4. Добавляет игру/проект в local favorites, позже по выбору входит и синхронизирует.
5. Отправляет структурированный report, видит pending/visible/needs-changes,
   исправляет контекст, получает причину moderation и может подать appeal.
6. В Windows открывает уже установленный Bloodborne/Skate, включая offline/
   unpublish/API error; управляет прежними native действиями и recovery.
7. Владелец добавляет Game/Project, анализирует GitHub, проверяет источники,
   публикует метаданные/гайды и отдельно разрешает releases; модерирует очередь.

## 3. Информационная архитектура и экраны

| Экран             | Обязательное содержание                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Discovery         | Поиск, новые/обновлённые проекты, редакционные подборки; без fake popularity/процентов                                             |
| Каталог игр       | Cover/title/origin, количество проектов, platform availability; поиск/фильтры/sort и восстановление URL состояния                  |
| Поиск проектов    | Отдельный project view, имя/автор/technology/status/platform; не дубликаты игр без объяснения                                      |
| Страница игры     | Original credits, описание, проекты и ясное сравнение, оригинальные платформы; отдельная авторизация публичного artwork            |
| Страница проекта  | Технология, upstream/разработчики/license, lifecycle, builds/releases, требования, source requirements, guides, reports/reviews    |
| Сборка/релизы     | OS/arch/channel/version/date/source/digest/provenance/approval, changelog; нельзя скрыть выбранную сборку за «Download latest»     |
| Гайд              | Numbered steps, условия/версия/платформа, dependencies, источник и last-reviewed, содержимое/якоря; stale guide предупреждение     |
| Совместимость     | Cohort controls, success definition/S/N/interval/window, hardware unknown, методология, проблемы и разделённые outcomes            |
| Отзывы            | Рейтинг отдельно от launch rate, сортировка/количество/проверенный контекст, moderation states; stars не доказательство запуска    |
| Report form       | Game/project/exact build/platform/source version/outcome, optional hardware, explicit preview, privacy; не загрузка игровых файлов |
| Favorites         | Различие game/project, local/cloud статус, unknown/deleted/unpublished entries без потери локального выбора                        |
| Профиль/аккаунт   | Минимальные публичные сведения, свои отзывы/reports, приватные настройки, sessions/logout/delete/export                            |
| Windows library   | Installed отдельно от downloaded; Play/Running/Missing/Broken, preserved profile, legacy actions и recovery priorities             |
| Windows downloads | Реальный прогресс/пауза/ошибка/проверка/источник/receipt; failed download не выглядит установленным                                |
| Settings/About    | Общая платформа, accessibility/privacy/cache/launcher updates; без брендирования одной игрой                                       |
| Owner CMS         | Games/Projects/Releases/Guides/Media rights/Moderation/Audit, draft diff, review gates, optimistic conflicts/history               |

Web navigation не содержит неработающий Play. В Windows библиотека доступна
постоянно; каталог и community не вытесняют управление существующей игрой.
Путь «предоставить ISO/TU/PKG» находится во вторичном legacy flow, не является
обязательным onboarding. Административный Builder не виден обычным игрокам.

## 4. Семантика карточек и действий

Game card показывает игру и число проектов. Project card показывает независимый
проект/автора/технологию и доступные platforms. Release action показывает выбранные
OS/arch/version и ведёт к официальному asset. Это разные уровни, их нельзя скрыть
одним универсальным полем `game` и зелёной Install кнопкой.

Оси состояний визуально независимы: lifecycle, platform availability,
PORT source approval, community outcome, local installation health.
Никакого общего «Verified» badge сразу для законности, malware, совместимости и геймплея.
У каждого badge есть понятное определение/основание/дата. Unknown остаётся unknown.

Малый N: «Недостаточно данных: 2 автора», без большой зелёной 100%.
Достаточный N: «90% · 18 из 20 · Windows x64 · [точная сборка] · 90 дней»
с доступным объяснением interval и success definition. На маленькой карточке можно
показать только «20 отчётов» вместо процента, если контекст не помещается честно.

Primary action зависит от фактической возможности: View project / Read guide /
Download official build / Open upstream / Play existing installation.
Unavailable state всегда объясняет причину: no build, unsupported OS, source
unreviewed, revoked, expired policy, no native action on web, unresolved recovery.
Не показывать действия, которые интерфейс не способен выполнить.

## 5. Требуемые состояния и качество

Для всех ключевых экранов спроектировать loading, empty, partial, stale/offline,
network/API quota error, forbidden, deleted/unpublished, conflict и retry.
Долгая операция сохраняет контекст при навигации; ошибки не заменяются фальшивым
успехом. Recovery legacy installation имеет приоритет над предложением новой загрузки.

Responsive web: 360/768/1024/1440 px; desktop: минимум 800×600 client area,
1440×900 и 200% scale. Проверять 200% text zoom, длинные русские/английские названия,
перевод без машинно обрезанных важных предупреждений. Таблицы сравнения на мобильном
адаптируются с сохранением названий полей, не требуют горизонтального scroll всей страницы.

Цель — WCAG 2.2 AA: keyboard, visible focus, корректные names/roles,
heading hierarchy, dialog focus return, live status без spam, контраст,
никакой информации только цветом/hover, reduced motion и достаточные hit areas.
Full-screen decorative motion не блокирует чтение/ввод; long lists не ломают focus.
Скриншоты не заменяют keyboard/screen-reader проверку.

Art — approved rights manifest, meaningful crop/fallback/alt text; без hotlink
трекеров и переноса private assets в публичную сборку. Пользователь не получает
редактор обложек/загрузку artwork в каталоге. CMS media rights — только owner flow.
Обложка не должна закрывать источник/платформу/важные ограничения.

Локальные benchmark цели до проверки на hardware: first list payload ≤256 KiB,
lazy media, responsive inputs, pagination без all-history fetch; desktop launch
library не ждёт network. Web CWV цели LCP≤2.5s, INP≤200ms, CLS≤0.1 на согласованном
mobile network/device profile. Это будущие цели, не уже полученные показатели.

## 6. Что должен выдать отдельный дизайн-этап

- Research/IA и task flows с точными Game/Project/Build/report сущностями.
- Инвентаризацию прежних UI handlers и всех native функций, которые нужно сохранить.
- Несколько самостоятельных визуальных направлений, выбор владельцем, затем
  полный web+Windows+CMS проект; не реализовывать новый стиль до выбора.
- High-fidelity экраны всех основных journeys, responsive варианты и все критичные
  error/offline/moderation/download/recovery states, кликабельный prototype.
- Только после выбора — visual tokens/components/states, motion/content/accessibility
  specs, artwork policy, mapping к существующим primitives и handoff реализации.
- Паритетный checklist web/native с явными различиями, приёмка пользователем и
  перечень того, что отложено. Privacy/legal wording зависит от утверждённой политики.

Дизайн готов к реализации, когда пользователь может в prototype выбрать одну игру
с двумя проектами, найти подходящую сборку, понять source requirements/доверие/
статистику, пройти гайд и report, а владелец — review/publish/moderate. Offline
установленная игра при этом остаётся доступной в Windows без входа.
Stage 11.6 начинается после отдельного согласования этих материалов.
