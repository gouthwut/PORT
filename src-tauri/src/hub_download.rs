//! One approved CMS release asset; no installer, extraction or execution.
use reqwest::{redirect::Policy, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    net::ToSocketAddrs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tokio::sync::Notify;

const CMS: &str = "https://port-catalog-cms.port-catalog-cms.workers.dev";
const LIMIT: u64 = 32 * 1024 * 1024 * 1024;
type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    #[serde(default)]
    id: String,
    #[serde(default)]
    project_id: String,
    #[serde(default)]
    build_id: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    project_name: String,
    #[serde(default)]
    arch: String,
    #[serde(default)]
    channel: String,
    #[serde(default)]
    history_error: bool,
    phase: String,
    name: String,
    completed: u64,
    total: Option<u64>,
    speed: u64,
    message: String,
    path: Option<PathBuf>,
}
#[derive(Default)]
struct Inner {
    status: Mutex<Status>,
    cancel: Mutex<Arc<Notify>>,
    updating: AtomicBool,
}
#[derive(Default)]
pub struct Downloads(Arc<Inner>);
pub struct UpdateReservation(Arc<Inner>);
impl Drop for UpdateReservation {
    fn drop(&mut self) {
        self.0.updating.store(false, Ordering::Release);
    }
}
impl Downloads {
    pub fn reserve_for_update(&self) -> Result<UpdateReservation> {
        let status = self.0.status.lock().map_err(|_| "Загрузки недоступны")?;
        if active(&status) || self.0.updating.swap(true, Ordering::AcqRel) {
            return Err("Сначала завершите или отмените текущую загрузку".into());
        }
        // Window close must be able to read status during the official updater handoff.
        Ok(UpdateReservation(self.0.clone()))
    }
}
fn active(s: &Status) -> bool {
    matches!(
        s.phase.as_str(),
        "selecting" | "checking" | "downloading" | "verifying"
    )
}
fn edit(s: &Inner, f: impl FnOnce(&mut Status)) {
    f(&mut s.status.lock().unwrap());
}
fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}
fn trusted(u: &Url) -> bool {
    u.scheme() == "https"
        && u.username().is_empty()
        && u.password().is_none()
        && u.port_or_known_default() == Some(443)
        && u.fragment().is_none()
        && matches!(
            u.host_str(),
            Some("github.com" | "release-assets.githubusercontent.com")
        )
}
fn asset_url(raw: &str) -> Result<(Url, String)> {
    if raw.len() > 2048
        || raw.chars().any(|c| c.is_control() || c.is_whitespace())
        || raw.contains('\\')
    {
        return Err("Некорректный URL файла".into());
    }
    let u = Url::parse(raw).map_err(|_| "Некорректный URL файла")?;
    let parts: Vec<_> = u.path_segments().ok_or("Нет пути файла")?.collect();
    if !trusted(&u)
        || u.host_str() != Some("github.com")
        || u.query().is_some()
        || parts.len() != 6
        || parts[2] != "releases"
        || parts[3] != "download"
        || parts.iter().any(|s| s.is_empty())
    {
        return Err(
            "Требуется прямой файл GitHub Release, а не исходники или страница релиза".into(),
        );
    }
    let name = parts[5];
    // Keep the URL leaf verbatim; percent escapes and Windows special names are rejected.
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.len() > 160
        || name.starts_with('.')
        || name.ends_with('.')
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        || matches!(
            stem.as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        )
    {
        return Err("Небезопасное имя файла релиза".into());
    }
    let name = name.to_string();
    Ok((u, name))
}
struct Asset {
    version: String,
    arch: String,
    channel: String,
    url: Url,
    name: String,
    size: Option<u64>,
    hash: Option<String>,
}
fn approved(body: &[u8], project: &str, build: &str) -> Result<Asset> {
    let v: Value = serde_json::from_slice(body).map_err(|_| "Некорректный ответ CMS")?;
    if v["schemaVersion"] != 2 || v["projectId"] != project || v["channel"] != "all" {
        return Err("Не удалось подтвердить источник сборки".into());
    }
    let rows = v["builds"]
        .as_array()
        .filter(|a| a.len() <= 1000)
        .ok_or("Нет сборок")?;
    let matches: Vec<_> = rows.iter().filter(|b| b["id"] == build).collect();
    if matches.len() != 1 {
        return Err("Сборка отсутствует или неоднозначна".into());
    }
    let b = matches[0];
    if b["projectId"] != project
        || b["os"] != "windows"
        || b["availability"] != "available"
        || !matches!(b["channel"].as_str(), Some("stable" | "prerelease"))
        || b.get("review").is_some_and(|r| r != "approved")
    {
        return Err("Одобренная доступная Windows-сборка не подтверждена".into());
    }
    let (url, name) = asset_url(b["url"].as_str().ok_or("Нет прямого URL файла")?)?;
    let size = if b["size"].is_null() {
        None
    } else {
        Some(
            b["size"]
                .as_u64()
                .filter(|n| *n > 0 && *n <= LIMIT)
                .ok_or("Некорректный размер сборки")?,
        )
    };
    let hash = if b["sha256"].is_null() {
        None
    } else {
        Some(
            b["sha256"]
                .as_str()
                .filter(|s| {
                    s.len() == 64
                        && s.bytes()
                            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
                })
                .ok_or("Некорректный SHA-256")?
                .to_string(),
        )
    };
    Ok(Asset {
        arch: b["arch"].as_str().unwrap_or("unknown").to_string(),
        channel: b["channel"].as_str().unwrap_or("").to_string(),
        version: b["version"]
            .as_str()
            .filter(|v| v.len() <= 200)
            .unwrap_or("")
            .to_string(),
        url,
        name,
        size,
        hash,
    })
}
async fn response(mut url: Url) -> Result<reqwest::Response> {
    for hop in 0..=5 {
        if !trusted(&url) {
            return Err("Запрещённый адрес перенаправления".into());
        }
        let host = url.host_str().unwrap().to_string();
        let dns_host = host.clone();
        let addrs = tokio::time::timeout(
            Duration::from_secs(4),
            tauri::async_runtime::spawn_blocking(move || {
                (dns_host.as_str(), 443)
                    .to_socket_addrs()
                    .map(|a| a.take(32).collect::<Vec<_>>())
            }),
        )
        .await
        .map_err(|_| "DNS: время ожидания истекло")?
        .map_err(|_| "Ошибка DNS")?
        .map_err(|_| "Не удалось разрешить адрес")?;
        if addrs.is_empty() || addrs.iter().any(|a| !crate::catalog::public_ip(a.ip())) {
            return Err("Запрещённый сетевой адрес".into());
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .https_only(true)
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(20))
            .resolve_to_addrs(&host, &addrs)
            .user_agent("PORT-Downloads/1")
            .build()
            .map_err(|_| "Ошибка сетевого клиента")?;
        let r = client
            .get(url)
            .header("Accept-Encoding", "identity")
            .send()
            .await
            .map_err(|_| "Ошибка сети. Повторите скачивание.")?;
        if r.status().is_redirection() && hop < 5 {
            url = r
                .url()
                .join(
                    r.headers()
                        .get("location")
                        .and_then(|v| v.to_str().ok())
                        .ok_or("Нет адреса перенаправления")?,
                )
                .map_err(|_| "Ошибка перенаправления")?;
            continue;
        }
        if r.status() != reqwest::StatusCode::OK {
            return Err(format!(
                "Сервер файла: HTTP {}. Повторите скачивание.",
                r.status().as_u16()
            ));
        }
        if r.headers()
            .get("content-encoding")
            .is_some_and(|v| v != "identity")
        {
            return Err("Неожиданное кодирование файла".into());
        }
        return Ok(r);
    }
    Err("Слишком много перенаправлений".into())
}
fn verify(completed: u64, total: Option<u64>, hash: Option<&str>, actual: &str) -> Result<()> {
    if completed == 0 || completed > LIMIT || total.is_some_and(|n| n != completed) {
        return Err("Файл получен не полностью или превышает лимит".into());
    }
    if hash.is_some_and(|h| h != actual) {
        return Err("SHA-256 файла не совпадает с CMS".into());
    }
    Ok(())
}
async fn transfer(s: &Inner, a: Asset, root: PathBuf) -> Result<PathBuf> {
    ensure_absent(&root.join(&a.name))?;
    let r = response(a.url.clone()).await?;
    save_response(s, a, root, r).await
}
async fn save_response(
    s: &Inner,
    a: Asset,
    root: PathBuf,
    mut r: reqwest::Response,
) -> Result<PathBuf> {
    let length = r.content_length();
    if length.is_some_and(|n| n == 0 || n > LIMIT)
        || a.size.zip(length).is_some_and(|(a, b)| a != b)
    {
        return Err("Размер файла не совпадает с CMS или превышает лимит".into());
    }
    let total = a.size.or(length);
    // Without a length or CMS digest there is no independent completion gate.
    if total.is_none() && a.hash.is_none() {
        return Err("Нет размера или SHA-256 для проверки завершения".into());
    }
    crate::download::safe_existing(&root)?;
    std::fs::create_dir_all(&root).map_err(|_| "Не удалось создать папку загрузки")?;
    crate::download::safe_existing(&root)?;
    let root = root
        .canonicalize()
        .map_err(|_| "Папка загрузки недоступна")?;
    let destination = root.join(&a.name);
    ensure_absent(&destination)?;
    let mut file = tempfile::Builder::new()
        .prefix("download-")
        .suffix(".part")
        .tempfile_in(&root)
        .map_err(|_| "Не удалось создать временный файл")?;
    edit(s, |s| {
        s.name = a.name.clone();
        s.path = Some(destination.clone());
        s.total = total;
        s.phase = "downloading".into();
        s.message = "Скачивание официального файла…".into();
    });
    let start = Instant::now();
    let mut completed = 0;
    let mut digest = Sha256::new();
    while let Some(chunk) = r
        .chunk()
        .await
        .map_err(|_| "Соединение прервано. Повторите скачивание.")?
    {
        completed += chunk.len() as u64;
        if completed > total.unwrap_or(LIMIT) || completed > LIMIT {
            return Err("Размер файла превышает ожидаемый".into());
        }
        file.write_all(&chunk)
            .map_err(|_| "Не удалось записать файл. Проверьте место на диске.")?;
        digest.update(&chunk);
        edit(s, |s| {
            s.completed = completed;
            s.speed = (completed as f64 / start.elapsed().as_secs_f64().max(0.001)) as u64;
        });
    }
    edit(s, |s| {
        s.phase = "verifying".into();
        s.message = "Проверка целостности файла…".into();
    });
    verify(
        completed,
        total,
        a.hash.as_deref(),
        &format!("{:x}", digest.finalize()),
    )?;
    file.as_file()
        .sync_all()
        .map_err(|_| "Не удалось сохранить файл")?;
    crate::download::safe_existing(&root)?;
    file.persist_noclobber(&destination)
        .map_err(|_| "Не удалось завершить сохранение файла")?;
    Ok(destination)
}
fn ensure_absent(path: &std::path::Path) -> Result<()> {
    match std::fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Ok(_) => Err("Файл уже существует. Выберите другую папку и повторите скачивание.".into()),
        Err(_) => Err("Не удалось проверить файл назначения".into()),
    }
}

