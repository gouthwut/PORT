//! Fixed upstream artifact only. No execution, shell, external manifest commands or extraction.
use reqwest::{blocking::Client, redirect::Policy, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Manager;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    repository: String,
    tag: String,
    asset: String,
    url: String,
    size: u64,
    sha256: String,
}
fn manifest() -> Manifest {
    serde_json::from_str(include_str!("runtime-manifest.json")).expect("compiled manifest")
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub phase: String,
    pub completed: u64,
    pub total: u64,
    pub speed: u64,
    pub message: String,
    pub path: Option<String>,
    active: bool,
    cancel: bool,
    paused: bool,
}
impl Default for Status {
    fn default() -> Self {
        Self {
            phase: "idle".into(),
            completed: 0,
            total: manifest().size,
            speed: 0,
            message: "Кэш компонентов ещё не проверен в этом сеансе".into(),
            path: None,
            active: false,
            cancel: false,
            paused: false,
        }
    }
}
#[derive(Default)]
pub struct Download(Arc<Mutex<Status>>);
fn update(s: &Arc<Mutex<Status>>, f: impl FnOnce(&mut Status)) {
    if let Ok(mut s) = s.lock() {
        f(&mut s);
    }
}
fn checkpoint(s: &Arc<Mutex<Status>>) -> Result<bool, String> {
    let s = s.lock().map_err(|e| e.to_string())?;
    if s.cancel {
        Err("Отменено пользователем".into())
    } else {
        Ok(s.paused)
    }
}
fn trusted(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && matches!(
            url.host_str(),
            Some("github.com" | "api.github.com" | "release-assets.githubusercontent.com")
        )
}
fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("PORT-launcher/0.1.0")
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !trusted(attempt.url()) {
                attempt.error("Untrusted download redirect")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}
