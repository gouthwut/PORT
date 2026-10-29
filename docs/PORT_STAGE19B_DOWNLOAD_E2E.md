# PORT Stage 19B — Windows Download E2E

Дата завершения: 2026-10-30. Этап завершён в согласованной локальной области.
Продолжена существующая проверка; предыдущие успешные Windows E2E сохранены.
Коммит содержит только Stage 19B. Push, release и следующий этап не выполнялись.

## Изоляция и сохранение изменений

Использована ранее установленная release QA-сборка `app.port.stage19b-qa`:
`.local/stage19b/installed/port-launcher.exe`, отдельные данные
`.local/stage19b/app-data`, загрузки только внутри `.local/stage19b`.
CMS и соседние проекты не изменялись и не использовались как тестовый сервер.
Тестовый HTTP-сервер слушает только `127.0.0.1:19219`, отдаёт вымышленные
метаданные и ZIP с README и случайными байтами. Архив не запускался и не извлекался.

При возобновлении сначала проверены `git status`, полный `git diff`, сохранённые
логи и JSON. Снимок tracked diff, список всех dirty/untracked путей и исходные
Stage 19B scripts сохранены в `.local/evidence/stage19b/resume/`.
Вне коммита оставлены прежние изменения `InstalledLibrary.tsx`,
`tests/stage04d.spec.ts`, image-зависимость в Cargo.toml/Cargo.lock,
`scripts/native-shortcuts.mjs`, старые Hub-файлы и локальные инструменты/дизайн.
В смешанном Cargo.toml в индекс включена только строка feature Stage 19B.
Проверки выполнены на рабочем дереве с этими сохранёнными прежними изменениями.

## Результаты Windows E2E

| Сценарий                                      | Результат и доказательство                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZIP, системный picker, кириллица и пробелы    | Сохранён существующий успех: `picker.png`, `success.json`, `completed.png`; фактический файл в `выбранная папка/вложенная`                                       |
| Explorer                                      | Сохранены `explorer.png`, `explorer-tree.txt`; вызов раскрывает реальный конечный путь                                                                           |
| Реальный прогресс, отмена, повторная загрузка | `real-progress.json`, `cancelled.json`, `retry-completed.json` и соответствующие PNG; отмена после 40 960 байт, повторная загрузка завершена                     |
| Существующий ZIP                              | `conflict-result.json`, `conflict.png`; отмена выбора вместо перезаписи, ранее сохранённый ZIP остался неизменным                                                |
| Обрыв передачи                                | `network-error.json`: 40 960 из 524 578 байт, `error`, сообщение о прерванном соединении, `path: null`                                                           |
| Повтор после обрыва                           | `network-recovered.json`: новый ID, 524 578 байт, `completed`, фактический ZIP в QA-папке network                                                                |
| Неверный SHA-256                              | Новое `bad-hash.json` и `bad-hash.png`: получено 524 578 байт, `error`, «SHA-256 файла не совпадает с CMS», `path: null`; папка hash пуста                       |
| Удаление `.part`                              | `filesystem-history-verification.json`, `verify-evidence.mjs`: ноль `.part` во всём QA-дереве, в папке hash нет итогового ZIP                                    |
| История                                       | `history-final.json`, `history-final.png`: 8 независимых записей — 3 completed, 3 cancelled, 2 error; ошибки и отмены без конечного пути                         |
| Сохранение истории                            | Точное равенство всех 8 записей после WebView reload и полного штатного закрытия/повторного запуска: `history-reload.json`, `history-after-process-restart.json` |

Три ранее скачанных ZIP имеют размер 524 578 байт и один независимо проверенный
SHA-256: `aed092ebe0ee8a95213bb19b03bc8bdbd8e986fe8030fdb8f3746f1809ab5a78`.
Повторный старт сервера при возобновлении создал ZIP с новыми timestamp-полями;
его SHA-256 `24417ea522f08fc1d11533d4ed63e91d1f85ed9e8ca1c9b13debd786078536d4`
записан в `fixture.json`. Для bad-hash API передал 64 нуля. Эти два поколения
fixture явно разделены; прежние скачанные файлы не заменялись. Сервер теперь
повторно использует существующий fixture.zip для дальнейших локальных запусков.

При подтверждении hash-picker automation один раз вернула
`coordinate input geometry is unavailable`. После одного восстановления фокуса
свежий снимок и повторное подтверждение сработали. `hash-picker-tree.txt` и
`hash-picker.jpg` сохранены. Незавершённого сценария hash/picker не осталось;
длительные повторные попытки не потребовались.

