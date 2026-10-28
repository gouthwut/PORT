# PORT// — модель совместимости Stage 11

Дата: 2026-10-28. Предложение policy-v1, не реализация и не текущая статистика.
Контекст: [HUB_BLUEPRINT](HUB_BLUEPRINT.md).

## 1. Что измеряем

Публичный показатель называется «Успешные запуски по отчётам пользователей».
Это доля среди добровольно присланных, допустимых и дедуплицированных отчётов,
а не вероятность запуска у случайного покупателя и не сертификация проекта.
Добровольная выборка смещена; доверительный интервал не исправляет это смещение.

Разделить четыре оси:

- project status: active/paused/archived/unknown, проверяемые источники и дата;
- editor assessment: experimental/playable и пояснение, автор/дата/основание;
- user review: субъективная оценка проекта и текст;
- compatibility observation: конкретная попытка с outcome/контекстом.

Звёзды, likes, GitHub stars/downloads, популярность карточки, exit code 0,
длительность процесса и сам факт установки не создают успешного отчёта.
PORT не утверждает, что наблюдает геймплей через Windows process API.

## 2. Контракт отчёта

Обязательные поля: server user_id, game_id, project_id, release_id и exact build_id,
asset identity/digest при известности; OS family/version, architecture,
source edition/version/update (или explicit unknown), graphics backend,
custom modifications yes/no/unknown, observed_at, outcome, structured failure stage,
short explanation. Для success нужна явная self-attestation пользователя о достигнутом
этапе. Hardware CPU/GPU/RAM/driver — optional, unknown допустим и отображается.
Не включать serials, machine ID, username или оригинальные пути в public report.

Build ID привязан к неизменяемому manifest digest. Tag `latest` и строка версии
без asset identity не доказывают одинаковую сборку. Unknown/unlisted build можно
обсуждать и отправить в review; он не попадает в exact-build headline.
Project_games проверяется сервером; нельзя написать отчёт об игре вне scope проекта.
Для сборников game_id обязателен, успешный запуск одной игры не проверяет остальные.

Outcomes:

| Значение              | Смысл                                                     | Участие в launch headline                     |
| --------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `not_attempted`       | Скачал/прочитал/отменил до попытки запуска                | Нет                                           |
| `source_setup_failed` | Не удалось подготовить собственные файлы                  | Отдельная setup метрика, не скрывать проблему |
| `launch_failed`       | Запуск попытались выполнить, playable scene не достигнута | N +1, S +0                                    |
| `menu_only`           | Дошёл до меню, gameplay не подтверждён                    | N +1, S +0                                    |
| `gameplay_started`    | Игровая сцена управляема ≥5 минут, self-report            | N +1, S +1                                    |
| `playable_session`    | Управляемая игровая сессия ≥30 минут                      | N +1, S +1; отдельная session метрика         |
| `completed`           | Пользователь заявляет прохождение                         | N +1, S +1; не «PORT verified»                |

Успех означает **переход к управляемой игре**, это уточнение всегда видно рядом
с показателем. Краш позже пяти минут не стирается: report содержит отдельно
crash_after_start, severity, elapsed bucket и playable-session outcome.
Процент длительных стабильных сессий показывается отдельно со своим определением
и знаменателем; не подменять им launch rate.

Ошибки dependencies/driver во время реальной попытки — launch_failed со stage,
они остаются в all-configurations cohort. Для documented-configuration view
можно фильтровать соответствие требованиям, но одинаково для всех outcomes;
не исключать только неудачи как «неправильный ПК».
Malformed source или отсутствие попытки — отдельный funnel, не успешный запуск.

## 3. Cohort и отсутствие ложной точности

Основной cohort: game_id + project_id + build_id + OS family + arch +
graphics backend + original edition/update + unmodified/modded state.
Дополнительные срезы: OS version, GPU family/driver, CPU/RAM buckets,
requirements adherence. Unknown — отдельное значение, не wildcard.
В default выбирать reviewed supported source edition и unmodified build,
обязательно явно показывая это условие; остальные варианты доступны в фильтрах.
Не выбирать cohort по максимальному получившемуся проценту.

Сборки Windows/Linux/macOS, Wine/Proton/native execution, prerelease/stable,
разные форки и разные original updates автоматически не смешиваются.
Cross-platform summary — таблица с отдельными строками. Если нужен roll-up,
показать состав/политику агрегации и заново дедуплицировать пользователей;
не усреднять проценты и не складывать N разных cohorts как независимые попытки.

Окно default — последние 90 дней по `observed_at`, дополнительно all-time для
этой точной сборки. Показывать период и last report. Old reports остаются в истории,
но не переносятся на новый build/driver. Для releases без свежих данных —
«Нет свежих отчётов», ссылка на исторические, а не зелёный прошлогодний процент.
Future timestamps >24 часов и submission старше 90 дней → review/historical view;
server received_at хранится отдельно, клиент не может подменить дату получения.

На карточке процент только при N≥20 независимых авторов текущего cohort,
из них не менее 10 eligible accounts возрастом ≥14 дней и без unresolved
abuse hold. При N<20 показывать «Недостаточно данных: 2 автора» и подробности,
не «100%». Это продуктовый порог, не математическая гарантия надёжности.
Малые hardware срезы (N<5) публично не детализировать для приватности.

