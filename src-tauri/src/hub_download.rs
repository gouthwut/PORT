//! One approved CMS release asset; no installer, extraction or execution.
use reqwest::{redirect::Policy, Url};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    net::ToSocketAddrs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Manager;
use tokio::sync::Notify;

const CMS: &str = "https://port-catalog-cms.port-catalog-cms.workers.dev";
const LIMIT: u64 = 32 * 1024 * 1024 * 1024;
type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    phase: String,
    name: String,
    completed: u64,
    total: Option<u64>,
    speed: u64,
    message: String,
    #[serde(skip)]
    folder: Option<PathBuf>,
}
#[derive(Default)]
struct Inner {
    status: Mutex<Status>,
    cancel: Mutex<Arc<Notify>>,
}
#[derive(Default)]
pub struct Downloads(Arc<Inner>);
fn active(s: &Status) -> bool {
    matches!(s.phase.as_str(), "checking" | "downloading")
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
    let dir = tempfile::Builder::new()
        .prefix("release-")
        .tempdir_in(&root)
        .map_err(|_| "Не удалось создать папку файла")?;
    let mut file = tempfile::Builder::new()
        .prefix("download-")
        .suffix(".part")
        .tempfile_in(dir.path())
        .map_err(|_| "Не удалось создать временный файл")?;
    edit(s, |s| {
        s.name = a.name.clone();
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
    verify(
        completed,
        total,
        a.hash.as_deref(),
        &format!("{:x}", digest.finalize()),
    )?;
    file.as_file()
        .sync_all()
        .map_err(|_| "Не удалось сохранить файл")?;
    crate::download::safe_existing(dir.path())?;
    file.persist_noclobber(dir.path().join(a.name))
        .map_err(|_| "Не удалось завершить сохранение файла")?;
    Ok(dir.keep())
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
) -> Result<()> {
    if !valid_id(&project_id) || !valid_id(&build_id) {
        return Err("Некорректная сборка".into());
    }
    let root = app
        .path()
        .download_dir()
        .map_err(|_| "Папка загрузок недоступна")?
        .join("PORT");
    let s = state.0.clone();
    let mut status = s.status.lock().unwrap();
    if active(&status) {
        return Err("Сначала завершите или отмените текущую загрузку".into());
    }
    let cancel = Arc::new(Notify::new());
    *s.cancel.lock().unwrap() = cancel.clone();
    *status = Status {
        phase: "checking".into(),
        message: "Проверка сборки в CMS…".into(),
        ..Status::default()
    };
    drop(status);
    tauri::async_runtime::spawn(async move {
        let work = async {
            let url = format!("{CMS}/v2/projects/{project_id}/builds?channel=all");
            let body = tauri::async_runtime::spawn_blocking(move || {
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
            let asset = approved(&body, &project_id, &build_id)?;
            transfer(&s, asset, root).await
        };
        let result = tokio::select! {
            biased;
            _ = cancel.notified() => Err("Загрузка отменена".to_string()),
            r = work => r,
        };
        edit(&s, |s| {
            s.speed = 0;
            match result {
                Ok(folder) => {
                    s.phase = "completed".into();
                    s.message = "Файл сохранён. Запуск выполняется вручную.".into();
                    s.folder = Some(folder);
                }
                Err(e) => {
                    s.phase = if e == "Загрузка отменена" {
                        "cancelled"
                    } else {
                        "error"
                    }
                    .into();
                    s.message = e;
                }
            }
        });
    });
    Ok(())
}
#[tauri::command]
pub fn cancel_hub_download(state: tauri::State<Downloads>) {
    if active(&state.0.status.lock().unwrap()) {
        state.0.cancel.lock().unwrap().notify_one();
    }
}
#[tauri::command]
pub fn open_hub_download_folder(state: tauri::State<Downloads>) -> Result<()> {
    let status = state.0.status.lock().unwrap();
    let path = status
        .folder
        .as_ref()
        .filter(|_| status.phase == "completed")
        .ok_or("Нет завершённой загрузки")?;
    crate::download::safe_existing(path)?;
    #[cfg(windows)]
    std::process::Command::new(
        PathBuf::from(std::env::var_os("SystemRoot").ok_or("Нет системной папки")?)
            .join("explorer.exe"),
    )
    .arg(path)
    .spawn()
    .map_err(|_| "Не удалось открыть папку")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn fixture_response(declared: usize, hold: bool) -> reqwest::Response {
        use std::io::Read;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 2048];
            stream.read(&mut request).unwrap();
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
        let folder = save_response(
            &state,
            fixture_asset(Some(hash)),
            root.path().to_path_buf(),
            fixture_response(3, false).await,
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(folder.join("a.zip")).unwrap(), b"abc");
        assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 1);
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
        let state = Inner::default();
        let r = fixture_response(100, true).await;
        let result = tokio::time::timeout(
            Duration::from_millis(80),
            save_response(&state, fixture_asset(None), root.path().to_path_buf(), r),
        )
        .await;
        assert!(result.is_err());
        assert!(state.status.lock().unwrap().completed > 0);
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
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