Очистка обеспечена уже существующим `NamedTempFile`: файл фиксируется через
`persist_noclobber` только после проверки длины и SHA-256; выход по ошибке или
отмена future удаляет временный файл. История хранит каждую попытку отдельно.
Алгоритм не переписан. Это проверка штатных ошибок/отмены, а не обещание очистки
после аварийного завершения ОС или принудительного убийства процесса во время записи.

## HTTP QA физически отсутствует в production

- Модуль `download_e2e_qa` и все вызовы HTTP-подмены включаются только через
  `#[cfg(feature = "download-e2e-qa")]`; feature не входит в default.
  Обычная ветка transfer использует штатный HTTPS requester.
- QA-приложение при запуске требует точный ID `app.port.stage19b-qa`.
  Fixture-assets проходят существующую проверку approval, имени и URL до
  отображения вымышленного GitHub-пути на loopback-транспорт.
- Добавлен build-time запрет сочетания `PORT_BETA_BUILD=1` и QA feature.
  Отрицательная компиляция действительно отклонена с ожидаемым сообщением:
  `resume/forbidden-beta-feature.log`.
- Собран обычный production release без feature, с `PORT_BETA_BUILD=1`,
  штатным production-конфигом и отключённым optional PKG worker:
  `resume/production-build.log`. Новый installer не публиковался.
- `audit-production.mjs` проверил отсутствие HTTP origin и двух уникальных
  строк QA-транспорта в production EXE (ASCII и UTF-16). Все три строки найдены
  в сохранённом установленном QA EXE как положительный контроль.
  Точный SHA-256 production EXE записан в `production-audit.json`.
- Rust-тест production requester отклоняет loopback HTTP до соединения;
  localhost HTTPS также не проходит trusted-host gate. Это дополнительная
  проверка к исключению кода при компиляции, а не переключатель настройки.

## Dev API override в release

В `V2Project.tsx` добавлена такая же `import.meta.env.DEV`-граница, которая уже
была у catalog source. Production endpoint/контракт API не изменены.
При сборке явно заданы `VITE_HUB_SOURCE_JSON` с
`https://stage19b-override.invalid` и `VITE_PORT_LOCAL_CMS_QA=1`.

Playwright на release preview проверил переход из каталога на страницу проекта
и обращения обеих частей к штатному production v2 origin. Ответы в этом тесте
подменены браузерным fixture; это не проверка доступности production сервера.
Дополнительно JS сборки с dev-переменными побайтово совпал с обычной release
сборкой: `dev-override-audit.json`, `resume/override-build.log`.
Ни override origin, ни HTTP fixture origin в production JS не обнаружены.

## Проверки

| Проверка                                                                 | Результат                           |
| ------------------------------------------------------------------------ | ----------------------------------- |
| TypeScript и Vite, включая сборку с dev override                         | PASS                                |
| Playwright: hub-downloads, stage15-downloads, stage19a, stage19b-release | 17 passed                           |
| Полный Rust suite без QA feature                                         | 87 passed, 8 явно ignored, 0 failed |
| Downloader Rust suite с QA feature                                       | 10 passed                           |
| QA isolation unit test                                                   | 1 passed                            |
| Clippy all targets, `-D warnings`, без/с QA feature                      | PASS / PASS                         |
| cargo fmt --check и форматирование изменённых frontend/scripts/docs      | PASS                                |
| Negative beta + QA compilation                                           | Ожидаемый отказ подтверждён         |
| Release EXE build, binary audit, filesystem/history assertions           | PASS                                |

Исходные результаты до возобновления сохранены рядом: 86 Rust и 16 Playwright
тестов. Финальные логи находятся в `resume/`. Сохранилось прежнее предупреждение
Vite о размере JS bundle. Игнорируемые upstream/network тесты не выдаются за
выполненные; real network drop воспроизведён локальным TCP/HTTP-сервером.

## Граница завершения

Stage 19B завершён: все запрошенные локальные проверки закрыты. Существующие
production API/CORS и публичная доставка через настоящий GitHub Release не
проверены положительным живым E2E. Stage 19A rights/notices, signing/channel и
clean-machine gates остаются отдельными условиями публичной beta. Пользовательские
файлы, production AppData, игры, сохранения, CMS и дизайн не изменялись.
Автоматический переход к следующему этапу запрещён.
