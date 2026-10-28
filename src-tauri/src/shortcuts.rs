//! Local .lnk files. Only compiled script text executes; values travel as environment data.
use crate::install::experience::valid_id;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

#[derive(Default)]
pub struct LaunchRequest(pub Mutex<Option<Result<String, String>>>);
pub fn parse(args: &[String]) -> Result<Option<String>, String> {
    match args {
        [_] => Ok(None),
        [_, flag, id] if flag == "--launch-installation" && valid_id(id) => Ok(Some(id.clone())),
        _ => Err("Ярлык содержит недопустимые параметры. Откройте игру из библиотеки PORT".into()),
    }
}
pub fn queue(app: &tauri::AppHandle, args: &[String]) {
    let request = match parse(args) {
        Ok(None) => return,
        Ok(Some(id)) => Ok(id),
        Err(e) => Err(e),
    };
    if let Ok(mut pending) = app.state::<LaunchRequest>().0.lock() {
        *pending = Some(request);
    }
}
#[tauri::command]
pub fn take_launch_request(state: tauri::State<LaunchRequest>) -> Result<Option<String>, String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .transpose()
}

static SHORTCUT_LOCK: Mutex<()> = Mutex::new(());
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    id: String,
    path: PathBuf,
    sha256: String,
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn bounded_read(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    use std::io::Read;
    crate::download::safe_existing(path)?;
    let file = fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err(format!("Ожидался файл: {}", path.display()));
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > limit {
        return Err(format!("Некорректный размер файла: {}", path.display()));
    }
    Ok(bytes)
}
fn write_exclusive(path: &Path, bytes: &[u8]) -> Result<(), String> {
    crate::download::safe_existing(path)?;
    let mut f = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|e| format!("{}: {e}", path.display()))?;
    if let Err(e) = f.write_all(bytes).and_then(|_| f.sync_all()) {
        drop(f);
        let _ = fs::remove_file(path);
        return Err(format!("{}: {e}", path.display()));
    }
    Ok(())
}
fn name_for(collection: &str) -> Result<&'static str, String> {
    crate::adapters::get(collection)?;
    match collection {
        "bloodborne" => Ok("Bloodborne"),
        "skate3" => Ok("Skate 3"),
        _ => Err("Название игры для ярлыка недоступно".into()),
    }
}
fn receipt_path(receipts: &Path, id: &str) -> PathBuf {
    receipts.join(format!("{id}.json"))
}
fn read_receipt(desktop: &Path, receipts: &Path, id: &str) -> Result<Option<Receipt>, String> {
    let file = receipt_path(receipts, id);
    crate::download::safe_existing(&file)?;
    if !file.try_exists().map_err(|e| e.to_string())? {
        return Ok(None);
    }
    let r: Receipt =
        serde_json::from_slice(&bounded_read(&file, 16 * 1024)?).map_err(|e| e.to_string())?;
    // Also accept receipts from the previous naming scheme for safe migration/removal.
    if r.id != id
        || !["Bloodborne", "Skate 3"].iter().any(|name| {
            r.path == desktop.join(format!("{name}.lnk"))
                || r.path == desktop.join(format!("PORT - {name} ({id}).lnk"))
        })
    {
        return Err("Некорректная квитанция или путь ярлыка; файл оставлен без изменений".into());
    }
    Ok(Some(r))
}
fn owned_bytes(r: &Receipt) -> Result<Option<Vec<u8>>, String> {
    crate::download::safe_existing(&r.path)?;
    if !r.path.try_exists().map_err(|e| e.to_string())? {
        return Ok(None);
    }
    let bytes = bounded_read(&r.path, 64 * 1024)?;
    if hash(&bytes) != r.sha256 {
        return Err(format!("Ярлык изменён пользователем: {}. Он сохранён; переименуйте его для создания ярлыка PORT", r.path.display()));
    }
    Ok(Some(bytes))
}
fn publish(
    temp: &Path,
    desktop: &Path,
    receipts: &Path,
    id: &str,
    name: &str,
) -> Result<(), String> {
    let path = desktop.join(format!("{name}.lnk"));
    crate::download::safe_existing(&path)?;
    let previous = read_receipt(desktop, receipts, id)?;
    let old_bytes = previous.as_ref().map(owned_bytes).transpose()?.flatten();
    if path.try_exists().map_err(|e| e.to_string())?
        && !previous
            .as_ref()
            .is_some_and(|r| r.path == path && old_bytes.is_some())
    {
        return Err(format!("На рабочем столе уже есть чужой или ручной ярлык: {}. Он не заменён. Переименуйте его и повторите действие", path.display()));
    }
    let bytes = bounded_read(temp, 64 * 1024)?;
    let r = Receipt {
        id: id.into(),
        path: path.clone(),
        sha256: hash(&bytes),
    };
    // A durable backup precedes removal of an owned link. Foreign paths always use create_new.
    let backup = if let (Some(old), Some(old_bytes)) = (&previous, &old_bytes) {
        let backup = tempfile::Builder::new()
            .prefix(".port-shortcut-")
            .tempfile_in(desktop)
            .map_err(|e| format!("Резервирование ярлыка в {}: {e}", desktop.display()))?;
        backup
            .as_file()
            .write_all(old_bytes)
            .map_err(|e| e.to_string())?;
        backup.as_file().sync_all().map_err(|e| e.to_string())?;
        // Recheck just before mutation; refuse modified/manual files.
        owned_bytes(old)?;
        fs::remove_file(&old.path).map_err(|e| format!("{}: {e}", old.path.display()))?;
        Some(backup)
    } else {
        None
    };
    let result = (|| {
        write_exclusive(&path, &bytes)?;
        let receipt_file = receipt_path(receipts, id);
        let mut staged = tempfile::NamedTempFile::new_in(receipts).map_err(|e| e.to_string())?;
        staged
            .write_all(&serde_json::to_vec(&r).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        staged.as_file().sync_all().map_err(|e| e.to_string())?;
        // Atomic receipt replacement; installations/SQLite are never written.
        if let Err(e) = staged.persist(&receipt_file) {
            if bounded_read(&path, 64 * 1024).is_ok_and(|b| hash(&b) == r.sha256) {
                let _ = fs::remove_file(&path);
            }
            return Err(format!("Учёт ярлыка {}: {e}", receipt_file.display()));
        }
        Ok(())
    })();
    if let Err(e) = result {
        if bounded_read(&path, 64 * 1024).is_ok_and(|b| hash(&b) == r.sha256) {
            let _ = fs::remove_file(&path);
        }
        if let (Some(old), Some(bytes), Some(backup)) = (&previous, &old_bytes, backup) {
            if write_exclusive(&old.path, bytes).is_err() {
                let saved = backup.keep().map_err(|e| e.to_string())?.1;
                return Err(format!(
                    "{e}. Предыдущий ярлык сохранён: {}",
                    saved.display()
                ));
            }
        }
        return Err(e);
    }
    Ok(())
}
// Decode only catalog-validated WebP, with a second decoder limit, then letterbox.
// The resulting ICO holds 16/32/48/256px PNG frames; no external converter or URL.
fn make_ico(webp: &[u8]) -> Result<Vec<u8>, String> {
    use image::GenericImageView;
    let mut reader =
        image::ImageReader::with_format(std::io::Cursor::new(webp), image::ImageFormat::WebP);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|e| format!("WebP: {e}"))?;
    if u64::from(image.width()) * u64::from(image.height()) > 8_388_608 {
        return Err("Превышен размер изображения".into());
    }
    let mut frames = Vec::new();
    for size in [16, 32, 48, 256] {
        let scaled = image.thumbnail(size, size);
        let (w, h) = scaled.dimensions();
        let mut square = image::RgbaImage::new(size, size);
        image::imageops::overlay(
            &mut square,
            &scaled.to_rgba8(),
            i64::from((size - w) / 2),
            i64::from((size - h) / 2),
        );
        frames.push(
            image::codecs::ico::IcoFrame::as_png(
                square.as_raw(),
                size,
                size,
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| e.to_string())?,
        );
    }
    let mut out = Vec::new();
    image::codecs::ico::IcoEncoder::new(&mut out)
        .encode_images(&frames)
        .map_err(|e| e.to_string())?;
    Ok(out)
}
fn cache_icon(receipts: &Path, webp: &[u8]) -> Result<PathBuf, String> {
    let bytes = make_ico(webp)?;
    let icons = receipts.join("icons");
    crate::download::safe_existing(&icons)?;
    fs::create_dir_all(&icons).map_err(|e| e.to_string())?;
    let path = icons.join(format!("{}.ico", hash(&bytes)));
    if path.try_exists().map_err(|e| e.to_string())? {
        if bounded_read(&path, 1024 * 1024)? != bytes {
            return Err(format!("Кэш иконки изменён: {}", path.display()));
        }
    } else {
        write_exclusive(&path, &bytes)?;
    }
    Ok(path)
}
pub fn create(app: &tauri::AppHandle, id: &str) -> Result<String, String> {
    create_named(app, id, "Bloodborne")
}
pub fn create_named(app: &tauri::AppHandle, id: &str, name: &str) -> Result<String, String> {
    let expected = create_for_installation(app, id)?;
    // Name is compiled at installer call sites, never used as a path from IPC.
    if expected.0 != name {
        return Err("Название ярлыка не соответствует установке".into());
    }
    create_resolved(app, id, expected)
}
fn create_for_installation(
    app: &tauri::AppHandle,
    id: &str,
) -> Result<(&'static str, Option<Vec<u8>>), String> {
    use rusqlite::OptionalExtension;
    if !valid_id(id) {
        return Err("Недопустимый ID установки".into());
    }
    let db = app.state::<crate::Database>();
    let db = db.0.lock().map_err(|e| e.to_string())?;
    let collection: Option<String> = db
        .query_row(
            "SELECT json_extract(value,'$.collectionId') FROM installations WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let collection = collection.ok_or("Игра не найдена в библиотеке PORT")?;
    Ok((
        name_for(&collection)?,
        crate::catalog::shortcut_image(&db, &collection)?,
    ))
}
#[tauri::command]
pub async fn create_installation_shortcut(
    app: tauri::AppHandle,
    id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let resolved = create_for_installation(&app, &id)?;
        create_resolved(&app, &id, resolved)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn create_resolved(
    app: &tauri::AppHandle,
    id: &str,
    (name, webp): (&str, Option<Vec<u8>>),
) -> Result<String, String> {
    #[cfg(windows)]
    {
        let _guard = SHORTCUT_LOCK.lock().map_err(|e| e.to_string())?;
        let desktop = app
            .path()
            .desktop_dir()
            .map_err(|e| format!("Рабочий стол Windows: {e}"))?;
        let receipts = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("shortcuts");
        crate::download::safe_existing(&receipts)?;
        fs::create_dir_all(&receipts).map_err(|e| e.to_string())?;
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let (icon, warning) = match webp {
            Some(bytes) => match cache_icon(&receipts, &bytes) {
                Ok(path) => (path, String::new()),
                Err(e) => (exe.clone(), format!(" Использована иконка PORT: {e}.")),
            },
            None => (
                exe.clone(),
                " Проверенного изображения игры в локальном кэше нет; использована иконка PORT."
                    .into(),
            ),
        };
        create_at(&desktop, &receipts, &exe, &icon, id, name)?;
        Ok(format!(
            "Ярлык создан: {}.{warning}",
            desktop.join(format!("{name}.lnk")).display()
        ))
    }
    #[cfg(not(windows))]
    {
        let _ = (app, id, name, webp);
        Err("Ярлыки доступны только в Windows".into())
    }
}
#[cfg(windows)]
fn powershell() -> Result<PathBuf, String> {
    Ok(
        PathBuf::from(std::env::var_os("SystemRoot").ok_or("Windows directory unavailable")?)
            .join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    )
}
#[cfg(windows)]
fn create_at(
    desktop: &Path,
    receipts: &Path,
    exe: &Path,
    icon: &Path,
    id: &str,
    name: &str,
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    if !valid_id(id) || !["Bloodborne", "Skate 3"].contains(&name) {
        return Err("Недопустимый ярлык".into());
    }
    crate::download::safe_existing(desktop)?;
    if !desktop.is_dir() {
        return Err(format!(
            "Рабочий стол Windows недоступен: {}",
            desktop.display()
        ));
    }
    crate::download::safe_existing(receipts)?;
    fs::create_dir_all(receipts).map_err(|e| format!("{}: {e}", receipts.display()))?;
    // Unique staging avoids the old fixed ID.tmp.lnk crash residue blocking all retries.
    let staging = tempfile::tempdir_in(receipts).map_err(|e| e.to_string())?;
    let temp = staging.path().join("game.lnk");
    let errors =
        fs::File::create(staging.path().join("windows-error.txt")).map_err(|e| e.to_string())?;
    let mut child = std::process::Command::new(powershell()?)
        .args(["-NoLogo","-NoProfile","-NonInteractive","-Command",r#"[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $ErrorActionPreference='Stop'; try { $s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut($env:PORT_LINK); $l.TargetPath=$env:PORT_EXE; $l.Arguments='--launch-installation '+$env:PORT_ID; $l.WorkingDirectory=[IO.Path]::GetDirectoryName($env:PORT_EXE); $l.IconLocation=$env:PORT_ICON+',0'; $l.Description=$env:PORT_NAME+' — PORT'; $l.Save() } catch { [Console]::Error.WriteLine($_.Exception.ToString()); exit 1 }"#])
        .env("PORT_LINK",&temp).env("PORT_EXE",exe).env("PORT_ID",id).env("PORT_ICON",icon).env("PORT_NAME",name)
        .creation_flags(0x08000000).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(errors)
        .spawn().map_err(|e| format!("Запуск Windows Shell: {e}"))?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if !status.success() {
                let bytes = bounded_read(&staging.path().join("windows-error.txt"), 64 * 1024)
                    .unwrap_or_default();
                return Err(format!(
                    "Windows Shell ({status}), рабочий стол {}: {}",
                    desktop.display(),
                    String::from_utf8_lossy(&bytes)
                ));
            }
            break;
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "Windows Shell не ответил за 20 секунд; рабочий стол {}",
                desktop.display()
            ));
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    publish(&temp, desktop, receipts, id, name)
}
fn remove_owned(desktop: &Path, receipts: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("Недопустимый ID".into());
    }
    let Some(r) = read_receipt(desktop, receipts, id)? else {
        return Ok(());
    };
    if owned_bytes(&r)?.is_some() {
        fs::remove_file(&r.path).map_err(|e| format!("{}: {e}", r.path.display()))?;
    }
    fs::remove_file(receipt_path(receipts, id)).map_err(|e| e.to_string())
}
pub fn remove(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let _guard = SHORTCUT_LOCK.lock().map_err(|e| e.to_string())?;
    remove_owned(
        &app.path().desktop_dir().map_err(|e| e.to_string())?,
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("shortcuts"),
        id,
    )
}
#[cfg(test)]
#[path = "shortcut_tests.rs"]
mod tests;
