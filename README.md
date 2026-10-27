# PORT//

**Знакомые миры. Новый дом.** Независимый Windows-лаунчер консольных Windows-проектов.

Tauri 2 · React · TypeScript · Rust · SQLite

![PORT Bloodborne — local artwork slots](screenshots/02a-01-home-1440.png)

## Текущий статус

Stage 02 continuation: Bloodborne — единственная игра каталога. В локальную Windows-сборку заранее упакованы hero, обложка, широкий баннер и четыре исходных игровых кадра из предоставленного архива. Работают без сети и ручного импорта. Дизайн PORT сохранён; замена оформления доступна дополнительно. Права на публичное распространение материалов не подтверждены: изображения, личная сборка и новые скриншоты исключены из Git. Чистый публичный checkout собирается с пустыми слотами. См. [локальную упаковку](docs/LOCAL_ART.md).

Кнопка установки в Windows сразу открывает один стандартный диалог с множественным выбором PKG. PORT определяет основную игру и обновление по CNT + PARAM.SFO, проверяет Title/Content ID, версии и конфликты независимо от порядка файлов. Обновление необязательно. Реальные пользовательские файлы распознаны как CUSA03173 1.00 + 1.09 с одинаковым Content ID; PFS обоих помечен как зашифрованный. Проверка метаданных не доказывает полную целостность или доступность содержимого. Исходные PKG открываются только для чтения, никуда не отправляются.

Работает существующий загрузчик закреплённого Windows-архива SuperMedo `windows-v1.9.4`: реальный прогресс/скорость, пауза/Range, отмена, SHA-256 и проверка ZIP. Скачанный архив — **ещё не установленная игра**.

**Критический блокер Stage 02C остаётся:** замена небезопасной границы записи реализована и проверена в [отдельном стенде](tools/extractor-lab/README.md), включая синтетический PFS через upstream decoder. Полный PFS/PFSC-reader ещё не проверен на ограничения памяти/обхода; автоматическое извлечение зашифрованного содержимого не поддерживается, ключи не получались и DRM не обходился. Реальная распаковка, применение 1.09, импорт подготовленной папки, установка/SQLite-библиотека и запуск **не выполнены**. Подготовленный собственный расшифрованный дамп остаётся документированным upstream-вариантом для следующей интеграции. См. [источники и оставшиеся ограничения](docs/UPSTREAM.md).

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

Дополнительно: `./scripts/test-extractor.ps1` (.NET SDK 8+) проверяет отдельный writer без зависимости приложения от .NET; опциональная проверка закреплённого upstream описана в стенде. `scripts/native-continuation.mjs` проверяет настоящий release WebView через временный loopback CDP и опциональную локальную папку PKG.

Playwright проверяет навигацию, поиск/фильтры, диалоги, пустые состояния, offline, сохранение и сброс настроек, темы и размеры. Контракт multi-picker проверяется с явно указанным mock IPC; это не нативный диалог. Это frontend-тесты; проверка настоящего окна описывается отдельно в [PROGRESS.md](PROGRESS.md). [Скриншоты](screenshots/INDEX.md) разделены на браузерные и нативные.

## Архитектура

React UI → Tauri IPC → Rust → SQLite / локальные чтения / закреплённый GitHub artifact. Каталог расширяемый, одна коллекция может содержать несколько названий и общий runtime; сейчас активна только Bloodborne. Настройки и локальное оформление хранятся отдельно в SQLite, browser preview использует явно обозначенный localStorage. Команд выполнения игровых процессов и произвольных launch-аргументов нет. Локальный стенд экстрактора отделён от приложения.

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

По документации автора нужен собственный **расшифрованный дамп Bloodborne CUSA03173**; для патчей — версия 1.09. Документирован запуск `Bloodborne.exe` с интерактивным выбором папки игры. Саму игру в PORT ещё не запускали. Проверка заголовка PKG не доказывает расшифровку, подлинность или целостность содержимого. Retail/fake автоматически не различаются; **извлечение пользовательских PKG приложением сейчас не поддерживается**.

## Roadmap

- **00 Foundation / 01 UI Prototype** — завершённая основа.
- **02 Bloodborne** — локально встроенное оформление, multi-PKG metadata inspection, загрузчик и стенд writer; безопасное декодирование пользовательских PKG и установка заблокированы.
- **03 Library / Runtime** — проверенный игровой запуск и обслуживание после установки.
- **04 Distribution** — подпись, обновления, полная release-проверка.

GitHub Actions проверяет Windows-сборку; ручной workflow Pages публикует основу страницы из docs/site после настройки Pages на GitHub Actions в репозитории. Публикация страницы не выполняется автоматически.

## Лицензии и acknowledgements

Собственный код PORT — [MIT](LICENSE). [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) и inventories содержат сведения о зависимостях. Перед публичным распространением бинарников нужно собрать полные тексты их лицензий. Благодарим Tauri, React, Radix, Tailwind, Motion, Lucide, rusqlite/SQLite и Playwright.

Значок и исторические SVG-материалы — собственные демонстрационные материалы PORT. Официальные обложки и игровые логотипы не включены в публичный Git. Личное оформление упаковывается локально с неподтверждёнными правами на распространение; такая сборка не готова к публичной публикации. Названия игр принадлежат правообладателям; PORT не связан с Sony Interactive Entertainment или FromSoftware.
