# PORT//

**Знакомые миры. Новый дом.** Независимый Windows-лаунчер консольных Windows-проектов.

Tauri 2 · React · TypeScript · Rust · SQLite

![PORT Bloodborne — local artwork slots](screenshots/02a-01-home-1440.png)

## Текущий статус

Stage 02: Bloodborne — единственная игра каталога. Сохранён интерфейс PORT; добавлены подробная страница, локальный импорт отдельных hero/обложки/баннера и галереи, просмотр со стрелками и Escape. Разрешение на включение официальных изображений в публичный репозиторий не подтверждено: импортируйте материалы, которыми вправе пользоваться. Без импорта показаны подписанные пустые слоты, без сгенерированных замен.

Работают нативная проверка метаданных PS4 PKG и настоящий загрузчик закреплённого Windows-архива SuperMedo `windows-v1.9.4`: проверка релиза, прогресс/скорость, пауза, HTTP Range, отмена/повтор, SHA-256 и проверка ZIP. Игровые файлы никуда не отправляются; исходный PKG не изменяется. Скачанный архив — **ещё не установленная игра**.

**Критический блокер Stage 02C:** исследованный PKG-экстрактор не обеспечивает требуемую безопасность путей/объёма записи. PORT его не запускает. Извлечение PKG, импорт подготовленной папки, установка, регистрация игры в SQLite, запуск/проверка/удаление **ещё не реализованы**. Stage 02D не начат по условию запроса не переходить дальше критического блокера. Библиотека остаётся пустой. См. [источники и блокер](docs/UPSTREAM.md).

Настройки темы, анимаций, компактности карточек и будущей папки установки сохраняются локально в SQLite. Нативный выбор папки не устанавливает игру. Приложению не нужна сеть для просмотра каталога и изменения настроек; нет учётных записей и телеметрии.

## Запуск на Windows

Нужны Node.js 24 LTS, Rust stable с MSVC toolchain, Visual Studio C++ Build Tools / Windows SDK и Microsoft Edge WebView2. См. [официальные требования Tauri](https://v2.tauri.app/start/prerequisites/). Версии зависимостей закреплены lock-файлами.

```powershell
npm ci
npm run tauri dev
```

Сборка исполняемого приложения без установщика:

```powershell
npm run tauri build -- --no-bundle
.\src-tauri\target\release\port-launcher.exe
```

`npm run tauri build` дополнительно собирает NSIS-установщик. Локальные сборки пока не подписаны. `npm run dev` — только браузерный frontend-preview, помеченный WEB PREVIEW; он использует localStorage и не заменяет Tauri.

## Проверки

```powershell
npm run build
npm run format:check
npx playwright install chromium
npm test
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Playwright проверяет навигацию, поиск/фильтры, диалоги, пустые состояния, offline, сохранение и сброс настроек, темы и размеры. Это frontend-тесты; проверка настоящего окна описывается отдельно в [PROGRESS.md](PROGRESS.md). [Скриншоты](screenshots/INDEX.md) разделены на браузерные и нативные.

## Архитектура

React UI → Tauri IPC → Rust → SQLite / локальные чтения / закреплённый GitHub artifact. Каталог расширяемый, одна коллекция может содержать несколько названий и общий runtime; сейчас активна только Bloodborne. Настройки и локальное оформление хранятся отдельно в SQLite, browser preview использует явно обозначенный localStorage. Команд выполнения процессов и произвольных launch-аргументов нет.

```text
src/             UI, сервис настроек, доменные контракты
src-tauri/       нативное окно, SQLite, команды Rust
tests/           Playwright
screenshots/     визуальные результаты
docs/            архитектура, дизайн, исследование, страница Pages
```

Подробнее: [архитектура](docs/ARCHITECTURE.md), [дизайн](docs/DESIGN.md), [roadmap](ROADMAP.md), [contributing](CONTRIBUTING.md). Каждая новая сессия Codex сначала читает [AGENTS.md](AGENTS.md) и [PROGRESS.md](PROGRESS.md).

## Bloodborne и Windows-проект

Выбран [bloodborne_pc от SuperMedo / Mohammed Albarghouthi](https://github.com/Supermedo/bloodborne_pc), [релиз windows-v1.9.4](https://github.com/Supermedo/bloodborne_pc/releases/tag/windows-v1.9.4). Он основан на bbport/shadPS4: x86-64 код игры выполняется на CPU, графика переводится в Vulkan. Это не официальный нативный PC-релиз Bloodborne. Сравнение с Lantern Engine и лицензии — в [UPSTREAM.md](docs/UPSTREAM.md).

По документации автора нужен собственный **расшифрованный дамп Bloodborne CUSA03173**; для патчей — версия 1.09. Документирован запуск `Bloodborne.exe` с интерактивным выбором папки игры. Саму игру в PORT ещё не запускали. Проверка заголовка PKG не доказывает расшифровку, подлинность или целостность содержимого. Retail/fake автоматически не различаются; **извлечение каких-либо PKG сейчас не поддерживается**.

## Roadmap

- **00 Foundation / 01 UI Prototype** — завершённая основа.
- **02 Bloodborne** — UI, загрузчик, read-only PKG inspection; безопасное извлечение и установка заблокированы.
- **03 Library / Runtime** — проверенный игровой запуск и обслуживание после установки.
- **04 Distribution** — подпись, обновления, полная release-проверка.

GitHub Actions проверяет Windows-сборку; ручной workflow Pages публикует основу страницы из docs/site после настройки Pages на GitHub Actions в репозитории. Публикация страницы не выполняется автоматически.

## Лицензии и acknowledgements

Собственный код PORT — [MIT](LICENSE). [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) и inventories содержат сведения о зависимостях. Перед публичным распространением бинарников нужно собрать полные тексты их лицензий. Благодарим Tauri, React, Radix, Tailwind, Motion, Lucide, rusqlite/SQLite и Playwright.

Значок и исторические SVG-материалы — собственные демонстрационные материалы PORT. Официальные обложки и игровые логотипы не включены. Пользовательское оформление хранится локально. Названия игр принадлежат правообладателям; PORT не связан с Sony Interactive Entertainment или FromSoftware.