fn native_text(app: &tauri::AppHandle, source: &str) -> String {
    let language = app
        .try_state::<crate::Database>()
        .and_then(|db| db.0.lock().ok().and_then(|conn| crate::read(&conn).ok()))
        .map(|s| s.language)
        .unwrap_or_else(crate::default_language);
    let index = match language.as_str() {
        "en" => 0,
        "es" => 1,
        "fr" => 2,
        _ => return source.into(),
    };
    serde_json::from_str::<Value>(include_str!("../../src/hub/translations.json"))
        .ok()
        .and_then(|v| v.get(source)?.get(index)?.as_str().map(str::to_owned))
        .unwrap_or_else(|| source.into())
}
async fn destination(
    app: tauri::AppHandle,
    s: &Inner,
    a: &Asset,
    qa: bool,
) -> Result<Option<PathBuf>> {
    if qa
        && std::env::var_os("PORT_QA_DOWNLOAD_NO_DIALOG").as_deref()
            == Some(std::ffi::OsStr::new("1"))
    {
        let root = crate::local_cms_qa::root().join("downloads");
        crate::download::safe_existing(&root)?;
        std::fs::create_dir_all(&root).map_err(|_| "Не удалось создать QA папку")?;
        let dir = tempfile::Builder::new()
            .prefix("release-")
            .tempdir_in(root)
            .map_err(|_| "Не удалось создать QA папку файла")?;
        return Ok(Some(dir.keep()));
    }
    edit(s, |s| {
        s.phase = "selecting".into();
        s.message = "Выберите папку для сохранения файла".into();
    });
    let name = a.name.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let default = if qa { crate::local_cms_qa::root().join("downloads") } else {
            app.path().download_dir().map_err(|_| "Папка загрузок недоступна")?.join("PORT")
        };
        // Only create our default folder; selected folders and their contents are never removed.
        crate::download::safe_existing(&default)?;
        std::fs::create_dir_all(&default).map_err(|_| "Не удалось создать папку Загрузки/PORT")?;
        let default = default.canonicalize().map_err(|_| "Папка загрузок недоступна")?;
        loop {
            let mut dialog = app.dialog().file().set_title(native_text(&app, "PORT — выберите папку загрузки")).set_directory(&default);
            if let Some(window) = app.get_webview_window("main") { dialog = dialog.set_parent(&window); }
            let Some(folder) = dialog.blocking_pick_folder() else { return Ok(None) };
            let root = folder.into_path().map_err(|_| "Некорректная папка загрузки")?;
            crate::download::safe_existing(&root)?;
            if !root.is_absolute() || !root.is_dir() { return Err("Папка загрузки недоступна".into()); }
            match ensure_absent(&root.join(&name)) {
                Ok(()) => return Ok(Some(root)),
                Err(_) if root.join(&name).exists() => {
                    let mut message = app.dialog().message(format!("{name}\n{}", native_text(&app, "Файл уже существует. Существующий файл будет сохранён. Выберите другую папку или отмените загрузку.")))
                        .title(native_text(&app, "PORT — файл уже существует"))
                        .buttons(MessageDialogButtons::OkCancelCustom(native_text(&app, "Выбрать другую папку"), native_text(&app, "Отмена")));
                    if let Some(window) = app.get_webview_window("main") { message = message.parent(&window); }
                    if !message.blocking_show() { return Ok(None); }
                }
                Err(e) => return Err(e),
            }
        }
    }).await.map_err(|_| "Ошибка диалога выбора папки")?
}
#[tauri::command]
pub fn hub_download_status(state: tauri::State<Downloads>) -> Status {
    state.0.status.lock().unwrap().clone()
}
#[tauri::command]
pub fn start_hub_download(
    app: tauri::AppHandle,
    state: tauri::State<Downloads>,
    project_id: String,
    build_id: String,
    project_name: Option<String>,
    repeat: Option<bool>,
) -> Result<()> {
    if !valid_id(&project_id) || !valid_id(&build_id) {
        return Err("Некорректная сборка".into());
    }
    let qa = crate::local_cms_qa::enabled(&app.config().identifier);
    let s = state.0.clone();
    let mut status = s.status.lock().unwrap();
    if s.updating.load(Ordering::Acquire) {
        return Err("Дождитесь завершения обновления PORT".into());
    }
    if active(&status) {
        return Err("Сначала завершите или отмените текущую загрузку".into());
    }
    if repeat != Some(true) {
        let db = app.state::<crate::Database>();
        let conn = db.0.lock().map_err(|_| "История недоступна")?;
        if history(&conn)
            .map_err(|_| "История недоступна")?
            .iter()
            .any(|r| {
                r.project_id == project_id
                    && r.build_id == build_id
                    && r.phase == "completed"
                    && r.path.as_ref().is_some_and(|p| p.is_file())
            })
        {
            return Err("Этот файл уже скачан. Откройте раздел Загрузки.".into());
        }
    }
    let previous = status.clone();
    let cancel = Arc::new(Notify::new());
    *s.cancel.lock().unwrap() = cancel.clone();
    *status = Status {
        id: format!(
            "{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "Ошибка часов")?
                .as_nanos()
        ),
        project_id: project_id.clone(),
        build_id: build_id.clone(),
        project_name: project_name
            .filter(|n| n.len() <= 240 && !n.chars().any(char::is_control))
            .unwrap_or_else(|| project_id.clone()),
        phase: "checking".into(),
        message: "Проверка сборки в CMS…".into(),
        ..Status::default()
    };
    if let Err(e) = persist(&app, &status) {
        *status = previous;
        return Err(e);
    }
    drop(status);
    tauri::async_runtime::spawn(async move {
        let fetch = async {
            let url = format!("{CMS}/v2/projects/{project_id}/builds?channel=all");
            let body = tauri::async_runtime::spawn_blocking(move || {
                if qa {
                    let path = Url::parse(&url).map_err(|e| e.to_string())?;
                    return crate::local_cms_qa::fetch(crate::local_cms_qa::ID, &format!("{}?channel=all", path.path()));
                }
                crate::catalog::fetch(
                    &url,
                    1024 * 1024,
                    Instant::now() + Duration::from_secs(15),
                    "application/json",
                )
            })
            .await
            .map_err(|_| "Ошибка запроса CMS")?
            .map_err(|_| "Не удалось подтвердить сборку в публичном API CMS. Проверьте доступность каталога и повторите попытку.")?;
            approved(&body, &project_id, &build_id)
        };
        let result: Result<Option<PathBuf>> = async {
            let asset = tokio::select! {
                biased;
                _ = cancel.notified() => return Err("Загрузка отменена".into()),
                r = fetch => r?,
            };
            edit(&s, |s| {
                s.version = asset.version.clone();
                s.arch = asset.arch.clone();
                s.channel = asset.channel.clone();
                s.name = asset.name.clone();
            });
            persist(&app, &s.status.lock().unwrap())?;
            let Some(root) = destination(app.clone(), &s, &asset, qa).await? else {
                return Ok(None);
            };
            edit(&s, |s| {
                s.phase = "checking".into();
                s.message = "Подключение к серверу файла…".into();
            });
            tokio::select! {
                biased;
                _ = cancel.notified() => Err("Загрузка отменена".into()),
                r = transfer(&s, asset, root) => r.map(Some),
            }
        }
        .await;
        // Publish terminal state only after its history write; another start cannot replace it.
        let mut final_status = s.status.lock().unwrap();
        {
            let s = &mut *final_status;
            s.speed = 0;
            match result {
                Ok(Some(path)) => {
                    s.phase = "completed".into();
                    s.message = "Файл сохранён. Запуск выполняется вручную.".into();
                    s.path = Some(path);
                }
                Ok(None) => {
                    s.phase = "cancelled".into();
                    s.message = "Загрузка отменена".into();
                    s.path = None;
                }
                Err(e) => {
                    s.path = None;
                    s.phase = if e == "Загрузка отменена" {
                        "cancelled"
                    } else {
                        "error"
                    }
                    .into();
                    s.message = e;
                }
            }
        }
        if persist(&app, &final_status).is_err() {
            final_status.history_error = true;
            final_status.message = if final_status.phase == "completed" {
                "Не удалось сохранить историю. Файл на диске не удалён."
            } else {
                "Не удалось сохранить историю загрузок"
            }
            .into();
        }
    });
    Ok(())
}
#[tauri::command]
pub fn cancel_hub_download(state: tauri::State<Downloads>) {
    if matches!(
        state.0.status.lock().unwrap().phase.as_str(),
        "checking" | "downloading"
    ) {
        state.0.cancel.lock().unwrap().notify_one();
    }
}
pub fn init(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS hub_downloads(id TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )?;
    let rows = history(conn)?;
    for mut row in rows {
        if active(&row) {
            row.phase = "interrupted".into();
            row.message =
                "Загрузка прервана при закрытии PORT. Повторите скачивание с начала.".into();
            row.path = None;
            row.speed = 0;
            write_record(conn, &row)?;
        }
    }
    Ok(())
}
fn write_record(conn: &rusqlite::Connection, s: &Status) -> rusqlite::Result<()> {
    let value = serde_json::to_string(s).map_err(|_| rusqlite::Error::InvalidQuery)?;
    conn.execute("INSERT INTO hub_downloads(id,value) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET value=excluded.value", rusqlite::params![s.id, value])?;
    Ok(())
}
fn history(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<Status>> {
    let mut q =
        conn.prepare("SELECT value FROM hub_downloads ORDER BY length(id) DESC, id DESC")?;
    let rows = q
        .query_map([], |r| r.get::<_, String>(0))?
        .map(|r| serde_json::from_str(&r?).map_err(|_| rusqlite::Error::InvalidQuery))
        .collect();
    rows
}
fn persist(app: &tauri::AppHandle, s: &Status) -> Result<()> {
    let db = app.state::<crate::Database>();
    let conn = db.0.lock().map_err(|_| "История недоступна")?;
    write_record(&conn, s).map_err(|_| "Не удалось сохранить историю загрузок".into())
}
#[tauri::command]
pub fn hub_download_history(db: tauri::State<crate::Database>) -> Result<Vec<Status>> {
    history(&*db.0.lock().map_err(|_| "История недоступна")?)
        .map_err(|_| "Не удалось прочитать историю загрузок".into())
}
#[tauri::command]
pub fn remove_hub_download(
    id: String,
    state: tauri::State<Downloads>,
    db: tauri::State<crate::Database>,
) -> Result<()> {
    let s = state.0.status.lock().unwrap();
    if s.id == id && active(&s) {
        return Err("Сначала завершите загрузку".into());
    }
    db.0.lock()
        .map_err(|_| "История недоступна")?
        .execute("DELETE FROM hub_downloads WHERE id=?1", [id])
        .map_err(|_| "Не удалось очистить запись")?;
    Ok(())
}
#[tauri::command]
pub fn open_hub_download_folder(
    id: Option<String>,
    state: tauri::State<Downloads>,
    db: tauri::State<crate::Database>,
) -> Result<()> {
    let current = state.0.status.lock().unwrap().clone();
    let status = if id.as_deref() == Some(current.id.as_str()) && current.phase == "completed" {
        current
    } else if let Some(id) = id {
        history(&*db.0.lock().map_err(|_| "История недоступна")?)
            .map_err(|_| "История недоступна")?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or("Нет записи загрузки")?
    } else {
        state.0.status.lock().unwrap().clone()
    };
    let path = status
        .path
        .as_ref()
        .filter(|_| status.phase == "completed")
        .ok_or("Нет завершённой загрузки")?;
    crate::download::safe_existing(path)?;
    if !path.is_file() {
        return Err("Скачанный файл больше не найден".into());
    }
    tauri_plugin_opener::reveal_item_in_dir(path)
        .map_err(|_| "Не удалось показать файл в Проводнике")?;
    Ok(())
}
pub fn prevent_close(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<Downloads>();
        if active(&state.0.status.lock().unwrap()) {
            api.prevent_close();
            window.dialog().message(native_text(window.app_handle(), "Дождитесь завершения загрузки или отмените её в разделе Загрузки, затем закройте PORT.")).title(native_text(window.app_handle(), "PORT — загрузка продолжается")).show(|_| {});
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn updater_reservation_keeps_window_status_readable_and_releases_on_error() {
        let state = Downloads::default();
        let reservation = state.reserve_for_update().unwrap();
        assert!(state.0.updating.load(Ordering::Acquire));
        assert!(state.0.status.try_lock().is_ok());
        assert!(state.reserve_for_update().is_err());
        drop(reservation);
        assert!(!state.0.updating.load(Ordering::Acquire));
        state.0.status.lock().unwrap().phase = "downloading".into();
        assert!(state.reserve_for_update().is_err());
        assert!(!state.0.updating.load(Ordering::Acquire));
    }
    #[test]
    fn history_restart_and_removal_preserve_downloaded_file() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("finished.zip");
        std::fs::write(&path, b"owned bytes").unwrap();
        let db_path = root.path().join("history.sqlite");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        init(&conn).unwrap();
        write_record(
            &conn,
            &Status {
                id: "1".into(),
                phase: "completed".into(),
                path: Some(path.clone()),
                version: "1.0.0".into(),
                ..Status::default()
            },
        )
        .unwrap();
        write_record(
            &conn,
            &Status {
                id: "2".into(),
                phase: "downloading".into(),
                ..Status::default()
            },
        )
        .unwrap();
        drop(conn);
        let conn = rusqlite::Connection::open(db_path).unwrap();
        init(&conn).unwrap();
        let rows = history(&conn).unwrap();
        assert_eq!(rows[0].phase, "interrupted");
        assert_eq!(rows[1].path.as_ref(), Some(&path));
        conn.execute("DELETE FROM hub_downloads", []).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"owned bytes");
    }
    async fn fixture_response(declared: usize, hold: bool) -> reqwest::Response {
        use std::io::Read;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 2048];
            assert!(stream.read(&mut request).unwrap() > 0);
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {declared}\r\nConnection: close\r\n\r\nabc"
            )
            .unwrap();
            stream.flush().unwrap();
            if hold {
                std::thread::sleep(Duration::from_millis(400));
            }
        });
        // Loopback exists only in this response fixture, never in the production requester.
        reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!("http://{addr}"))
            .send()
            .await
            .unwrap()
    }
    fn fixture_asset(hash: Option<String>) -> Asset {
        Asset {
            version: "1.0.0".into(),
            arch: "x64".into(),
            channel: "stable".into(),
            url: Url::parse("https://github.com/o/r/releases/download/v1/a.zip").unwrap(),
            name: "a.zip".into(),
            size: None,
            hash,
        }
    }
    #[tokio::test]
    async fn streamed_file_commits_only_after_verification() {
        let root = tempfile::tempdir().unwrap();
        let state = Inner::default();
        let hash = format!("{:x}", Sha256::digest(b"abc"));
        let path = save_response(
            &state,
            fixture_asset(Some(hash)),
            root.path().to_path_buf(),
            fixture_response(3, false).await,
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"abc");
        assert_eq!(path, root.path().canonicalize().unwrap().join("a.zip"));
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
        assert_eq!(state.status.lock().unwrap().completed, 3);
    }
    #[tokio::test]
    async fn interrupted_and_bad_hash_leave_no_final_or_temporary_file() {
        for (declared, hash) in [(8, None), (3, Some("0".repeat(64)))] {
            let root = tempfile::tempdir().unwrap();
            assert!(save_response(
                &Inner::default(),
                fixture_asset(hash),
                root.path().to_path_buf(),
                fixture_response(declared, false).await
            )
            .await
            .is_err());
            assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
        }
    }
    #[tokio::test]
    async fn cancelling_pending_stream_removes_partial_file() {
        let root = tempfile::tempdir().unwrap();
        let existing = root.path().join("user.zip");
        std::fs::write(&existing, b"keep user file").unwrap();
        let state = Inner::default();
        let r = fixture_response(100, true).await;
        let result = tokio::time::timeout(
            Duration::from_millis(80),
            save_response(&state, fixture_asset(None), root.path().to_path_buf(), r),
        )
        .await;
        assert!(result.is_err());
        assert!(state.status.lock().unwrap().completed > 0);
        assert_eq!(std::fs::read(&existing).unwrap(), b"keep user file");
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[tokio::test]
    async fn existing_user_files_are_never_overwritten_or_cleaned_up() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("a.zip");
        std::fs::write(&target, b"existing user ZIP").unwrap();
        assert!(save_response(
            &Inner::default(),
            fixture_asset(None),
            root.path().to_path_buf(),
            fixture_response(3, false).await
        )
        .await
        .is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"existing user ZIP");
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
        let mut asset = fixture_asset(Some("0".repeat(64)));
        asset.name = "other.zip".into();
        assert!(save_response(
            &Inner::default(),
            asset,
            root.path().to_path_buf(),
            fixture_response(3, false).await
        )
        .await
        .is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"existing user ZIP");
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
        // A file created after preflight must still win at the commit boundary.
        let mut partial = tempfile::Builder::new()
            .suffix(".part")
            .tempfile_in(root.path())
            .unwrap();
        partial.write_all(b"new bytes").unwrap();
        assert!(partial.persist_noclobber(&target).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"existing user ZIP");
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[test]
    fn release_urls_and_windows_names() {
        let base = "https://github.com/owner/repo/releases/download/v1/";
        assert!(asset_url(&format!("{base}build-x64.zip")).is_ok());
        for name in [
            "CON.zip",
            "nul",
            "a%2fexe",
            "a%20b.zip",
            "a.zip.",
            ".hidden",
            "a:exe",
            "a.zip?x=1",
            "a.zip#x",
        ] {
            assert!(asset_url(&format!("{base}{name}")).is_err(), "{name}");
        }
        for url in [
            "http://github.com/o/r/releases/download/v1/a.zip",
            "https://github.com/o/r/archive/v1.zip",
            "https://github.com/o/r/releases/tag/v1",
            "https://127.0.0.1/o/r/releases/download/v1/a.zip",
            "https://github.com.evil.test/o/r/releases/download/v1/a.zip",
        ] {
            assert!(asset_url(url).is_err());
        }
        assert!(!trusted(
            &Url::parse("https://github.com@localhost/x").unwrap()
        ));
    }
    #[test]
    fn completion_gate() {
        assert!(verify(3, Some(3), Some("abc"), "abc").is_ok());
        assert!(verify(2, Some(3), None, "").is_err());
        assert!(verify(0, None, None, "").is_err());
        assert!(verify(3, Some(3), Some("abc"), "def").is_err());
    }
    #[test]
    fn cms_approval_is_authority() {
        let mut v = serde_json::json!({"schemaVersion":2,"projectId":"port-a","channel":"all","builds":[{"id":"b","projectId":"port-a","os":"windows","channel":"stable","availability":"available","url":"https://github.com/o/r/releases/download/v1/a.zip"}]});
        assert!(approved(&serde_json::to_vec(&v).unwrap(), "port-a", "b").is_ok());
        v["builds"][0]["review"] = Value::from("proposed");
        assert!(approved(&serde_json::to_vec(&v).unwrap(), "port-a", "b").is_err());
        v["builds"][0]["review"] = Value::from("approved");
        v["builds"][0]["availability"] = Value::from("unknown");
        assert!(approved(&serde_json::to_vec(&v).unwrap(), "port-a", "b").is_err());
    }
}