## 4. Дедупликация и расчёт

Один активный report на `(user, game, project, exact build, OS family, arch,
source edition/update, graphics backend, mod state, hardware context)`.
Hardware context — нормализованные добровольные характеристики, не machine ID.
Редактирование меняет текущую revision этого report и сохраняет историю.
На этапе расчёта после фильтров выбирать только один последний eligible active
report автора на `(game, project, exact build, OS family, arch)`; timestamp ties
разрешать по server received_at и ID. Поэтому разные устройства/источники могут
иметь свои отчёты в подробностях, но не умножают вклад автора в broad headline.
Срез hardware/source тоже считает автора один раз среди matching active reports;
superseded revisions не воскрешаются при фильтрации. Latest правило одинаково
для successes/failures. Нельзя «улучшить процент» сотней повторов одного аккаунта.

Допустимость: authenticated author, валидный контекст, реальная заявленная попытка,
approved state, не deleted/banned/report-quarantined, внутри окна, не superseded.
Для headline account age ≥7 дней; новые reports видны после модерации, но остаются
pending-statistics до порога. Это одинаково для положительных и отрицательных.
Нет тайных весов репутации: каждый eligible автор = один голос.

Пусть N — число допустимых активных позиций после фильтров/dedup,
S — gameplay_started/playable_session/completed среди них. `p = S/N`.
Для N=0 результат null. Не использовать prior, чтобы нарисовать процент без данных.

95% Wilson interval, z=1.96:

```text
denominator = 1 + z²/N
center = (p + z²/(2N)) / denominator
half = z * sqrt(p*(1-p)/N + z²/(4N²)) / denominator
interval = [max(0, center-half), min(1, center+half)]
```

Округлять display percentage до целого, interval до целого/одного знака;
API сохраняет числовую точность и исходные S/N. Пример: **18/20 = 90%**,
Wilson примерно **70–97%**, а не обещание успеха у 90% всех пользователей.
Для 2/2 interval примерно 34–100%; headline подавлен min-N правилом.

Публичная проекция содержит cohort filters, build/digest, metric definition,
S/N/uniqueUsers, interval, time window, evidence distribution, excluded counts
по причинам, policy_version, data_revision, computed_at, freshness/abuse_hold.
Не публиковать IP risk или внутренние anti-abuse правила конкретного автора.

Изменение/moderation/delete/appeal → outbox invalidation → deterministic rebuild
из raw revisions. Source of truth — отчёты, не editable admin поле `successRate`.
Фоновые jobs idempotent; кеш привязан к policy+source revision, при лаге виден stale.
Ежедневная сверка пересчёта, контроль счётчиков и stale alerts.

## 5. Достоверность evidence и защита от накруток

Evidence tiers не являются весами:

- `self_reported`: пользователь указал контекст и явно подтвердил outcome;
- `local_context_attached`: opt-in PORT receipt подтверждает известные build digest,
  платформу и process event, но не gameplay;
- `moderator_reproduced`: модератор отдельно воспроизвёл свой результат с датой/
  устройством; это отдельный подписанный actor report, не повышение веса чужого.

Browser и native могут быть изменены пользователем. Embedded app secret и
«подпись устройства» не делают клиента доверенным. Короткоживущий server nonce,
user/build binding и one-use receipt защищают от replay, а не доказывают честность
геймплея. Отсутствие лога не запрещает отрицательный report.
Исторические owner trials не импортировать в агрегат за отсутствующих авторов.

Предлагаемые initial quotas: до 5 новых report contexts/account/day, 10 edits/day,
1 active review/project, 5 flags/day; configurable server-side с audit изменений.
Дополнительные short-window account/IP limits и progressive challenge при риске;
общая сеть/NAT сама по себе не причина удалить группу отзывов.
Возраст provider/account, burst patterns, дубликаты текста, скоординированные
cohorts и повторяющиеся receipts — сигналы review, не безошибочный detector.

При brigade: quarantined подозрительные submissions, остановка headline refresh
или пометка «Проверяем всплеск отчётов», reason/audit, ручная выборка обеих сторон,
апелляция. Не сохранять старое число как достоверное без stale/hold labels.
Репутацию не покупать, developer не модерирует собственную статистику.
Одноразовые fake accounts и coordinated real accounts нельзя полностью исключить;
об этом ограничении методологии говорить прямо.

Для общего рейтинга review: одна active оценка автора/project, показывать N и
распределение, не смешивать с совместимостью. До N≥5 — только число/тексты.
Ранжирование каталога по success rate до накопления данных выключено; даже позже
нельзя сортировать 2/2 выше 180/200 по сырому проценту.

## 6. Обязательная приёмка

Тестовые наборы: no data, 2/2, 18/20, повтор/редактирование, browser+native один
автор, несколько GPU, несколько original versions, Wine vs native, stable vs
nightly, same tag/changed digest, unknown build, menu-only, early crash, late crash,
setup failure, dependency failure, no negative logs, account age boundary,
clock/window boundary, deletion/ban/appeal, brigade hold и restart во время rebuild.

Ожидается: zero invented reports, deterministic S/N, правильная cohort isolation,
объяснимые exclusions, симметричная moderation, пересчёт после privacy удаления,
скрытый процент при min-N, отсутствие чувствительных evidence в public API.
До 11.5 это требования; реальной статистики PORT// пока нет.
