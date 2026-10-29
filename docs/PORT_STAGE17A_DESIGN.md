# PORT// Stage 17A — design toolchain and visual concepts

29 октября 2026. Основной интерфейс не менялся. Окончательное направление
должен выбрать владелец; реализация следующего этапа не начата.

## Результат

[Страница сравнения](http://127.0.0.1:1717/review.html) открывает 9 основных
макетов: Home, Catalog и Sonic project для каждого из трёх направлений.
Дополнительно доступны и сняты страницы Zelda64Recomp.

| Вариант    | Композиция                                                                         |
| ---------- | ---------------------------------------------------------------------------------- |
| A Premiere | Панорамный hero PORT, широкие игровые карточки, фон страницы проекта на всю ширину |
| B Archive  | Тёплый графит, коллекция крупных вертикальных обложек, редакционная витрина Zelda  |
| C Focus    | Узкий sidebar, горизонтальные карточки, изображение и сведения проекта рядом       |

Материалы в `.local/design-exploration/17a/` (ignored):

- `review.html`: просмотр и выбор экранов, переключение 1280/800.
- `index.html`, `app.js`, `styles.css`, `data.json`: автономные интерактивные макеты.
- `overview-1280.jpg`, `overview-800.jpg`: матрицы всех девяти экранов.
- `screenshots/`: viewport/full-page, дополнительные Zelda, focus, components.
- `states.html`, `DESIGN-SYSTEM.md`: токены, typography, spacing, компоненты и состояния.
- `REPORT.md`: полный отчёт, источники установки, сравнение, проверки и ограничения.
- `assets-manifest.json`, `verification.json`, `narrow-verification.json`,
  `contrast.json`, `mcp-verification.json`: фактическая provenance и результаты.
- `verify.mjs`, `mcp-check.mjs`: воспроизводимая браузерная и MCP проверка.

Локальный запуск из C:/PORT:

```powershell
python -m http.server 1717 --bind 127.0.0.1 --directory .local/design-exploration/17a
```

## Окружение

Существующие Node 24.22.0, Python 3.12.10, Codex CLI 0.164.0 и Playwright test
1.64.1 сохранены. Установлены UI UX Pro Max (CLI 2.15.0), Frontend Design и
Vercel Web Design Guidelines в `.agents/skills/`. SKILL.md прочитаны, рекомендации
применены; skill-source hashes записаны в локальном skills-lock.json. Автоматическое
обнаружение новых скиллов ожидается на следующем ходе/перезапуске, hot reload не
заявляется. Дополнительно применены Ponytail и Better Icons; Lucide и шрифты
Manrope/Inter переиспользованы из установленных зависимостей/локальных assets.

Playwright MCP 0.0.83 настроен в `.codex/config.toml` для этого проекта. Реальный
stdio client успешно выполнил initialize, tools/list (25 tools), browser navigate,
resize, screenshot и close. MCP ожидал Chromium 1247, а существующий project
Playwright имел 1248: указан executable-path без установки второго браузера.
Это machine-specific локальная конфигурация; global config и другие MCP сохранены.
Установленные скиллы/config остаются локальными, без vendoring в этот docs commit.
package.json/package-lock не менялись.

Figma plugin обнаружен, но whoami вернул UNAUTHORIZED / reauthentication required.
Поэтому чтение, запись, планы/Starter permissions и создание фреймов не подтверждены;
Figma-файл не создан. Повторный OAuth вход владельца нужен для будущей работы в
Figma. Дубликат remote MCP не создавался. Платных услуг и покупок нет.

## Доказательства и пределы

Просмотрены оригинальные Home/Catalog/Project из design/references, browser и native
replay Stage 16. Изображения двух проектов взяты только из сохранённого Stage 16
CMS replay; соответствие media SHA-256 проверено. Hero A — существующая оригинальная
иллюстрация PORT с подписью. Нет новых/fake игр, рейтингов, пользователей, статистики
или совместимости. Текущая CMS/API не запрашивалась; это не fresh content verification.

PASS: 18 основных viewport + 18 full-page снимков на 1280×720/800×600; заголовки и
основные действия в первом экране, нет horizontal overflow или broken images.
Дополнительно 9 проверок на 480 px, три Zelda, три keyboard-focus, review/states.
Фильтр/URL/reload, search/empty/reset, sort, navigation, favorite UI-state,
disabled download, gallery/Escape/focus return и skip-link проверены на A/B/C.
Все normal text/link/CTA token pairs ≥6.60:1, body pairs ≥11.88:1; проверка не
покрывает каждый пиксель artwork и не является WCAG сертификацией.

После просмотра уменьшены hero/card-art A для видимости названий на Home и
перегруппированы действия C на 800. Макеты просмотрены повторно. Исходные тесты
Playwright не менялись. Native/Rust/full application suites не запускались: код
приложения не менялся. Снимки Chromium не доказывают native/DPI поведение.

React/Tauri, CMS/API, Rust downloader, library/storage/legacy и данные владельца
не тронуты. Чужие dirty/untracked файлы сохранены. Game media остаётся только в
ignored .local; Git commit содержит документацию. Push/release/deploy/installer,
реальные скачивания и установка/запуск игр не выполнялись. Остановка на выборе A/B/C.
