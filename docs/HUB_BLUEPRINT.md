# PORT// — Stage 11.0: blueprint платформы

Дата: 2026-10-28. Статус: архитектурное предложение для согласования.
Авторизация текущего запроса: исследование и документация. Stage 11.1–11.6 ниже —
план, а не разрешение на реализацию, изменение production или публичный запуск.

## 1. Решение и границы продукта

PORT// становится каталогом и сообществом независимо разработанных ПК-портов,
рекомпиляций и связанных проектов. Основной путь: найти игру → сравнить проекты →
выбрать сборку своей платформы → прочитать требования → скачать официальный
артефакт → самостоятельно подготовить собственные игровые файлы по гайду.
Windows-приложение добавляет локальную библиотеку, проверяемые загрузки и
сохранённые возможности запуска уже установленных проектов.

Три разных объекта: **игра → проект → релиз/сборка**. Один проект может охватывать
несколько игр; у одной игры могут быть несколько независимых проектов. Общий
runtime/collection из текущего PORT не равен ни игре, ни публичному проекту.

Универсальный импорт ISO/TU/PKG перестаёт быть главным сценарием и обязательным
условием карточки. Отсутствие адаптера не мешает публикации проекта, гайда или
разрешённой официальной ссылки. Скачанный ZIP не становится «установленной игрой».
Прямое скачивание не даёт автоматического права запускать EXE.

Существующие установки, профили, recovery journals и проверенные локальные действия
сохраняются. Legacy installer обслуживает ранее поддержанные сценарии; расширять
его на сотни игр в Stage 11 не нужно. Ничего не удалять ради смены навигации.

Слово «нативный» нельзя присваивать всем карточкам ради общего позиционирования:
Bloodborne bbport/shadPS4-derived execution с Vulkan translation остаётся
`compatibility-runtime`, с точным объяснением на странице проекта. Не представлять
его официальным ПК-релизом. Тип технологии, зрелость проекта, доступность сборки,
результаты пользователей и редакционная рекомендация — независимые признаки.

Связанные спецификации: [совместимость](HUB_COMPATIBILITY.md),
[требования к полному редизайну](HUB_REDESIGN_BRIEF.md).

## 2. Что реально изучено

Исходные состояния: PORT HEAD `9007a29`, CMS HEAD `d81b644`. Прочитаны AGENTS,
актуальные верхние записи PROGRESS обоих проектов, ARCHITECTURE, ROADMAP,
RECIPES, UPDATER и CMS README; рассмотрены native schema initialization,
контракты каталога, Worker routing/storage/auth, downloader/recipe boundaries,
frontend services/components и состав тестов. Это архитектурный аудит по исходникам,
не полный аудит уязвимостей, не новый замер production и не native QA.

PORT уже содержит чужую незавершённую работу: Cargo.toml/Cargo.lock,
InstalledLibrary.tsx, tests/stage04d.spec.ts и untracked shortcut/design-файлы.
CMS при начале чист. Эти изменения не являются частью Stage 11.0.
Исторические результаты PROGRESS не выдаются за повторно выполненные проверки.

### Функциональный референс

