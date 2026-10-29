# Stage 17A.1 — A / Premiere Liquid Glass

29 октября 2026. Владелец выбрал **A / Premiere** как окончательное направление.
Выполнен только локальный HTML/CSS-образец главной; внедрение в PORT отдельно.

Результат в ignored `.local/design-exploration/17a/`:

- `premiere-liquid.html` — использует существующий renderer A Home.
- `premiere-liquid.css` — отдельная тема с локальным blur и оптическими кромками.
- `screenshots/premiere-liquid-1280x720.png` — основной образец.
- `screenshots/premiere-liquid-fallback-1280x720.png` — fallback без backdrop-filter.
- `PREMIERE-LIQUID.md` — краткие CSS-токены, ограничения и проверки.
- `premiere-liquid-checks.json` — результаты проверки Chromium.

При работающем Stage 17A preview: http://127.0.0.1:1717/premiere-liquid.html.
Зависимости и сервисы не устанавливались, B/C заново не исследовались.
Проверены 1280×720, видимость обеих карточек, картинки, отсутствие горизонтального
overflow, платформенный фильтр, keyboard focus, reduced motion и принудительный
fallback; 800×600 проверен на horizontal overflow. Ошибок страницы нет.
Снимки просмотрены визуально. Это browser evidence, не native/WebView2 performance.

Исходные девять макетов, main frontend, Rust, CMS/API и данные владельца сохранены.
Тема использует существующие локальные изображения и шрифты. Игровые изображения
и образец остаются ignored/private. Изменения Git ограничены документацией.
Push/release/deploy и автоматическое продолжение не выполнялись. Этап завершён.