fn network_error(e: reqwest::Error) -> String {
    use std::error::Error;
    let mut cause: &dyn Error = &e;
    while let Some(source) = cause.source() {
        cause = source;
    }
    format!("Сетевая ошибка: {cause}. Повторите для продолжения.")
}
pub(crate) fn safe_existing(p: &Path) -> Result<(), String> {
    for ancestor in p.ancestors() {
        match fs::symlink_metadata(ancestor) {
            Ok(m) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if m.file_attributes() & 0x400 != 0 {
                        return Err("Reparse point в пути к кэшу".into());
                    }
                }
                if m.file_type().is_symlink() {
                    return Err("Symlink в пути к кэшу".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
fn pinned_release(client: &Client, m: &Manifest) -> Result<(), String> {
    let url = format!(
        "https://api.github.com/repos/{}/releases/tags/{}",
        m.repository, m.tag
    );
    let mut response = client
        .get(url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mut body = Vec::new();
    response
        .by_ref()
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut body)
        .map_err(|e| e.to_string())?;
    if body.len() > 2 * 1024 * 1024 {
        return Err("Слишком большой ответ GitHub".into());
    }
    let release: serde_json::Value = serde_json::from_slice(&body).map_err(|e| e.to_string())?;
    if release["tag_name"] != m.tag || release["draft"] != false || release["prerelease"] != false {
        return Err("Закреплённый релиз изменился".into());
    }
    let asset = release["assets"]
        .as_array()
        .and_then(|a| a.iter().find(|a| a["name"] == m.asset))
        .ok_or("Релиз не содержит закреплённый архив")?;
    if asset["size"].as_u64() != Some(m.size)
        || asset["browser_download_url"] != m.url
        || asset["digest"] != format!("sha256:{}", m.sha256)
    {
        return Err("Метаданные релиза изменились. Нужна новая проверка манифеста.".into());
    }
    Ok(())
}
fn validate_range(header: Option<&str>, offset: u64, total: u64) -> bool {
    header == Some(format!("bytes {}-{}/{}", offset, total - 1, total).as_str())
}
fn hash_file(path: &Path, s: &Arc<Mutex<Status>>) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut b = [0; 65536];
    loop {
        checkpoint(s)?;
        let n = file.read(&mut b).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&b[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}
pub(crate) fn safe_zip_name(name: &str) -> bool {
    if name.len() > 240
        || name.starts_with(['/', '\\'])
        || name.contains(['\\', ':'])
        || name.chars().any(char::is_control)
    {
        return false;
    }
    let trimmed = name.trim_end_matches('/');
    if trimmed.is_empty() {
        return false;
    }
    trimmed.split('/').all(|p| {
        let stem = p.split('.').next().unwrap_or("").to_ascii_uppercase();
        !p.is_empty()
            && p != "."
            && p != ".."
            && !p.ends_with(['.', ' '])
            && !p.contains(['<', '>', '"', '|', '?', '*'])
            && ![
                "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
                "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
                "LPT9",
            ]
            .contains(&stem.as_str())
    })
}
fn verify_zip(path: &Path, s: &Arc<Mutex<Status>>) -> Result<(), String> {
    let mut zip = zip::ZipArchive::new(File::open(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if zip.len() > 20_000 {
        return Err("Слишком много файлов в архиве".into());
    }
    let mut names = HashSet::new();
    let mut total = 0u64;
    let mut entrypoint = false;
    for i in 0..zip.len() {
        checkpoint(s)?;
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        let mode = entry.unix_mode().unwrap_or(0) & 0o170000;
        if !safe_zip_name(&name)
            || !names.insert(name.trim_end_matches('/').to_lowercase())
            || !matches!(mode, 0 | 0o040000 | 0o100000)
            || entry.is_symlink()
            || entry.encrypted()
        {
            return Err(format!("Небезопасная запись ZIP: {name}"));
        }
        total = total
            .checked_add(entry.size())
            .ok_or("Переполнение размера ZIP")?;
        if total > 2 * 1024 * 1024 * 1024
            || entry.size() > 512 * 1024 * 1024
            || entry.size()
                > entry
                    .compressed_size()
                    .saturating_mul(500)
                    .saturating_add(1024 * 1024)
        {
            return Err("Лимит распаковки ZIP превышен".into());
        }
        if !entry.is_dir() {
            let expected = entry.size();
            let mut actual = 0;
            let mut b = [0; 65536];
            loop {
                checkpoint(s)?;
                let n = entry.read(&mut b).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                actual += n as u64;
                if actual > expected {
                    return Err("Размер записи ZIP изменился".into());
                }
            }
            if actual != expected {
                return Err("Неполная запись ZIP".into());
            }
        }
        if name.rsplit('/').next() == Some("Bloodborne.exe") {
            entrypoint = true;
        }
    }
    if !entrypoint {
        return Err("В архиве нет документированного Bloodborne.exe".into());
    }
    Ok(())
}
fn run(root: &Path, s: &Arc<Mutex<Status>>) -> Result<(), String> {
    let m = manifest();
    safe_existing(root)?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let part = root.join("bloodborne-windows-v1.9.4.part");
    let complete = root.join(&m.asset);
    let lock_path = root.join("download.lock");
    safe_existing(&part)?;
    safe_existing(&complete)?;
    safe_existing(&lock_path)?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)
        .map_err(|e| e.to_string())?;
    fs2::FileExt::try_lock_exclusive(&lock)
        .map_err(|_| "Загрузка уже открыта другим процессом PORT")?;
    let outcome = (|| {
        if complete.exists() {
            update(s, |s| {
                s.phase = "verifying".into();
                s.completed = m.size;
                s.message = "Проверка сохранённого архива".into();
            });
            if complete.metadata().map_err(|e| e.to_string())?.len() != m.size
                || hash_file(&complete, s)? != m.sha256
            {
                return Err(
                    "Сохранённый архив повреждён; удалите только этот файл кэша и повторите".into(),
                );
            }
            verify_zip(&complete, s)?;
        } else {
            let client = client()?;
            pinned_release(&client, &m)?;
            let mut offset = if part.exists() {
                part.metadata().map_err(|e| e.to_string())?.len()
            } else {
                0
            };
            if offset > m.size {
                return Err(
                    "Размер частичной загрузки превышен; удалите файл .part из кэша PORT".into(),
                );
            }
            if fs2::available_space(root).map_err(|e| e.to_string())?
                < m.size - offset + 64 * 1024 * 1024
            {
                return Err("Недостаточно места для архива + 64 МБ резерва".into());
            }
            update(s, |s| {
                s.phase = "downloading".into();
                s.completed = offset;
            });
            while offset < m.size {
                while checkpoint(s)? {
                    std::thread::sleep(Duration::from_millis(100));
                }
                let mut request = client.get(&m.url).header("Accept-Encoding", "identity");
                if offset > 0 {
                    request = request.header("Range", format!("bytes={offset}-"));
                }
                let mut response = request
                    .send()
                    .map_err(network_error)?
                    .error_for_status()
                    .map_err(|e| e.to_string())?;
                if offset > 0 && response.status() == reqwest::StatusCode::OK {
                    offset = 0;
                    update(s, |s| {
                        s.completed = 0;
                        s.message = "Сервер не поддержал Range: загрузка заново".into();
                    });
                } else if offset > 0
                    && (response.status() != reqwest::StatusCode::PARTIAL_CONTENT
                        || !validate_range(
                            response
                                .headers()
                                .get("Content-Range")
                                .and_then(|h| h.to_str().ok()),
                            offset,
                            m.size,
                        ))
                {
                    return Err("Некорректный ответ Range".into());
                }
                if response.content_length() != Some(m.size - offset) {
                    return Err("Размер HTTP ответа не совпадает с манифестом".into());
                }
                if fs2::available_space(root).map_err(|e| e.to_string())?
                    < m.size - offset + 64 * 1024 * 1024
                {
                    return Err("Недостаточно места для загрузки".into());
                }
                let mut file = OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(offset == 0)
                    .append(offset > 0)
                    .open(&part)
                    .map_err(|e| e.to_string())?;
                let mut b = [0; 65536];
                let started = Instant::now();
                let start_bytes = offset;
                loop {
                    if checkpoint(s)? {
                        file.sync_all().map_err(|e| e.to_string())?;
                        break;
                    }
                    let n = response.read(&mut b).map_err(|_| {
                        "Соединение прервано. Повторите для продолжения.".to_string()
                    })?;
                    if n == 0 {
                        if offset != m.size {
                            return Err("Загрузка оборвалась; повторите для продолжения".into());
                        }
                        break;
                    }
                    if offset + n as u64 > m.size {
                        return Err("Сервер превысил заявленный размер".into());
                    }
                    file.write_all(&b[..n]).map_err(|e| e.to_string())?;
                    offset += n as u64;
                    update(s, |s| {
                        s.completed = offset;
                        s.speed = ((offset - start_bytes) as f64
                            / started.elapsed().as_secs_f64().max(0.001))
                            as u64;
                        s.message = "Загрузка официального архива GitHub Releases".into();
                    });
                }
                file.sync_all().map_err(|e| e.to_string())?;
            }
            update(s, |s| {
                s.phase = "verifying".into();
                s.speed = 0;
                s.message = "SHA-256 и проверка структуры / CRC ZIP".into();
            });
            if hash_file(&part, s)? != m.sha256 {
                fs::remove_file(&part).map_err(|e| e.to_string())?;
                return Err("SHA-256 не совпал. Частичная загрузка удалена. Повторите.".into());
            }
            verify_zip(&part, s)?;
            checkpoint(s)?;
            // Fixed app-owned cache path; never replace an existing file.
            if complete.exists() {
                return Err("Кэш уже существует; файл не заменён".into());
            }
            fs::rename(&part, &complete).map_err(|e| e.to_string())?;
        }
        update(s, |s| {
            s.phase = "ready".into();
            s.completed = m.size;
            s.path = Some(complete.display().to_string());
            s.message =
                "Архив проверен. Это ещё не установка игры. Исполняемые файлы не запускались."
                    .into();
        });
        Ok(())
    })();
    let cancelled = s.lock().map_err(|e| e.to_string())?.cancel;
    if cancelled {
        if part.exists() {
            safe_existing(&part)?;
            fs::remove_file(&part).map_err(|e| e.to_string())?;
        }
        update(s, |s| {
            s.phase = "cancelled".into();
            s.completed = 0;
            s.message = "Отменено. Частичный файл удалён.".into();
        });
        return Ok(());
    }
    outcome
}
#[tauri::command]
pub fn download_status(state: tauri::State<Download>) -> Result<Status, String> {
    state.0.lock().map(|s| s.clone()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn start_download(app: tauri::AppHandle, state: tauri::State<Download>) -> Result<(), String> {
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("runtime");
    {
        let mut s = state.0.lock().map_err(|e| e.to_string())?;
        if s.active {
            return Err("Загрузка уже активна".into());
        }
        *s = Status {
            phase: "connecting".into(),
            active: true,
            ..Status::default()
        };
    }
    let s = state.0.clone();
    std::thread::spawn(move || {
        let result = run(&root, &s);
        update(&s, |s| {
            if let Err(e) = result {
                s.phase = "error".into();
                s.message = e;
            }
            s.active = false;
            s.speed = 0;
        });
    });
    Ok(())
}
#[tauri::command]
pub fn control_download(action: String, state: tauri::State<Download>) -> Result<(), String> {
    let mut s = state.0.lock().map_err(|e| e.to_string())?;
    if !s.active {
        return Err("Нет активной загрузки".into());
    }
    match action.as_str() {
        "cancel" => {
            s.cancel = true;
            s.message = "Отмена… ожидание завершения текущего чтения".into();
        }
        "pause" if s.phase == "downloading" => {
            s.paused = true;
            s.phase = "paused".into();
            s.speed = 0;
        }
        "resume" if s.paused => {
            s.paused = false;
            s.phase = "downloading".into();
        }
        _ => return Err("Действие сейчас недоступно".into()),
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires access to official GitHub release; explicit manual check"]
    fn official_release_range_probe() {
        let m = manifest();
        let c = client().unwrap();
        pinned_release(&c, &m).unwrap();
        let mut r = c
            .get(m.url)
            .header("Range", "bytes=0-1023")
            .send()
            .map_err(network_error)
            .unwrap()
            .error_for_status()
            .unwrap();
        assert_eq!(r.status(), reqwest::StatusCode::PARTIAL_CONTENT);
        let mut b = Vec::new();
        r.read_to_end(&mut b).unwrap();
        assert_eq!(b.len(), 1024);
        let full = c
            .get(&manifest().url)
            .send()
            .map_err(network_error)
            .unwrap()
            .error_for_status()
            .unwrap();
        assert_eq!(full.content_length(), Some(manifest().size));
    }
    fn archive(entries: &[(&str, &[u8])]) -> tempfile::NamedTempFile {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        let mut writer = zip::ZipWriter::new(file.as_file_mut());
        for (name, data) in entries {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap();
        file
    }
    #[test]
    fn archive_validation_rejects_traversal_collisions_and_bombs() {
        let status = Arc::new(Mutex::new(Status::default()));
        let valid = archive(&[("Bloodborne.exe", b"QA fixture, not executable")]);
        verify_zip(valid.path(), &status).unwrap();
        for bad in [
            "../outside",
            "x/../../outside",
            "C:/outside",
            "data:stream",
            "CON.txt",
        ] {
            let file = archive(&[("Bloodborne.exe", b"fixture"), (bad, b"outside")]);
            assert!(verify_zip(file.path(), &status).is_err(), "{bad}");
        }
        let duplicate = archive(&[("Bloodborne.exe", b"a"), ("BLOODBORNE.EXE", b"b")]);
        assert!(verify_zip(duplicate.path(), &status).is_err());
        let bomb = archive(&[("Bloodborne.exe", b"a"), ("big", &vec![0; 4 * 1024 * 1024])]);
        assert!(verify_zip(bomb.path(), &status).is_err());
        // Verification never writes archive entries to disk.
        assert!(!valid.path().parent().unwrap().join("outside").exists());
    }
    #[test]
    fn rejects_symlink_and_bad_crc_and_honors_cancel() {
        let status = Arc::new(Mutex::new(Status::default()));
        let mut file = tempfile::NamedTempFile::new().unwrap();
        let mut writer = zip::ZipWriter::new(file.as_file_mut());
        writer
            .add_symlink(
                "Bloodborne.exe",
                "../outside",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        writer.finish().unwrap();
        assert!(verify_zip(file.path(), &status).is_err());
        let mut file = archive(&[("Bloodborne.exe", b"fixture")]);
        let offset = {
            let mut zip = zip::ZipArchive::new(file.reopen().unwrap()).unwrap();
            let offset = zip.by_index(0).unwrap().data_start();
            offset
        };
        use std::io::{Seek, SeekFrom};
        file.seek(SeekFrom::Start(offset)).unwrap();
        file.write_all(b"BAD").unwrap();
        assert!(verify_zip(file.path(), &status).is_err());
        status.lock().unwrap().cancel = true;
        assert!(hash_file(file.path(), &status).is_err());
    }
    #[test]
    fn digest_is_of_bytes_and_not_file_metadata() {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(b"abc").unwrap();
        assert_eq!(
            hash_file(f.path(), &Arc::new(Mutex::new(Status::default()))).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
    #[test]
    fn rejects_path_tricks() {
        for path in [
            "../x",
            "/x",
            "C:/x",
            "a/../../x",
            "a\\x",
            "file:ads",
            "a/CON.txt",
            "a/LPT9",
            "a./x",
            "a /x",
            "a//x",
            "a/./x",
            "a/\0x",
        ] {
            assert!(!safe_zip_name(path), "{path}");
        }
        assert!(safe_zip_name("runtime/licenses/LICENSE.txt"));
    }
    #[test]
    fn origin_and_resume_checks() {
        assert!(trusted(&Url::parse(&manifest().url).unwrap()));
        for url in [
            "http://github.com/a",
            "https://github.com.evil.test/a",
            "https://evil.test/a",
            "https://github.com:444/a",
        ] {
            assert!(!trusted(&Url::parse(url).unwrap()));
        }
        assert!(validate_range(Some("bytes 2-9/10"), 2, 10));
        assert!(!validate_range(Some("bytes 0-9/10"), 2, 10));
    }
    #[test]
    fn compiled_manifest_is_consistent() {
        let m = manifest();
        assert_eq!(m.sha256.len(), 64);
        assert!(m.url.ends_with(&format!("/{}/{}", m.tag, m.asset)));
        assert_eq!(m.repository, "Supermedo/bloodborne_pc");
    }
}