[RecompLauncher, русская точка входа](https://recomplauncher.com/?lang=ru)
прочитан 2026-10-28 через HTTPS HTML и публичные `/assets/site.js?v=72`,
`/assets/hub-ext.js?v=2`: web-reader сначала вернул ошибку; обычный HTTPS GET сработал.
HTML/JS сохранены только в ignored `.local/`. Код сайта не исполнялся для тестирования
аккаунтов; формы, скачивания, submission и чужие учётные записи не использовались.

| Наблюдение в HTML/публичном JS                                                                                  | Вывод для PORT                                                                  |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Каталог, новые проекты, charts, coming soon, фильтрация ОС/жанров/исходных платформ                             | Разделить discovery, поиск и готовность конкретной сборки                       |
| Группировка нескольких проектов одной игры, выбор ведущего проекта                                              | Нужны отдельные Game и PortProject; популярность не определяет совместимость    |
| Страница проекта с авторами, GitHub, платформами, версией, README, релизами и требованиями к собственным файлам | Разделить факт релиза, инструкцию и действие скачивания                         |
| UI feedback/play reports, сохранение, комментарии, профили и developer hub                                      | Нужны community-модель и модерация, а не добавление процентов в старую карточку |
| Ссылки на релизы разработчиков и пояснение об отсутствии игровых файлов                                         | Официальный upstream — источник бинарников; PORT не зеркало игровых данных      |

Наличие элементов в JS не доказывает работоспособность серверных функций,
защиту от накруток, юридическую чистоту каждой карточки или качество данных.
Серверная модель статистики референса не установлена. Визуальные решения,
тексты, код, каталог и artwork референса не заимствовать.

## 3. Аудит: сохранить, адаптировать, скрыть, вывести из основного пути

| Компонент и источник                                                                 | Решение                                                        | Последствие / необходимая работа                                                                                                       |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri 2/Rust shell; `src-tauri/src/main.rs`                                          | Сохранить                                                      | Идентификатор приложения/AppData и single-instance не менять при ребрендинге                                                           |
| `install.rs`, `install_inplace.rs`, `library_management.rs`, `install_experience.rs` | Сохранить как legacy lifecycle                                 | Launch/verify/remove/recovery и guards остаются доступны существующим установкам                                                       |
| SQLite `port.db`, schema 4, manifests, receipts, profiles                            | Сохранить целиком                                              | Не конвертировать регистрации в сетевые сущности и не очищать неизвестные строки                                                       |
| `download.rs`, ZIP/path/hash checks в installer/recipe                               | Переиспользовать механизмы                                     | Текущий downloader закреплён за конкретным manifest; нужен отдельный проверяемый контракт артефактов, нельзя просто подставить CMS URL |
| `catalog.rs`, `services/catalog.ts`                                                  | Адаптировать рядом с v1                                        | Новые paginated v2 DTO/cache; retain/offline семантика и разделение библиотеки сохраняются                                             |
| `docs/catalog.schema.json`, CMS `contract.ts`/копия схемы                            | Заморозить v1                                                  | Unknown fields fail closed; новые поля/URL нельзя добавлять в старый snapshot                                                          |
| `recipe.rs`, `recipe_sources.rs`, `recipe_owner.rs`; `docs/RECIPES.md`               | Убрать из главного onboarding                                  | Схемы 1/2, pins, fail-preservation и старые записи не менять; существующие ручные инструменты остаются в legacy/owner-разделе          |
| `package.rs`, `pkg_worker.rs`, `skate3.rs`, compiled adapters                        | Поддержка существующих установок                               | Не удалять и не расширять; игра в каталоге больше не требует adapterId                                                                 |
| `shortcuts.rs`, native process/operation locks                                       | Сохранить                                                      | Строгий installation ID и общий запрет конфликтующих действий; сетевые IDs не дают доступ к пути                                       |
| `updater.rs`, NSIS и signature policy                                                | Сохранить отдельным каналом                                    | Каталог/Hub не получает право обновлять PORT; production channel по-прежнему не настроен                                               |
| `InstalledLibrary`, game-state/settings/media services                               | Сохранить поведение, полностью пересобрать представление позже | Не копировать старую installer-first информационную архитектуру                                                                        |
| `src/App.tsx`, OnlineCatalog, Installer, RecipeInstall, общий CSS                    | Полный редизайн позже                                          | Сохранять проверенные handlers/доступность, не ограничиваться сменой цвета/отступов                                                    |
| Radix, React, Motion, локальные шрифты/лицензии                                      | Переиспользовать после инвентаризации                          | Это инструменты реализации, а не обязательство сохранить нынешний стиль                                                                |
| Private artwork, `media`, bundled inputs                                             | Сохранить локально                                             | Никакой автоматической публикации/переноса в web build; нужен публичный rights manifest                                                |
| CMS Worker + SQLite `CatalogStore`                                                   | Сохранить                                                      | Существующий объект, binding, таблицы и v1 namespace не пересоздавать                                                                  |
| CMS drafts/publications/current/history, immutable WebP и public_media               | Сохранить                                                      | Optimistic revisions, атомарная публикация и public/private граница — основа редакционной работы                                       |
| CMS numeric-owner OAuth, hashed sessions, CSRF/Origin                                | Сохранить владельцу                                            | Community login проектируется отдельно; обычный GitHub login никогда не означает admin                                                 |
| `src/github-analysis.ts`                                                             | Переиспользовать для предложения метаданных                    | API/upstream/inferred provenance сохраняется; новые релизы не одобряются автоматически                                                 |
| CMS vanilla JS editor + recipe-smart/owner-setup                                     | Сохранить данные, заменить основную CMS-композицию позже       | Редактор игр/проектов/гайдов/модерации становится главным; старый Builder — advanced legacy                                            |
| Playwright, Rust tests, workerd/SQLite tests                                         | Сохранить и расширять по этапам                                | Отличать mock/browser, workerd и фактическое native поведение                                                                          |

Основные разрывы: нет публичного web-клиента нового Hub, отдельных Game/Project/
Release/Build, community-аккаунтов, отзывов, отчётов, статистической политики и
модерации. CMS `sessions` сейчас не является пользовательской моделью.
`compatibility.status` v1 — редакционное поле, а не статистика реальных запусков.
Текущий v1 ограничивает JSON 1 MiB; нельзя растить единый snapshot всеми отзывами
и релизами. Сотни проектов требуют индексов, проекций и пагинации.

## 4. Целевая архитектура без переписывания репозиториев

```text
PORT repo                                  PORT-CMS repo
public web entry ─┐                        Worker API/router
shared Hub UI/DTO ├─ HTTPS /v2 ────────────> public reads / community / owner guards
Tauri app entry ──┘                              │
  │ native-only bridge                         ├─ HubStore (новый SQLite DO)
  ├─ hub.db: cache/favorites/mapping            │  catalog v2 + community + outbox
  ├─ port.db: schema 4 / existing lifecycle     ├─ CatalogStore (существующий)
  └─ local download vault                      │  v1 + owner auth + old drafts/media
                                                └─ approved official upstream HTTPS
```

Предлагается модульный монолит: один существующий Worker/backend, явные модули
catalog, releases, guides, identity, reports, moderation и audit. Новый `HubStore`
отделяет новые таблицы от старого `CatalogStore`; на первом запуске Hub один
логический объект держит catalog/community транзакции. Это стартовая стратегия,
не обещание неограниченной пропускной способности одного DO.
Чтения published projections кэшируются на edge, частные ответы никогда.

Размещение будущих исходников:

- В `C:\PORT`: shared Hub components/read-client, отдельные web/native entrypoints
  и native bridge. Публичный сайт собирается без Tauri IPC/legacy installers/секретов
  и приватного artwork. SEO: начальный HTML публичных game/project страниц из
  published projection через Worker, затем React hydration; не выдавать пустой SPA
  как окончательное решение индексации. SSR-runtime выбирается в 11.1 после spike.
- В `C:\PORT-CMS`: API, contracts, модульные storage/repositories, owner CMS,
  миграции/fixtures и public HTML rendering adapter. Admin source/privileged handlers
  не копировать в PORT и не включать в публичный web bundle.
- Контракты v2 ведутся в CMS `contracts/hub-v2/`: JSON Schema/OpenAPI и примеры.
  PORT получает версионированный generated artifact с version/hash и contract tests.
  Не использовать абсолютную `C:\PORT-CMS` import-зависимость, PAT в клиенте или
  два вручную расходящихся определения. Механизм доставки private artifact —
  build tooling, не runtime OAuth игроков и не новый репозиторий на этом этапе.

Сохраняется Workers Free + SQLite DO + static assets. R2, D1, Postgres,
Elasticsearch, WebSocket chat и отдельные микросервисы сейчас не нужны.
Все эти расширения потребуют нового решения при измеренной необходимости.
Основные изображения пока используют существующий bounded WebP storage; игровые
бинарники через Worker не проксируются и в SQL BLOB не складываются.

По [Cloudflare limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
и [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
проверенным 2026-10-28, Free имеет ограниченные daily requests/read/write и storage;
в FAQ указан 1 GB на объект Free и 5 GB на аккаунт. Раздел общей таблицы приводит
10 GB; для планирования использовать консервативный Free предел и перед внедрением
сверить account limits. Не обещать бесплатность при любом числе пользователей.

Плановые пороги: предупреждение при 60% квоты, ограничение фонового refresh при
80%, circuit breaker community writes/ingestion до исчерпания с понятной ошибкой.
Чтение последнего published snapshot и локальная библиотека должны переживать
этот режим. Измерять p95 latency, DO queue, SQL rows/request, объём данных,
ошибки и cache hit; лимит Free не обходить созданием множества объектов.
При подтверждённой очереди/росте community хранение можно вынести по projectId
через repository boundary, сохранив стабильные IDs и re-buildable projections.
Cross-DO join/транзакции заранее не предполагать.

## 5. Логическая схема данных v2

Это спецификация сущностей и ограничений, не SQL migration.
Новые ID — непрозрачные стабильные UUID; slug только URL с alias history.
UTC timestamps, optimistic `revision`, отдельные published/private состояния.

| Таблица / сущность                                      | Основные поля и ограничения                                                                                                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `games`                                                 | id, slug unique, original_title, year, original_publisher/developer, summary, publication_state; локализованные строки в `game_texts(game_id, locale)`                                                    |
| `game_aliases`, `game_origins`                          | альтернативные названия/названия поиска; исходная консоль/регион/издание; unique(game_id, origin_key)                                                                                                     |
| `projects`                                              | id, slug unique, name, implementation_kind, lifecycle_status, description, official_site, repository_id nullable, publication_state, provenance; отсутствие release допустимо                             |
| `project_games`                                         | PK(project_id, game_id), scope/coverage notes; M:N, включая сборники                                                                                                                                      |
| `developers`, `project_credits`                         | публичные имена/команды, URL, роль; не равны аккаунтам или правам редактора                                                                                                                               |
| `repositories`, `source_observations`                   | provider, numeric_repo_id unique, owner/name, verified_at, source URL, observed_at, type api/upstream/editorial/inferred; rename/transfer требует review                                                  |
| `releases`                                              | id, project_id, upstream_release_id, tag, commit, channel stable/prerelease/nightly, published_at; unique(project_id, upstream_release_id), semver nullable                                               |
| `builds`                                                | id, release_id, OS, arch, packaging, build_revision, state; immutable identity, отдельные Windows/Linux/macOS сборки                                                                                      |
| `release_assets`                                        | id, build_id, upstream_asset_id, official_url, size, sha256 nullable до проверки, digest_origin, observed_at, immutable/attestation evidence, approval_state, revoked_at, reason; замена bytes = новый ID |
| `asset_approvals`                                       | asset_id, exact reviewed digest/size/URL/repository identity, reviewer, policy_version, approved_at; approved version immutable                                                                           |
| `guides`, `guide_revisions`                             | project_id/game_id, locale, scope build/release/platform, structured blocks, content revision, sources, last_reviewed, published revision pointer; raw HTML запрещён                                      |
| `requirements`                                          | project/build scope, min/recommended/unknown OS/CPU/GPU/RAM/disk/API/dependencies; upstream/editorial source и дата; не смешивать минимальные и рекомендованные                                           |
| `source_requirements`                                   | project/build/game scope, edition/region/update, описание локально нужных файлов и официальная инструкция; никаких source-download URL для ISO/TU/PKG/ключей                                              |
| `media_assets`, `media_links`                           | hash, width/height, storage reference, rights status/license/attribution/source/permission scope, public approval; private input не даёт public rights                                                    |
| `users`, `auth_identities`                              | public handle, state, created_at; provider+provider_subject unique, минимальные private данные отдельно; неизменяемый внутренний user_id                                                                  |
| `user_sessions`, `native_grants`                        | hashes, user_id, scope, expiry, revocation, rotation; не переиспользовать owner sessions/OAuth state                                                                                                      |
| `role_grants`, `project_members`                        | owner/moderator/editor/reviewer или project-scoped contributor; сервер проверяет resource scope                                                                                                           |
| `favorites`                                             | PK(user_id, target_type, target_id), updated_at, tombstone для синхронизации; цель game или project, не installation                                                                                      |
| `reviews`, `review_revisions`                           | user_id, project_id, game_id nullable, build_id nullable, rating/text, moderation state; unique active(user_id, project_id); оценка не входит в launch rate                                               |
| `compat_reports`, `report_revisions`, `report_evidence` | контекст сборки/игры/платформы, outcome, observation time, evidence tier, revision/supersession; правила в отдельной спецификации                                                                         |
| `compat_aggregates`                                     | cohort_key, policy_version, source_revision, S/N, interval, exclusions, computed_at/window; полностью пересчитываемая проекция                                                                            |
| `moderation_cases`, `moderation_actions`, `appeals`     | target, complaint, private evidence refs, decision/reason, moderator, timestamps, appeal links; не стирать историю решения                                                                                |
| `catalog_revisions`, `published_projections`, `outbox`  | атомарный Hub publish pointer и задания на legacy projection/cache invalidation; idempotent event ID, revision, retry state                                                                               |
| `legacy_mappings`                                       | source namespace+legacy_id unique → game/project ID, reviewed attribution, unmapped reason; collectionId не переписывается                                                                                |
| `audit_events`, `migration_runs`                        | actor/action/resource/revision/result, checksum checkpoints, import counts; никаких токенов/игровых путей/исходных файлов                                                                                 |

FK и unique constraints включены на сервере; FK не обеспечивают связи между двумя
DO. Active/public состояния проверяются в одной транзакции HubStore.
Индексы: published games по slug/search-normalized title; project_games по game;
releases(project, published_at, id); builds(release, os, arch);
reports(project, game, build, platform, observed_at, id) и user-dedup;
moderation(state, created_at, id). JSON используется для bounded blocks/observations,
не вместо ключей, по которым нужны связи/фильтры.

Начальный поиск — нормализованные названия/aliases + фильтры и индексированная
проекция; FTS только после проверки возможностей SQLite DO и relevance fixtures.
Внешний поисковый сервис не является условием работы каталога.
Публикация — draft → review → published; снятие публикации tombstones публичную
проекцию, сохраняет историю и не касается локальных installation records.

## 6. API и границы полномочий

`/v1/catalog.json` и `/v1/recipes.json` остаются со старыми схемами и смыслами.
v2 — additive namespace. После миграции Hub становится единственным writer для
перенесённых опубликованных сущностей; до этого — только shadow read-model.
Не держать два независимых редактора одной публичной карточки.

| Endpoint (проектируемый)                                    | Доступ и контракт                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /v2/games?q=&origin=&genre=&cursor=&limit=`            | Anonymous published projection, allowlisted filters/sort; summaries, не вся история              |
| `GET /v2/games/{id}`, `/projects/{id}`                      | Связанные game/project IDs, credits, technology, availability, published guides                  |
| `GET /v2/projects/{id}/releases?platform=&channel=&cursor=` | Только публичные release/build records, точная идентичность; prerelease opt-in                   |
| `GET /v2/assets/{id}/download`                              | Разрешённая официальная ссылка; approved/not revoked; URL фиксирован в записи, не query redirect |
| `GET /v2/assets/{id}/manifest`                              | Версионированные download-only метаданные, native verification policy; ни команд, ни launch args |
| `GET /v2/projects/{id}/compatibility?...`                   | Полная cohort/methodology метаинформация, числа/интервал либо insufficient_data                  |
| `GET /v2/projects/{id}/reports`, `/reviews`                 | Только approved/sanitized public fields; без private evidence/IP/provider identifiers            |
| `GET/PATCH /v2/me`; `GET /v2/users/{handle}`                | Private account settings отдельно от минимального публичного профиля                             |
| `PUT/DELETE /v2/me/favorites/{type}/{id}`                   | Authenticated owner-of-resource, idempotent; anonymous local favorites возможны                  |
| `POST/PATCH /v2/reports[/{id}]`, `/reviews[/{id}]`          | Authenticated, schema/ownership/moderation/rate checks; revision conflict → 409                  |
| `POST /v2/flags`, `/v2/appeals`                             | Жалобы/апелляции с лимитами, приватная очередь; не auto-hide по числу жалоб                      |
| `POST /v2/submissions`                                      | Предложение проекта/правок → review; не публикация и не право назначить release source           |
| `/v2/admin/*`                                               | Owner/editor/moderator scopes; публикация релиза требует reviewer permission; не anonymous API   |

Общие требования: cursor привязан к filter/sort/snapshot, limit default 24/max 100;
детерминированный tie-break ID; ETag/If-None-Match, revision/asOf и stale state.
Ошибка `{code,message,requestId,retryAfter?}`; никаких stack traces/secrets.
Тексты и JSON bounded, mutation body на первом этапе ≤64 KiB, attachments отдельно
не разрешены по умолчанию. `Idempotency-Key` для создающих mutation и retries;
optimistic If-Match для правок. SQL parameters, explicit response serializers,
strict unknown-field rejection, client contract tests. Review/report text — plain
text или строго ограниченный Markdown без inline HTML и remote images.

### Авторизация

Чтение каталога, скачивание официальных артефактов и запуск локальной библиотеки
не требуют аккаунта. Вход нужен для синхронизации favorites и community writes.
Первый provider для community — отдельный GitHub OAuth flow с minimal scope;
модель identities допускает добавление других способов позже. Объяснить пользователю
эту стартовую зависимость; не смешивать вход с owner approval.

Web: отдельная secure HttpOnly session cookie, CSRF/Origin/Fetch Metadata;
private API `no-store`, точный CORS allowlist. Worker разрешает RBAC и scope,
никогда не принимает `role`/`userId` из тела как авторизацию.
Owner CMS с нынешним numeric-ID guard сохраняется; новые grants не дают обычному
community user доступ к старым `/api/*` и private media.
Public web CSP не наследует разрешение CMS на loopback owner broker; owner setup
остаётся только в авторизованном advanced-разделе, не вызывается публичными страницами.

Native: системный браузер, state + одноразовый authorization code, PKCE и
временный loopback callback с точной проверкой. Native bearer выдаёт PORT backend
после обмена, это не GitHub PAT. Refresh tokens — OS credential storage, не
SQLite/localStorage/WebView; rotation/revoke/logout all sessions. Принципы —
[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252).
Не забирать cookies действующей CMS, не встраивать client secret в desktop.
Внутренние вызовы Worker → DO идут через service binding/RPC; user/role context
создаёт только auth layer после проверки сессии. Заголовки публичного запроса
вроде `X-User-Id`/`X-Role` никогда не являются внутренней авторизацией.

## 7. Безопасность официальных скачиваний

«Официальный источник» — установленная связь проекта с конкретным numeric repository
ID/maintainer, а не просто github.com в URL. Owner утверждает источник; analyzer
предлагает release/build/asset, но не разрешает их. Не поддерживать arbitrary URL
fetch/proxy и regex `*.githubusercontent.com` как достаточное разрешение.

1. Ingestion читает bounded GitHub API/README как недоверенные данные, фиксирует
   repository/release/asset IDs, commit/tag, OS/arch, размер и provenance digest.
   HTTPS, exact hosts/redirect count, deadline, content limits. Никаких credentials
   на redirect host. Repository transfer/asset replacement — повторное review.
2. У артефакта состояния proposed → inspected → approved → revoked; отсутствие
   digest либо неподтверждённый bundled content не маскировать зелёным статусом.
   Для managed native download обязательны точные SHA-256/size, provenance,
   проверенная принадлежность источнику и review. При отсутствии GitHub digest
   владелец отдельно измеряет официальный файл; результат отмечается как
   PORT-observed, а не upstream-signed. Без pin доступна страница upstream, но
   managed download выключен с причиной.
3. Web скачивает непосредственно официальный артефакт, без зеркала/байтового proxy;
   браузерная ссылка не доказывает проверку уже полученного файла. Показать источник,
   версию, платформу, digest/provenance и отдельную ссылку release page.
4. Native скачивает в отдельный vault/temp, bounded streaming, free-space check,
   cancellation/resume с ETag/If-Range и revalidation, final actual size/hash,
   no-overwrite atomic finalize и receipt. При изменении bytes того же asset
   остановиться; не менять pin автоматически. Существующие download/path checks
   переиспользовать, но новый generic service не должен обходить старый compiled manifest.
5. Для нового download-only manifest предусмотреть PORT approval signature с
   domain separation, schema, asset/digest/size/source IDs, monotonic revision,
   expiry, key ID и min-client; compiled public trust root, anti-rollback и rotation.
   Это отдельная download-policy подпись, не Tauri updater key и не разрешение
   execute/install. Ключи сейчас не создавать; custody и storage — отдельный gate.
6. Отзыв asset запрещает новые managed downloads и показывает предупреждение;
   critical status cache TTL ≤5 минут online, explicit revoked всегда блокирует
   новую загрузку. Offline/expired policy — managed download не начинается.
   Existing local installations не удаляются/не изменяются удалённым сообщением.
7. По умолчанию сохранять архив; никакого autorun, silent setup, shell, elevation,
   commands из каталога или auto-install dependencies. Если позже нужен preview/
   extraction, только безопасный bounded ZIP engine, containment/reparse/no-overwrite
   checks и отдельное разрешение операции. Произвольные installers не исполняются.

GitHub [release assets API](https://docs.github.com/en/rest/releases/assets)
показывает asset identity/size/digest и варианты delivery. [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
могут добавлять фиксацию tag/assets и attestation. Ни SHA-256, ни подпись PORT,
ни immutable release не удостоверяют отсутствие вредоносного поведения.
ОС-защиту и Mark-of-the-Web сохранять/поддержать; не предлагать отключать Defender.
Сканирование может быть дополнительным evidence с датой, не «сертификатом безопасности».

SSR/metadata ingestion должны отвергать loopback/private/link-local IP, credentials,
недопустимые порты, redirect в запрещённую сеть и DNS rebinding; новые download
providers вводятся отдельным review. Границы описаны в
[OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

## 8. Правила контента, права и модерация

PORT не хранит/не принимает ISO, ROM, PKG, TU, DLC, BIOS/firmware, ключи, игровые
ресурсы, дампы памяти или обходы защиты. Для исходных данных — только локальная
подготовка пользователем по допустимой официальной инструкции. Не давать в гайдах
пиратских зеркал/поисковых инструкций и не считать TU «софтом порта».
Если upstream bundle содержит игровые данные или права неясны, загрузка не
одобряется до review; запись проекта может остаться информационной.

Open-source лицензия кода не разрешает распространение игровых ресурсов,
обложек и торговых марок. Проверять license на соответствующем revision,
binary notices/source obligations, third-party components отдельно. При undeclared
license не выдумывать право зеркалирования. Прямой линк также проходит review.
Private local artwork PORT не становится материалом сайта.

«У меня есть диск» не является универсальным юридическим разрешением на любую
копию/обход защиты/распространение. Для примера ограничений в США см.
[U.S. Copyright Office FAQ](https://www.copyright.gov/help/faq/faq-digital.html);
это не заключение для РФ/ЕС/других юрисдикций. До публичного community launch
нужно определить оператора, применимые страны/возрастную политику, privacy/terms,
процедуру удаления по жалобе правообладателя и юридическую проверку гайдов.

Роли: owner — политика/публикация; editor — метаданные/гайды;
release reviewer — доверенные источники/артефакты; moderator — пользовательский
контент/санкции; contributor — scoped proposals. На старте один владелец может
иметь несколько ролей, но audit фиксирует действие и причину. Developer badge
требует проверки связи с upstream; не даёт скрывать критику или переписывать rate.

Community workflow: submitted → pending → visible / needs_changes / rejected;
visible → quarantined → restored / removed. Auto-filters/rate signals могут
карантинировать, но массовые flags не делают вердикт автоматически. У отрицательных
отчётов те же требования, что у положительных. Критика проекта сама по себе допустима.
Причина и уведомление автору, private appeal, review другим модератором при наличии;
при одном owner признать отсутствие независимой апелляционной инстанции.

Запреты: harassment, PII, malware/illegal file links, impersonation, spam,
manipulated reports. Decision audit и пересчёт статистики обязательны; нельзя
удалить неудобный отчёт без следа. Запрещённые файлы не приниматься «для доказательства».
Для первых этапов — структурированные отчёты/текст без community attachments.
Позже очищенные logs — только opt-in, preview/redaction, строгие типы/размеры и private
retention. Не отсылать логи/сэмплы третьим сервисам автоматически.

Privacy default: профиль минимальный, favorites приватные, hardware optional,
никакого machine fingerprint или автопубликации локальных путей/имён.
IP risk counters — rotating keyed hash, retention 7 дней; запрещено считать HMAC
полной анонимизацией. Native nonce replay records ≤24 часов; rejected pending
content — 90 дней; evidence opt-in — 30 дней; security/moderation audit — 180 дней
с минимизацией PII. Это предлагаемые сроки, юридическая проверка может их изменить.
Удаление аккаунта отзывается немедленно, очищает PII и исключает reports из rate;
история решений сохраняет только допустимый обезличенный минимум. Backup retention
и удаление после restore описать до запуска, не обещать стирание из всех backup мгновенно.

## 9. Безопасная миграция

### 9.1 Baseline и изоляция

1. Перед реализацией зафиксировать dirty state/HEAD обоих repo без reset/stash чужой
   работы. Составить read-only inventory registrations, roots, manifests, profiles,
   journals, custom endpoint, cached/known metadata и legacy CMS drafts/media/history.
2. Для `port.db` сделать consistent SQLite backup API под согласованным lifecycle
   lock; проверить integrity и открыть backup независимо. Простое копирование `.db`
   при живом WAL не является корректным backup. Существующие sidecars/backups не удалять.
3. Отдельно экспортировать CMS данные/публикации с revision/hashes и провести restore
   rehearsal только в isolated local namespace. Не менять deployed DO migration/binding.
4. Неразрешённый installer/update/removal journal требует старого recovery flow.
   При ошибке DB/проверки миграция останавливается; не создавать пустую библиотеку
   и не восстанавливать реальные регистрации «по похожим папкам» автоматически.

### 9.2 Additive server migration

5. Создать versioned Hub migrations на fixtures. Import v1 в shadow HubStore с
   `migration_runs`/idempotency/row counts/checksums; ничего не публиковать автоматически.
   Published cards, private drafts, disabled cards и media links различать.
6. Каждой старой карточке предложить Game + Project + project_games. IDs Bloodborne/
   Skate и collection/adapter сохраняются в legacy mapping; sourceConsole остаётся
   origin, implementation переносится точно. Новый проект не получает ложного
   статуса native-port. Несколько игр/проектов не объединять только по названию.
7. `compatibility.status=verified` сохранить как dated editorial claim; создать
   **ноль** пользовательских reports. Старые owner trials/успешная установка/
   user-confirmed menu — исторические evidence, не статистическая выборка.
8. Старые recipes 1/2, revisions и published/private границы сохраняются без
   преобразования в download manifest. Runtime hash не означает legal approval.
   Sonic draft не менять автоматически; mapper может отметить manual review.
9. Media переносить references/hashes с rights state unknown/private до review.
   Unknown license/системные требования/артефакты — unknown, не догадки.
10. Owner получает diff/report импорта, конфликты и unmapped rows. Selective apply
    только reviewed mapping, без silent merge. Два повторных прогона дают те же IDs
    и zero duplicate/zero overwrite; half-import допускает restart с checkpoint.

### 9.3 Совместное существование v1 и v2

11. Пока v2 shadow — v1 остаётся source of truth. Cutover выполняется отдельно:
    freeze перенесённых legacy edits → delta import → сверка → Hub canonical.
    Legacy projection содержит только прежние допустимые поля и существующие
    authorized adapter/recipe identities; новые Hub-only проекты в v1 не экспортируются.
12. Hub publish и outbox commit — одна транзакция. Применение legacy projection
    в CatalogStore отдельно, по monotonic revision/idempotency key. Нет общей
    cross-DO транзакции: CMS показывает pending/failed legacy sync, v1 хранит старую
    валидную публикацию до успешного commit; не объявлять оба API синхронными заранее.
    Cache purge/retry и periodic reconciliation восстанавливают delivery без double publish.
13. Откат v2 — флаг маршрутизации/предыдущая published revision, не drop tables.
    После cutover не возвращать старый v1 editor в запись без reconciliation и
    разрешения owner: иначе возникнут два writer. V1 можно оставить read-only.

### 9.4 Клиентская миграция

14. Не менять `port.db` schema 4 ради Hub. Новый `hub.db` с собственным schema version:
    cache, local favorites, `installation_links(installation_id, project_id, build_id?,
provenance)`, migration checkpoints. Cache/links не источник регистрации.
    `build_id` неизвестен, если legacy version не доказывает точный asset digest.
15. AppData identity остаётся `app.port.launcher`; settings, shortcuts, receipts,
    paths и library IDs прежние. Линк по installation ID + проверенному mapping,
    не по display title. Orphan/unpublished installation видна по retained metadata.
16. Действия запуска/проверки/удаления идут в прежние native guards. Новая загрузка
    имеет download receipt в hub vault, не row в installations. Network logout,
    API failure, unpublish и account deletion не удаляют локальную библиотеку.
17. Favorites без аккаунта остаются локальными; login merge с явным выбором,
    tombstones/revision, не переписывает старые настройки. Browser localStorage
    preview не объявляется native SQLite migration.
18. Legacy install entry переносится в дополнительное действие в 11.6 после
    прохождения parity/recovery тестов; текущая задача его не скрывает.

Критерий миграции: одинаковые installation IDs/paths/version/manifests/profiles/
settings/receipts до и после, успешные schema/integrity проверки на копиях,
пройденный failure/restart/rollback, zero unintended public rows/media,
сохранение custom endpoint и возможность старого клиента читать v1. Не удалять
старый DB после «успешного» открытия нового. Реальную native проверку документировать
отдельно; сохранность нельзя доказать одним скриншотом или browser mock.

## 10. Реализация Stage 11.1–11.6

Общий порядок: 11.1 → 11.2 → 11.3 → 11.4 → 11.5 → 11.6.
Работа над отдельным дизайн-проектом может начаться после утверждения 11.0;
утверждённые макеты являются дополнительным обязательным входом в 11.6.
Ни один этап не включает production deploy по умолчанию.

### Stage 11.1 — контракты, модель и rehearsal миграции

- Зависимости: согласованный 11.0, уточнение launch jurisdiction/owner/privacy
  policy; отдельное разрешение на реализацию. Custody подписей нужно до 11.3,
  provider настройки — до реальной проверки 11.4, макеты — до 11.6.
- Deliverables: ADR по storage/auth/build boundaries; OpenAPI/JSON Schema v2,
  example payloads/errors, capability table; Hub migrations на локальных fixtures,
  idempotent v1 mapper и отчёт diff; SSR/build separation spike без production.
- Проверки: игра с двумя проектами, проект с несколькими играми, missing release,
  renamed repo/slug, unknown fields, protected old snapshot и private draft/media;
  половинный импорт/restart/повторный импорт/rollback/consistent restore.
- Приёмка: zero изменения source fixtures; те же stable mappings на повторе;
  private не попало в public; старый v1 validator принимает прежний snapshot;
  schema 4/legacy installation JSON не изменены; contract artifact воспроизводим.

### Stage 11.2 — каталог, редакционная CMS, read-only Hub API

- Зависимость: 11.1. Deliverables: Game/Project/Credits/Release metadata/Guide/
  Requirements CRUD, provenance, rights gating, preview/review/publish/history;
  local `/v2` read API, paginated search/filters, SEO public projection.
  Старый Builder и редактор v1 не удалять; запретить dual writer по imported entities.
- Проверки: publish transaction/media availability, stale revision 409,
  upstream API outage/rate limit, pagination stable snapshot, offline cache,
  unpublish/rollback, outbox crash/retry/out-of-order и user access denial.
- Приёмка: 1,000 synthetic projects с aliases/filter combinations не вызывают
  N+1/all-reviews scan; local API p95 ≤300 ms warm при 20 concurrent read requests
  на документированной машине; payload list ≤256 KiB; реальные cloud показатели
  не заявляются. Owner может добавить проект без recipe/adapter и без download.

### Stage 11.3 — official releases и проверяемые загрузки

- Зависимость: 11.2 + утверждённый custody/trust-root план (production ключи сейчас
  не создавать). Deliverables: release/build/asset review, source identity binding,
  revocation, signed download-only manifest с local test keys, native download vault
  и web official-source actions. Никакого generic launch/import через новый API.
- Проверки: changed asset при прежнем имени/tag; missing/wrong hash; oversized body;
  malicious redirects/SSRF; unsigned/expired/rollback policy; key rotation;
  cancel/resume changed ETag/disk-full/restart/no-overwrite; revoked/download race.
- Приёмка: receipt только после actual byte hash/size match; EXE не исполняется;
  archive не регистрируется installation; unknown platform не угадывается;
  отказ/ошибка не меняет legacy files/profiles. Native fixture download через
  isolated loopback отдельно от официального реального download smoke, который
  требует явного задания и разрешённых файлов. Web не заявляет native verification.

### Stage 11.4 — аккаунты, favorites, профили и каркас модерации

- Зависимость: 11.2/11.3. Deliverables: отдельный community OAuth/session flow,
  native browser PKCE flow, минимальные профили, local/cloud favorites merge,
  RBAC, audit, report/flag/appeal queues, deletion/export и rate controls.
- Проверки: identity collision/link hijack, CSRF/state/replay, refresh rotation,
  чужие favorites/отчёты, scoped role escalation, anonymous admin/private assets,
  revoked session, logout all, account delete, backup retention/restore.
- Приёмка: никакой community principal не читает owner drafts/media/session;
  native tokens вне WebView/DB; работа каталога/legacy library без входа;
  real provider evidence отдельно от provider-stub tests; privacy/terms и operator
  decisions завершены до публичного включения writes.

### Stage 11.5 — отзывы, отчёты и статистика

- Зависимость: 11.4, утверждённая policy-v1 из HUB_COMPATIBILITY.
- Deliverables: review/report forms без attachments по умолчанию, outcome/context
  validation, dedup/revisions, balanced moderation, abuse queue, deterministic
  aggregates, interval/sample/window/exclusion metadata и methodology page.
- Проверки: повторная отправка, 100 retries, разные builds/platforms/original versions,
  supersession, новые accounts/brigade, отрицательные без логов, report ban/delete/
  appeal restore, 2/2 и 18/20, expired/unknown build, aggregate crash/rebuild.
- Приёмка: процент не появляется при недостаточных данных; 18/20 даёт 90% с Wilson
  interval и полным контекстом; несколько запусков/устройств одного пользователя
  не раздувают N; old owner trial создаёт zero reports; raw-to-aggregate rebuild
  детерминирован; лаг pending aggregate ≤60 s в local workload или явный stale state.

### Stage 11.6 — полный UI rollout и сохранение desktop parity

- Зависимости: 11.2–11.5, отдельно утверждённый полный web/desktop/CMS design
  и critical journeys; 11.0 не создаёт эти макеты/дизайн-систему.
- Deliverables: новый public web и новая композиция Windows Hub, полноценные
  game/project/guide/report/profile/CMS screens, downloads/favorites/offline library,
  legacy install во вторичном пути, migration status и понятные recovery states.
- Проверки: responsive/keyboard/screen-reader/reduced-motion; locale длинные строки;
  download/error/offline/unpublish/deleted account; token isolation и web bundle scan;
  отсутствие private artwork; native first start/restart/shortcuts/launch guards,
  verify/remove isolated fixtures, schema/custom config/cache preservation.
- Приёмка: все критерии HUB_REDESIGN_BRIEF; актуальные npm/Rust/workerd/native
  проверки по затронутым областям; before/after preservation receipts; rollback
  rehearsal. Подтверждение реального запуска существующей игры — отдельное
  согласованное действие, не делать его ради UI скриншота. Код ready локально;
  production release/deploy/community activation и публичная дистрибуция требуют
  отдельного решения владельца и готовой updater/signing/legal процедуры.

## 11. Последствия, риски и решения до реализации

| Решение              | Предлагаемый default                                                           | Оставшийся gate                                                 |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Позиционирование     | Порты/рекомпиляции с точным technology label; legacy runtime проекты сохранены | Утвердить видимость compatibility-runtime в основных фильтрах   |
| Внешняя идентичность | GitHub community provider сначала, чтение без аккаунта                         | Operator/privacy/jurisdiction и provider setup                  |
| Инфраструктура       | Текущий Free Worker + новый HubStore, ограниченные writes                      | Измерить нагрузку; никаких платных upgrades автоматически       |
| Download trust       | Official source + review + byte pin + отдельная policy signature               | Secure key custody/rotation до production managed download      |
| Статистика           | Self-selected user reports, строгие cohort/window/minimum N                    | Утвердить policy и wording; не обещать реальные population odds |
| Legacy               | Сохраняем engine/data, вторичная навигация после parity                        | Никакой даты удаления без отдельного плана и разрешения         |
| Web/desktop UI       | Shared public components, разные entry/privilege boundaries                    | Полный самостоятельный redesign после 11.0                      |

Самые существенные изменения — не CSS: новая доменная идентичность и v2 API,
отделение remote content от local execution, новая account/moderation ответственность,
поддержка двух клиентских контрактов в период миграции. Сотни карточек посильны
при текущем стеке; сотни тысяч community writes требуют измерений и бюджета.

11.0 завершён как документация; функциональность, доступность production,
миграция реальных данных и безопасность реализованной будущей системы этим
документом не удостоверяются.
