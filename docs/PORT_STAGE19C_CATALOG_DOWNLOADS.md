# Stage 19C — каталог и загрузки PORT

2026-10-30. Локальная интеграция поверх Stage 19B; исходная HEAD этой
сессии — `a7e9945` (откат ошибочной Final Release). Отменённые коммиты,
библиотека, установка/запуск игр и persistent catalog cache не восстановлены.

## Результат

PORT — бесплатный Windows-каталог и менеджер загрузок независимых портов,
рекомпиляций, декомпиляций и runtime-проектов. Пользователь самостоятельно
использует скачанные файлы по инструкции разработчика.

- Удалены исключения `compatibility-runtime` из текущего каталога и фильтра.
  Тип, исходные платформы и целевые платформы остаются раздельными данными.
- Адаптер summary сохраняет CMS summary и targetPlatforms; summary banner
  проходит тот же immutable-media валидатор, что detail banner. Название и
  явный PORT fallback остаются при отсутствии изображения, чужие картинки
  не запрашиваются. Существующее detail-enrichment сохранено.
- Инструкции с одним notes и требования с одними notes/source теперь видны.
  Установка не выполняется. Старые тексты About/сброса/обновления PORT
  приведены к текущему продукту; игровые экраны остаются отключёнными.
- Добавлен DE: 321 строка, selector, browser/native settings validation,
  SQLite roundtrip и native dialog translation index. RU/EN/ES/FR сохранены.
  Смена языка перечитывает каталог/detail и отбрасывает устаревший результат.
- Перенос файла, SHA-256, picker, no-clobber, история и Explorer не переписаны.
  В downloader изменён только индекс немецкого перевода. QA feature,
  identity guards, release origin и CSP не изменены.

## Локализованные данные CMS

Read-only просмотр текущих `hub-model.ts` / `hub-api.ts` в соседней CMS показал:
сейчас name/summary/description/install — одноязычные поля; locale/lang query
не поддерживается. CMS не изменялась. Опубликованных локализаций не заявляем.

Клиент принимает обратно совместимое **предлагаемое расширение** текстовых
полей: прежнюю строку или словарь `ru/en/es/fr/de`. Например:

```json
{
  "description": { "en": "Project description", "de": "Projektbeschreibung" },
  "install": {
    "steps": { "en": ["Read the upstream guide"], "de": ["Anleitung lesen"] },
    "notes": "Original single-language note"
  }
}
```

Пример — описание контракта, не данные production. Для массивов текстов
поддерживаются прежние массивы и языковые словари массивов. Это касается
steps/sourceRequirements. name, game title, summary, description, specs,
notes/source, dependency name, known-issue title/details и changelog используют
тот же выбор текста. Fallback: выбранный язык → EN → RU → ES → FR → DE;
null/пустые строки пропускаются. Отсутствующие optional данные остаются пустыми;
обязательное имя без текста отвергается. Все варианты проходят исходные
ограничения длины/управляющих символов, неизвестные языковые ключи отвергаются.

Локализация не применяется к ID, URL, media, version, publishedAt, SHA-256,
размеру, approval/availability. URL и изображения сохраняют исходные проверки.
CMS должна отдельно согласовать и реализовать это расширение либо передавать
уже выбранные строки в существующем контракте. Автоперевода и lang-запросов нет.

## Реальные блокеры CMS

Анонимные GET через обычный Chromium 2026-10-30:

| Среда | Маршрут | Результат |
| --- | --- | --- |
| production | `/v2/projects?limit=100` | 401, `Требуется вход`, без ACAO |
| production | `/v2/games?limit=100` | 401, без ACAO |
| production | detail/builds для диагностического отсутствующего ID | 401, без ACAO |
| staging Stage16C | `/v2/projects?limit=100` | 200, total=0, items=[], ACAO=* |
| staging Stage16C | `/v2/games?limit=100` | 200, items=[], ACAO=* |
| staging Stage16C | detail/builds для отсутствующего ID | 404 `Проект не найден`, ACAO=* |

Production: `https://port-catalog-cms.port-catalog-cms.workers.dev`.
Staging: `https://port-catalog-cms-stage16c.port-catalog-cms.workers.dev`.
Первичный Python urllib probe получил edge 403/1010, поэтому отдельно сохранён
как ограничение этого инструмента; он не подменяет результаты Chromium/native.

Нет реального опубликованного staging проекта, по которому можно подтвердить
положительные detail/media/requirements/install/builds и официальный архив.
Ни логин игрока, ни fixture fallback, ни смена production origin не добавлены.
Права на источники/изображения и наличие файлов каждого будущего CMS проекта
также нельзя подтвердить по пустому каталогу.

## Проверки и границы доказательств

- PASS: TypeScript/Vite build; 37 уникальных адресных Playwright тестов из
  hub-api-v2, stage15, hub-downloads, stage14b-project, stage19b-release и stage19c.
  Из них 3 новых проверяют DE persistence, runtime/filter, локализованные
  инструкции/fallback, trust boundaries и notes-only disclosure. Проверены
  800×600 и 1280×720 для немецкой страницы. Это synthetic contract/browser QA.
- PASS: один адресный Rust settings roundtrip/reset с DE, cargo fmt --check,
  debug Tauri build без bundle. Полный Rust/установленный Stage19B E2E не повторён.
- Настоящий Tauri/WebView2, embedded `http://tauri.localhost/`, без dev server,
  app.port.cms-qa и свежие `.local/stage19c/app-data`: DE настройки через UI,
  production unavailable state, ноль фиктивных карточек, история реального
  неуспешного native запроса с 0 байт/path=null. Диагностическая попытка вызвана
  через IPC с явно QA-именем, поскольку каталог не даёт download CTA.
  После полного закрытия/запуска настройки и вся запись истории точно совпали.
  Нет page exceptions/горизонтального overflow при 1440×960.
- Успешная передача, picker, кириллица, cancel, retry, SHA mismatch, no-clobber,
  Explorer и completed history используют сохранённую реальную Windows-проверку
  Stage19B. Это QA ZIP; live production positive E2E всё ещё не доказан.
- Первый новый browser assertion ожидал summary после detail enrichment;
  исправлен на фактическое description. TS затем выявил абсолютные test imports;
  исправлены на используемые проектом dynamic Vite imports. Финальные проверки
  проходят. Harness close корректно обрабатывает закрытие CDP страницы.
- Осталось прежнее Vite warning >500 kB. Signing/media rights/notices/clean-machine
  gates Stage19A не закрыты этой интеграцией. Его прежний вопрос о Library scope
  решён текущим запросом: публичного игрового Library/Install/Play не будет.

Доказательства: `.local/evidence/stage19c/`; screenshots и JSON разделяют
browser API probes, настоящий native failure/restart и synthetic тесты.
QA harness/config/data — `.local/stage19c/`, не попадают в production.

Следующее практическое действие: подготовить на staging реальные разрешённые
публичные проекты/media и approved available Windows GitHub Release build,
согласовать локализованные поля, проверить положительный путь. Production
cutover требует отдельного решения владельца с существующими CMS recovery gates.
В этой сессии нет Cloudflare/CMS writes, push, release, установщика или изменений
игровых данных. Прежние dirty/untracked файлы оставлены вне коммита.
