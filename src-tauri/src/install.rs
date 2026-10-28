//! Local installation lifecycle and durable staging; narrow updates live in install_inplace.rs.
#[path = "install_experience.rs"]
pub mod experience;
#[path = "library_management.rs"]
pub mod management;
#[path = "skate3.rs"]
pub mod skate3;
#[cfg(test)]
#[path = "install_tests.rs"]
mod tests;
#[path = "install_inplace.rs"]
pub(crate) mod update;
use crate::{download, package, Database};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const RESERVE: u64 = 512 * 1024 * 1024;
const MAX_FILES: usize = 100_000;
const MAX_BYTES: u64 = 128 * 1024 * 1024 * 1024;
const RUNTIME: &str = "bbport-windows";
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[cfg(windows)]
fn in_use(root: &Path) -> Result<bool> {
    use windows_sys::Win32::{
        Foundation::*,
        System::{Diagnostics::ToolHelp::*, Threading::*},
    };
    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    let prefix = format!(
        "{}\\",
        root.to_string_lossy()
            .replace('/', "\\")
            .trim_end_matches('\\')
    )
    .to_lowercase();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(err(std::io::Error::last_os_error()));
        }
        let snapshot = Handle(snapshot);
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of_val(&entry) as u32;
        let mut present = Process32FirstW(snapshot.0, &mut entry) != 0;
        while present {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID);
            if !process.is_null() {
                let process = Handle(process);
                let mut name = vec![0u16; 32768];
                let mut length = name.len() as u32;
                if QueryFullProcessImageNameW(process.0, 0, name.as_mut_ptr(), &mut length) != 0 {
                    let name = String::from_utf16_lossy(&name[..length as usize]);
                    if name
                        .trim_start_matches("\\\\?\\")
                        .to_lowercase()
                        .starts_with(&prefix)
                    {
                        return Ok(true);
                    }
                }
            }
            present = Process32NextW(snapshot.0, &mut entry) != 0;
        }
        Ok(false)
    }
}
#[cfg(not(windows))]
fn in_use(_root: &Path) -> Result<bool> {
    Ok(false)
}
fn open_read(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1);
    }
    options.open(path).map_err(err)
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    #[serde(skip_serializing_if = "Option::is_none")]
    collection_id: Option<String>,
    phase: String,
    completed: u64,
    total: u64,
    message: String,
    active: bool,
    #[serde(skip)]
    cancel: bool,
}
#[derive(Default)]
pub struct Installer {
    status: Arc<Mutex<Status>>,
    child: Arc<Mutex<Option<Child>>>,
    runtime_lock: Arc<Mutex<Option<File>>>,
}
impl Installer {
    pub fn recovery_error(&self, error: &str) {
        if let Ok(mut s) = self.status.lock() {
            s.phase = "error".into();
            s.message=format!("Восстановление временной установки не завершено: {error}. Файлы сохранены; проверьте доступ к её диску и перезапустите PORT.");
        }
    }
}
pub(crate) struct Operation(Arc<Mutex<Status>>);
impl Drop for Operation {
    fn drop(&mut self) {
        if let Ok(mut s) = self.0.lock() {
            s.active = false;
        }
    }
}
fn operation(state: &Installer, name: &str) -> Result<Operation> {
    let mut s = state.status.lock().map_err(err)?;
    if s.active {
        return Err("Дождитесь завершения операции".into());
    }
    *s = Status {
        phase: name.into(),
        active: true,
        ..Status::default()
    };
    Ok(Operation(state.status.clone()))
}
pub(crate) fn updater_operation(state: &Installer) -> Result<Operation> {
    operation(state, "launcher-update")
}
pub(crate) fn updater_safe(app: &tauri::AppHandle, state: &Installer) -> Result<()> {
    let mut child = state.child.lock().map_err(err)?;
    if let Some(child) = child.as_mut() {
        if child.try_wait().map_err(err)?.is_none() {
            return Err("Закройте запущенную игру перед обновлением PORT".into());
        }
    }
    let items = with_db(app, records)?;
    for item in items {
        if in_use(Path::new(&item.root))? {
            return Err("Закройте запущенную игру перед обновлением PORT".into());
        }
    }
    Ok(())
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Installation {
    id: String,
    collection_id: String,
    root: String,
    data_path: String,
    runtime_path: String,
    version: Option<String>,
    manifest_sha256: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    path: String,
    version: Option<String>,
    title_id: String,
    files: usize,
    bytes: u64,
    warning: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    path: String,
    size: u64,
    sha256: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    schema: u32,
    id: String,
    version: Option<String>,
    files: Vec<Entry>,
}

fn checkpoint(s: &Arc<Mutex<Status>>) -> Result<()> {
    if s.lock().map_err(err)?.cancel {
        Err("Отменено пользователем".into())
    } else {
        Ok(())
    }
}
fn phase(s: &Arc<Mutex<Status>>, name: &str, message: &str) {
    if let Ok(mut s) = s.lock() {
        s.phase = name.into();
        s.message = message.into();
    }
}
fn progress(s: &Arc<Mutex<Status>>, n: u64) {
    if let Ok(mut s) = s.lock() {
        s.completed += n;
    }
}
fn safe(p: &Path) -> Result<()> {
    if !p.is_absolute() || p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("Нужен абсолютный путь без переходов ..".into());
    }
    // UNC/device/network namespaces are not installation destinations or game sources.
    #[cfg(windows)]
    if !matches!(p.components().next(), Some(Component::Prefix(c)) if matches!(c.kind(), std::path::Prefix::Disk(_)))
    {
        return Err("Нужен локальный путь с буквой диска".into());
    }
    download::safe_existing(p)
}
fn relative(p: &str) -> Result<()> {
    if p.len() > 2000 || p.split('/').count() > 32 || !download::safe_zip_name(p) {
        return Err(format!("Небезопасное имя: {p}"));
    }
    Ok(())
}
fn scan(root: &Path, s: &Arc<Mutex<Status>>) -> Result<Vec<Entry>> {
    safe(root)?;
    if !root.is_dir() {
        return Err("Папка не найдена".into());
    }
    let mut stack = vec![(root.to_path_buf(), String::new(), 0)];
    let mut entries = Vec::new();
    let mut names = HashSet::new();
    let mut total = 0u64;
    let mut count = 0usize;
    while let Some((dir, prefix, depth)) = stack.pop() {
        checkpoint(s)?;
        if depth > 32 {
            return Err("Слишком большая глубина папок".into());
        }
        safe(&dir)?;
        for item in fs::read_dir(&dir).map_err(err)? {
            checkpoint(s)?;
            let item = item.map_err(err)?;
            count += 1;
            if count > MAX_FILES {
                return Err("Слишком много файлов / папок".into());
            }
            let name = item
                .file_name()
                .into_string()
                .map_err(|_| "Имя файла не UTF-8")?;
            let name = format!("{prefix}{name}");
            relative(&name)?;
            if !names.insert(name.to_lowercase()) {
                return Err("Конфликт имён без учёта регистра".into());
            }
            safe(&item.path())?;
            let m = fs::symlink_metadata(item.path()).map_err(err)?;
            if m.is_dir() {
                stack.push((item.path(), format!("{name}/"), depth + 1));
            } else if m.is_file() {
                total = total.checked_add(m.len()).ok_or("Переполнение размера")?;
                if total > MAX_BYTES || m.len() > 32 * 1024 * 1024 * 1024 {
                    return Err("Превышен лимит размера".into());
                }
                entries.push(Entry {
                    path: name,
                    size: m.len(),
                    sha256: String::new(),
                });
            } else {
                return Err("Разрешены только обычные файлы и папки".into());
            }
        }
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}
fn read_small(path: &Path, max: u64) -> Result<Vec<u8>> {
    safe(path)?;
    let f = File::open(path).map_err(err)?;
    if f.metadata().map_err(err)?.len() > max {
        return Err("Файл метаданных слишком большой".into());
    }
    let mut bytes = Vec::new();
    f.take(max + 1).read_to_end(&mut bytes).map_err(err)?;
    if bytes.len() as u64 > max {
        return Err("Файл изменён во время чтения".into());
    }
    Ok(bytes)
}
fn inspect(
    root: &Path,
    s: &Arc<Mutex<Status>>,
    completeness: bool,
) -> Result<(Folder, Vec<Entry>)> {
    let files = scan(root, s)?;
    for p in [
        "eboot.bin",
        "sce_sys/param.sfo",
        "dvdroot_ps4/shader/gxshader.shaderbnd.dcx",
    ] {
        if !files.iter().any(|e| e.path == p && e.size > 0) {
            return Err(format!("Не найден обязательный файл: {p}"));
        }
    }
    if !root.join("sce_module").is_dir() || !files.iter().any(|e| e.path.starts_with("sce_module/"))
    {
        return Err("Нужна полная папка sce_module".into());
    }
    let meta = package::sfo(&read_small(&root.join("sce_sys/param.sfo"), 1024 * 1024)?)?;
    if meta.get("TITLE_ID").map(String::as_str) != Some("CUSA03173") {
        return Err("SuperMedo выбран для CUSA03173; TITLE_ID не совпадает".into());
    }
    if !matches!(meta.get("CATEGORY").map(String::as_str), Some("gd" | "gp")) {
        return Err("Не распознана игровая CATEGORY в PARAM.SFO".into());
    }
    let mut head = [0; 8];
    File::open(root.join("eboot.bin"))
        .map_err(err)?
        .read_exact(&mut head)
        .map_err(err)?;
    if head[..4] != [0x4f, 0x15, 0x3d, 0x1d] {
        return Err(
            "eboot.bin: ожидался PS4 SELF; доступность расшифрованного содержимого не подтверждена"
                .into(),
        );
    }
    let version = meta
        .get("APP_VER")
        .filter(|v| {
            let b = v.as_bytes();
            b.len() == 5
                && b[2] == b'.'
                && b.iter()
                    .enumerate()
                    .all(|(i, b)| i == 2 || b.is_ascii_digit())
        })
        .cloned();
    let bytes = files.iter().map(|e| e.size).sum();
    // Same coarse completeness floor as the pinned launcher's run_checks; never proof of a dump.
    if completeness && (files.len() < 20_000 || bytes < 20 * 1024 * 1024 * 1024) {
        return Err(
            "Неполная папка: SuperMedo ожидает >=20000 файлов и >=20 ГиБ, а не только обновление"
                .into(),
        );
    }
    if completeness && files.iter().any(|e| e.size == 0) {
        return Err("В игровых данных есть пустые файлы; проверьте исходный дамп".into());
    }
    Ok((Folder { path: root.display().to_string(), version: version.clone(), title_id: "CUSA03173".into(), files: files.len(), bytes,
        warning: if version.as_deref() == Some("01.09") { "APP_VER 01.09 подтверждён метаданными; чистота eboot и работоспособность проверяются runtime." } else { "Версия по PARAM.SFO либо неизвестна. Upstream описывает другие версии в 30 FPS без патчей 1.09; запуск не гарантирован." }.into() }, files))
}
fn stream<R: Read>(
    mut input: R,
    destination: Option<&Path>,
    expected: u64,
    s: &Arc<Mutex<Status>>,
) -> Result<String> {
    let mut output = match destination {
        Some(p) => {
            safe(p)?;
            fs::create_dir_all(p.parent().ok_or("Нет родительской папки")?).map_err(err)?;
            safe(p)?;
            Some(
                OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(p)
                    .map_err(err)?,
            )
        }
        None => None,
    };
    let mut hash = Sha256::new();
    let mut count = 0u64;
    // Nested installer/HTTP reads must not reserve megabyte frames on Windows workers.
    let mut buf = vec![0; 1024 * 1024];
    loop {
        checkpoint(s)?;
        let n = input.read(&mut buf).map_err(err)?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > expected {
            return Err("Размер файла изменился при чтении".into());
        }
        hash.update(&buf[..n]);
        if let Some(f) = &mut output {
            f.write_all(&buf[..n]).map_err(err)?;
        }
        progress(s, n as u64);
    }
    if count != expected {
        return Err("Файл обрезан при чтении".into());
    }
    if let Some(f) = output {
        f.sync_all().map_err(err)?;
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn cache_zip(cache: &Path, s: &Arc<Mutex<Status>>) -> Result<zip::ZipArchive<File>> {
    #[derive(Deserialize)]
    struct Pin {
        asset: String,
        size: u64,
        sha256: String,
    }
    let pin: Pin = serde_json::from_str(include_str!("runtime-manifest.json")).map_err(err)?;
    let p = cache.join("runtime").join(pin.asset);
    safe(&p)?;
    let mut f = File::open(&p)
        .map_err(|e| format!("Сначала скачайте компоненты SuperMedo или восстановите кэш: {e}"))?;
    if f.metadata().map_err(err)?.len() != pin.size
        || stream(&mut f, None, pin.size, s)? != pin.sha256
    {
        return Err("SHA-256 кэша runtime не совпадает".into());
    }
    f.seek(SeekFrom::Start(0)).map_err(err)?;
    zip::ZipArchive::new(f).map_err(err)
}
fn extract(
    zip: &mut zip::ZipArchive<File>,
    target: &Path,
    s: &Arc<Mutex<Status>>,
) -> Result<Vec<Entry>> {
    if zip.len() > 20_000 {
        return Err("Лимит записей ZIP".into());
    }
    let mut files = Vec::new();
    let mut names = HashSet::new();
    let mut total = 0u64;
    for i in 0..zip.len() {
        checkpoint(s)?;
        let mut e = zip.by_index(i).map_err(err)?;
        let name = e.name().trim_end_matches('/').to_string();
        relative(&name)?;
        if !name.starts_with("bbport-windows/") && name != RUNTIME {
            return Err("Неожиданный корень runtime ZIP".into());
        }
        if !names.insert(name.to_lowercase())
            || e.is_symlink()
            || e.encrypted()
            || !matches!(
                e.unix_mode().unwrap_or(0) & 0o170000,
                0 | 0o100000 | 0o040000
            )
        {
            return Err("Небезопасная запись ZIP".into());
        }
        total = total.checked_add(e.size()).ok_or("ZIP overflow")?;
        if total > 2 * 1024 * 1024 * 1024
            || e.size() > 512 * 1024 * 1024
            || e.size()
                > e.compressed_size()
                    .saturating_mul(500)
                    .saturating_add(1024 * 1024)
        {
            return Err("ZIP превышает лимиты распаковки".into());
        }
        let p = target.join(&name);
        safe(&p)?;
        if e.is_dir() {
            fs::create_dir_all(&p).map_err(err)?;
        } else {
            let size = e.size();
            let hash = stream(&mut e, Some(&p), size, s)?;
            files.push(Entry {
                path: name,
                size,
                sha256: hash,
            });
        }
    }
    for required in [
        "Bloodborne.exe",
        "Play Bloodborne.exe",
        "bin/bb-probe.exe",
        "bin/bb-gpu-capabilities.exe",
        "run.py",
        "LICENSE",
        "README-Windows.txt",
    ] {
        if !files
            .iter()
            .any(|e| e.path == format!("{RUNTIME}/{required}") && e.size > 0)
        {
            return Err(format!("В runtime отсутствует {required}"));
        }
    }
    let mut magic = [0; 2];
    File::open(target.join(RUNTIME).join("Bloodborne.exe"))
        .map_err(err)?
        .read_exact(&mut magic)
        .map_err(err)?;
    if &magic != b"MZ" {
        return Err("Bloodborne.exe не является Windows PE".into());
    }
    Ok(files)
}
fn write_new(p: &Path, data: &[u8]) -> Result<()> {
    safe(p)?;
    let mut f = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(p)
        .map_err(err)?;
    f.write_all(data).map_err(err)?;
    f.sync_all().map_err(err)
}
fn space(path: &Path, needed: u64) -> Result<()> {
    let available = fs2::available_space(path).map_err(err)?;
    let required = needed
        .checked_add(RESERVE)
        .ok_or("Размер слишком большой")?;
    if available < required {
        return Err(format!("Недостаточно места: нужно {:.1} ГиБ (включая временные файлы и 512 МиБ резерва), доступно {:.1} ГиБ", required as f64 / 1073741824.0, available as f64 / 1073741824.0));
    }
    Ok(())
}
// No recursive removal until a complete bounded no-link walk has succeeded.
fn cleanup(path: &Path) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    scan(path, &Arc::default())?;
    safe(path)?;
    fs::remove_dir_all(path).map_err(err)
}
fn with_db<T>(app: &tauri::AppHandle, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    let db = app.state::<Database>();
    let db = db.0.lock().map_err(err)?;
    f(&db)
}
fn register(db: &Connection, record: &Installation) -> Result<()> {
    db.execute(
        "INSERT INTO installations(id,value) VALUES(?1,?2)",
        params![record.id, serde_json::to_string(record).map_err(err)?],
    )
    .map_err(err)?;
    Ok(())
}
fn records(db: &Connection) -> Result<Vec<Installation>> {
    let mut q = db
        .prepare("SELECT value FROM installations ORDER BY id")
        .map_err(err)?;
    let result = q
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(err)?
        .map(|s| serde_json::from_str(&s.map_err(err)?).map_err(err))
        .collect();
    result
}
fn get(app: &tauri::AppHandle, id: &str) -> Result<Installation> {
    with_db(app, |db| {
        if db
            .query_row("SELECT COUNT(*) FROM update_jobs", [], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(err)?
            > 0
        {
            return Err("Есть незавершённое обновление. Перезапустите PORT для восстановления; запуск и удаление временно заблокированы.".into());
        }
        records(db)?
            .into_iter()
            .find(|r| r.id == id)
            .ok_or("Установка не найдена в SQLite".into())
    })
}
fn load_manifest(record: &Installation) -> Result<Manifest> {
    record_paths(record)?;
    let root = Path::new(&record.root);
    let bytes = read_small(&root.join("port-manifest.json"), 32 * 1024 * 1024)?;
    manifest_bytes(record, &bytes)
}
fn record_paths(record: &Installation) -> Result<()> {
    let root = Path::new(&record.root);
    safe(root)?;
    let adapter = crate::adapters::get(&record.collection_id)?;
    if (record.collection_id == "skate3" && !experience::valid_id(&record.id))
        || record.data_path != root.join(adapter.data).display().to_string()
        || record.runtime_path != root.join(adapter.runtime).display().to_string()
        || !management::owned_root(root, adapter, &record.id)
    {
        return Err("Некорректная запись установки".into());
    }
    Ok(())
}
fn manifest_bytes(record: &Installation, bytes: &[u8]) -> Result<Manifest> {
    if format!("{:x}", Sha256::digest(bytes)) != record.manifest_sha256 {
        return Err("Манифест установки изменён".into());
    }
    let m: Manifest = serde_json::from_slice(bytes).map_err(err)?;
    if m.schema != 1
        || m.id != record.id
        || m.version != record.version
        || m.files.len() > MAX_FILES
    {
        return Err("Некорректный манифест".into());
    }
    let mut names = HashSet::new();
    for e in &m.files {
        relative(&e.path)?;
        if !names.insert(e.path.to_lowercase())
            || !(e.path.starts_with(&format!(
                "{}/",
                crate::adapters::get(&record.collection_id)?.data
            )) || e.path.starts_with(&format!(
                "{}/",
                crate::adapters::get(&record.collection_id)?.runtime
            )))
            || e.sha256.len() != 64
        {
            return Err("Некорректная запись манифеста".into());
        }
    }
    Ok(m)
}
fn verify(record: &Installation, all: bool, s: &Arc<Mutex<Status>>) -> Result<()> {
    if record.collection_id == "skate3" {
        return skate3::verify(record, all, s);
    }
    let m = load_manifest(record)?;
    let root = Path::new(&record.root);
    let runtime = scan(&root.join(RUNTIME), s)?;
    let expected: HashSet<_> = m
        .files
        .iter()
        .filter_map(|e| e.path.strip_prefix("bbport-windows/"))
        .collect();
    if runtime.iter().any(|e| !expected.contains(e.path.as_str())) {
        return Err("В runtime появились посторонние файлы; запуск заблокирован".into());
    }
    for e in &m.files {
        checkpoint(s)?;
        let path = root.join(&e.path);
        package::regular_file(&path)?;
        if fs::metadata(&path).map_err(err)?.len() != e.size {
            return Err(format!("Неполный или изменённый файл: {}", e.path));
        }
        if !all
            && !(e.path.starts_with("bbport-windows/")
                || e.path == "CUSA03173/eboot.bin"
                || e.path == "CUSA03173/sce_sys/param.sfo")
        {
            continue;
        }
        if stream(File::open(&path).map_err(err)?, None, e.size, s)? != e.sha256 {
            return Err(format!("Повреждён или изменён файл: {}", e.path));
        }
    }
    if all {
        inspect(&root.join("CUSA03173"), s, true)?;
    }
    Ok(())
}

fn install_job(
    app: &tauri::AppHandle,
    source: Option<String>,
    packages: Vec<String>,
    parent: String,
    destination_id: Option<String>,
    desktop_shortcut: bool,
    s: &Arc<Mutex<Status>>,
) -> Result<()> {
    let parent = PathBuf::from(parent);
    let id = destination_id.map(Ok).unwrap_or_else(experience::new_id)?;
    let root = with_db(app, |db| {
        experience::destination(&parent, &id, &records(db)?)
    })?;
    let cache = app.path().app_cache_dir().map_err(err)?;
    phase(
        s,
        "validating",
        "Проверка исходных файлов и свободного места",
    );
    let inspected = source
        .as_ref()
        .map(|p| inspect(Path::new(p), s, true))
        .transpose()?;
    if let Some((folder, _)) = &inspected {
        let canonical_source = fs::canonicalize(&folder.path).map_err(err)?;
        let canonical_parent = fs::canonicalize(&parent).map_err(err)?;
        if canonical_parent.starts_with(&canonical_source) {
            return Err("Исходная папка и папка назначения должны находиться отдельно".into());
        }
    }
    let base = if packages.is_empty() {
        None
    } else {
        Some(crate::pkg_worker::base(&packages)?.to_string())
    };
    let has_game = source.is_some() || base.is_some();
    let bytes = if let Some(p) = &base {
        fs::metadata(p).map_err(err)?.len()
    } else {
        inspected.as_ref().map_or(0, |(f, _)| f.bytes)
    };
    space(
        &parent,
        bytes
            .checked_add(3 * 1024 * 1024 * 1024)
            .ok_or("Размер слишком большой")?,
    )?;
    phase(
        s,
        "verifying",
        "Повторная проверка закреплённого SHA-256 кэша (интернет не требуется)",
    );
    if let Ok(mut status) = s.lock() {
        status.completed = 0;
        status.total = 0;
    }
    let mut zip = cache_zip(&cache, s)?;
    let stage = parent.join(format!(".port-stage-{id}"));
    // Durable intent before any output; recovery handles both sides of the final rename.
    with_db(app, |db| {
        db.execute(
            "INSERT INTO installation_jobs(id,staging,root) VALUES(?1,?2,?3)",
            params![id, stage.display().to_string(), root.display().to_string()],
        )
        .map_err(err)?;
        Ok(())
    })?;
    let mut stage_created = false;
    let result = (|| {
        safe(&stage)?;
        fs::create_dir(&stage).map_err(err)?;
        stage_created = true;
        write_new(&stage.join("port-owner"), id.as_bytes())?;
        if let Ok(mut status) = s.lock() {
            status.total = bytes
                + zip
                    .decompressed_size()
                    .unwrap_or(0)
                    .min(u128::from(u64::MAX)) as u64;
            status.completed = 0;
        }
        let mut entries = Vec::new();
        if let Some(base) = &base {
            phase(
                s,
                "extracting",
                "Извлечение совместимого основного PKG; обновление не применяется",
            );
            let target = stage.join("pkg-output");
            crate::pkg_worker::extract(
                base,
                &target,
                &cache,
                |done, total| {
                    if let Ok(mut status) = s.lock() {
                        status.completed = done;
                        status.total = total;
                    }
                },
                || checkpoint(s).is_err(),
            )?;
            fs::rename(target.join("uroot"), stage.join("CUSA03173")).map_err(err)?;
            fs::remove_dir(&target).map_err(err)?;
            let (_, files) = inspect(&stage.join("CUSA03173"), s, true)?;
            phase(
                s,
                "verifying",
                "Создание SHA-256 манифеста извлечённых игровых файлов",
            );
            if let Ok(mut status) = s.lock() {
                status.completed = 0;
                status.total = files.iter().map(|e| e.size).sum();
            }
            for e in files {
                let path = stage.join("CUSA03173").join(&e.path);
                let hash = stream(File::open(path).map_err(err)?, None, e.size, s)?;
                entries.push(Entry {
                    path: format!("CUSA03173/{}", e.path),
                    size: e.size,
                    sha256: hash,
                });
            }
        }
        if let Some((_, files)) = &inspected {
            phase(
                s,
                "copying",
                "Копирование собственной папки; исходник не изменяется",
            );
            for e in files {
                checkpoint(s)?;
                let from = Path::new(source.as_ref().unwrap()).join(&e.path);
                package::regular_file(&from)?;
                let p = format!("CUSA03173/{}", e.path);
                let hash = stream(open_read(&from)?, Some(&stage.join(&p)), e.size, s)?;
                entries.push(Entry {
                    path: p,
                    size: e.size,
                    sha256: hash,
                });
            }
            inspect(&stage.join("CUSA03173"), s, true)?;
        }
        phase(
            s,
            "extracting",
            "Безопасное извлечение проверенного Windows-runtime",
        );
        if base.is_some() {
            if let Ok(mut status) = s.lock() {
                status.total = status.completed
                    + zip
                        .decompressed_size()
                        .unwrap_or(0)
                        .min(u128::from(u64::MAX)) as u64;
            }
        }
        entries.extend(extract(&mut zip, &stage, s)?);
        let version = if has_game {
            inspect(&stage.join("CUSA03173"), s, true)?.0.version
        } else {
            None
        };
        let m = Manifest {
            schema: 1,
            id: id.clone(),
            version: version.clone(),
            files: entries,
        };
        let bytes = serde_json::to_vec(&m).map_err(err)?;
        if bytes.len() > 32 * 1024 * 1024 {
            return Err("Манифест установки превышает допустимый размер".into());
        }
        write_new(&stage.join("port-manifest.json"), &bytes)?;
        checkpoint(s)?;
        // Lock status through rename/DB commit: cancel cannot report success after commit starts.
        let mut status = s.lock().map_err(err)?;
        if status.cancel {
            return Err("Отменено пользователем".into());
        }
        safe(&root)?;
        if root.exists() {
            return Err("Папка установки уже существует".into());
        }
        fs::rename(&stage, &root).map_err(err)?;
        let record = Installation {
            id: id.clone(),
            collection_id: "bloodborne".into(),
            root: root.display().to_string(),
            data_path: root.join("CUSA03173").display().to_string(),
            runtime_path: root.join(RUNTIME).display().to_string(),
            version,
            manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        with_db(app, |db| {
            db.execute_batch("BEGIN IMMEDIATE").map_err(err)?;
            let r = (|| {
                if has_game {
                    register(db, &record)?;
                }
                db.execute("DELETE FROM installation_jobs WHERE id=?1", [&id])
                    .map_err(err)?;
                Ok(())
            })();
            match r {
                Ok(()) => db.execute_batch("COMMIT").map_err(err),
                Err(e) => {
                    let _ = db.execute_batch("ROLLBACK");
                    Err(e)
                }
            }
        })?;
        status.phase = "ready".into();
        status.message = if has_game {
            format!(
                "Установлено: {}. Загрузка самой игры ещё не подтверждена. Обновление PKG не применялось.",
                record.data_path
            )
        } else {
            format!(
                "Runtime проверен и подготовлен: {}. Игровых данных нет; библиотека не изменена.",
                record.runtime_path
            )
        };
        if has_game && desktop_shortcut {
            status.phase = "finishing".into();
            drop(status);
            let shortcut_result = crate::shortcuts::create(app, &id);
            status = s.lock().map_err(err)?;
            status.phase = "ready".into();
            match shortcut_result {
                Ok(()) => status.message.push_str(" Ярлык создан на рабочем столе."),
                Err(_) => status.message.push_str(" Игра установлена, но ярлык создать не удалось. Запускайте её из библиотеки PORT."),
            }
        }
        status.active = false;
        Ok(())
    })();
    if let Err(ref failure) = result {
        if !root.exists() {
            match if stage_created {
                cleanup(&stage)
            } else {
                Ok(())
            } {
                Ok(()) => {
                    with_db(app, |db| {
                        db.execute("DELETE FROM installation_jobs WHERE id=?1", [&id])
                            .map_err(err)?;
                        Ok(())
                    })?;
                }
                Err(e) => {
                    return Err(format!(
                        "{}; очистка не завершена: {e}. Восстановление при следующем запуске PORT.",
                        failure
                    ))
                }
            }
        }
    }
    result
}

pub fn recover(db: &Connection) -> Result<()> {
    update::recover(db)?;
    let jobs: Vec<(String, String, String)> = {
        let mut q = db
            .prepare("SELECT id,staging,root FROM installation_jobs")
            .map_err(err)?;
        let v = q
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        v
    };
    for (id, stage, root) in jobs {
        let stage = Path::new(&stage);
        let root = Path::new(&root);
        safe(stage)?;
        safe(root)?;
        let adapter = if root
            .file_name()
            .and_then(|v| v.to_str())
            .is_some_and(|name| name == format!("PORT-Skate3-{id}") || name == "Skate 3")
        {
            &crate::adapters::SKATE3
        } else {
            &crate::adapters::BLOODBORNE
        };
        if stage.file_name().and_then(|v| v.to_str()) != Some(format!(".port-stage-{id}").as_str())
            || !(management::owned_root(root, adapter, &id)
                || (!root.exists()
                    && root.file_name().and_then(|n| n.to_str())
                        == Some(if adapter.id == "skate3" {
                            "Skate 3"
                        } else {
                            adapter.name
                        })))
            || stage.parent() != root.parent()
        {
            return Err("Некорректный журнал восстановления".into());
        }
        if root.exists() {
            if read_small(&root.join("port-owner"), 256)? != id.as_bytes() {
                return Err("Не совпадает владелец установки".into());
            }
            let bytes = read_small(&root.join("port-manifest.json"), 32 * 1024 * 1024)?;
            let m: Manifest = serde_json::from_slice(&bytes).map_err(err)?;
            let record = Installation {
                id: id.clone(),
                collection_id: adapter.id.into(),
                root: root.display().to_string(),
                data_path: root.join(adapter.data).display().to_string(),
                runtime_path: root.join(adapter.runtime).display().to_string(),
                version: m.version,
                manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
            };
            if adapter.id == "skate3" {
                verify(&record, true, &Arc::default())?;
            } else {
                load_manifest(&record)?;
            }
            if root.join(adapter.data).is_dir() {
                let exists: Option<String> = db
                    .query_row("SELECT id FROM installations WHERE id=?1", [&id], |r| {
                        r.get(0)
                    })
                    .optional()
                    .map_err(err)?;
                if exists.is_none() {
                    register(db, &record)?;
                }
            }
        } else if stage.exists() {
            let owner = stage.join("port-owner");
            if owner.exists() && read_small(&owner, 256)? != id.as_bytes() {
                return Err("Не совпадает владелец временной папки".into());
            }
            // A crash before owner creation may leave an empty directory only.
            if !owner.exists() && fs::read_dir(stage).map_err(err)?.next().is_some() {
                return Err("Нельзя очистить неизвестную временную папку".into());
            }
            if adapter.id == "skate3" {
                skate3::preserve_profile(stage, &id)?;
            }
            cleanup(stage)?;
        }
        db.execute("DELETE FROM installation_jobs WHERE id=?1", [&id])
            .map_err(err)?;
    }
    Ok(())
}
#[tauri::command]
pub async fn inspect_game_folder(path: String) -> Result<Folder> {
    tauri::async_runtime::spawn_blocking(move || {
        inspect(Path::new(&path), &Arc::default(), true).map(|v| v.0)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub fn install_status(state: tauri::State<Installer>) -> Result<Status> {
    Ok(state.status.lock().map_err(err)?.clone())
}
#[tauri::command]
pub fn cancel_install(state: tauri::State<Installer>) -> Result<()> {
    let mut s = state.status.lock().map_err(err)?;
    request_cancel(&mut s)
}
fn request_cancel(s: &mut Status) -> Result<()> {
    if !s.active {
        return Err("Нет активной операции".into());
    }
    if !matches!(
        s.phase.as_str(),
        "validating"
            | "verifying"
            | "copying"
            | "extracting"
            | "updating"
            | "downloading"
            | "setup"
    ) {
        return Err("Эта операция не поддерживает отмену".into());
    }
    s.cancel = true;
    Ok(())
}
fn start(
    app: tauri::AppHandle,
    state: tauri::State<Installer>,
    source: Option<String>,
    packages: Vec<String>,
    parent: String,
    destination_id: Option<String>,
    desktop_shortcut: bool,
) -> Result<()> {
    let mut s = state.status.lock().map_err(err)?;
    if s.active {
        return Err("Уже выполняется операция установки / проверки".into());
    }
    *s = Status {
        phase: "validating".into(),
        active: true,
        ..Status::default()
    };
    drop(s);
    let status = state.status.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = install_job(
            &app,
            source,
            packages,
            parent,
            destination_id,
            desktop_shortcut,
            &status,
        ) {
            if let Ok(mut s) = status.lock() {
                s.phase = if s.cancel { "cancelled" } else { "error" }.into();
                s.message = e;
                s.active = false;
            }
        }
    });
    Ok(())
}
#[tauri::command]
pub fn import_game_folder(
    app: tauri::AppHandle,
    state: tauri::State<Installer>,
    source: String,
    parent: String,
    destination_id: Option<String>,
    desktop_shortcut: Option<bool>,
) -> Result<()> {
    start(
        app,
        state,
        Some(source),
        Vec::new(),
        parent,
        destination_id,
        desktop_shortcut.unwrap_or(false),
    )
}
#[tauri::command]
pub fn prepare_runtime(
    app: tauri::AppHandle,
    state: tauri::State<Installer>,
    parent: String,
) -> Result<()> {
    start(app, state, None, Vec::new(), parent, None, false)
}
#[tauri::command]
pub fn install_packages(
    app: tauri::AppHandle,
    state: tauri::State<Installer>,
    paths: Vec<String>,
    parent: String,
    destination_id: Option<String>,
    desktop_shortcut: Option<bool>,
) -> Result<()> {
    if paths.is_empty() || paths.len() > 2 {
        return Err("Выберите один основной PKG и, при наличии, одно обновление".into());
    }
    if !crate::pkg_worker::pkg_install_available() {
        return Err("PKG worker отсутствует в этой сборке".into());
    }
    start(
        app,
        state,
        None,
        paths,
        parent,
        destination_id,
        desktop_shortcut.unwrap_or(false),
    )
}
#[tauri::command]
pub fn list_installations(db: tauri::State<Database>) -> Result<Vec<serde_json::Value>> {
    let conn = db.0.lock().map_err(err)?;
    records(&conn).map(|items| {
        items
            .into_iter()
            .map(|r| {
                let removing = conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM removal_jobs WHERE id=?1)",
                        [&r.id],
                        |row| row.get::<_, bool>(0),
                    )
                    .unwrap_or(false);
                let health = if removing {
                    "broken"
                } else if !Path::new(&r.root).exists() {
                    "missing"
                } else if load_manifest(&r).is_err()
                    || !Path::new(&r.data_path).is_dir()
                    || crate::adapters::get(&r.collection_id)
                        .is_ok_and(|a| !Path::new(&r.runtime_path).join(a.executable).is_file())
                {
                    "broken"
                } else {
                    "installed"
                };
                let mut value = serde_json::to_value(r).expect("installation");
                value["health"] = health.into();
                value
            })
            .collect()
    })
}
/// Reuses the launch/removal process-path guard, including after PORT restarts.
#[tauri::command]
pub fn running_installations(db: tauri::State<Database>) -> Result<Vec<String>> {
    let items = {
        let conn = db.0.lock().map_err(err)?;
        records(&conn)?
    };
    items
        .into_iter()
        .filter_map(|item| match in_use(Path::new(&item.root)) {
            Ok(true) => Some(Ok(item.id)),
            Ok(false) => None,
            Err(e) => Some(Err(e)),
        })
        .collect()
}
#[tauri::command]
pub async fn verify_installation(
    app: tauri::AppHandle,
    state: tauri::State<'_, Installer>,
    id: String,
) -> Result<String> {
    let record = get(&app, &id)?;
    {
        let mut s = state.status.lock().map_err(err)?;
        if s.active {
            return Err("Дождитесь завершения установки / проверки".into());
        }
        *s = Status {
            phase: "verifying".into(),
            active: true,
            ..Status::default()
        };
    }
    let status = state.status.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = verify(&record, true, &status).map(|_| "SHA-256 всех установленных файлов совпадает с импортом. Это не проверка подлинности дампа или gameplay.".to_string());
        if let Ok(mut s) = status.lock() { s.active = false; s.phase = if result.is_ok() { "ready" } else if s.cancel { "cancelled" } else { "error" }.into(); s.message = result.clone().unwrap_or_else(|e| e); }
        result
    }).await.map_err(err)?
}
#[tauri::command]
pub async fn launch_installation(
    app: tauri::AppHandle,
    state: tauri::State<'_, Installer>,
    id: String,
    setup: Option<bool>,
) -> Result<String> {
    let operation = operation(&state, "launching")?;
    with_db(&app, |db| {
        if db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM removal_jobs WHERE id=?1)",
                [&id],
                |r| r.get::<_, bool>(0),
            )
            .map_err(err)?
        {
            return Err("Удаление не завершено. Повторите удаление в библиотеке".into());
        }
        Ok(())
    })?;
    let record = get(&app, &id)?;
    let child = state.child.clone();
    let runtime_lock = state.runtime_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _operation=operation;
        if in_use(Path::new(&record.root))? {return Err("Runtime этой установки уже работает. Закройте игровое окно перед повторным запуском.".into());}
        let mut current = child.lock().map_err(err)?;
        if let Some(process) = current.as_mut() {
            if process.try_wait().map_err(err)?.is_none() { return Err("Окно runtime уже открыто".into()); }
        }
        verify(&record, false, &Arc::default())?;
        if record.collection_id == "skate3" {
            // Prevent upstream's optional icon self-patch from changing the pinned image.
            let pinned = open_read(&Path::new(&record.runtime_path).join("skate3.exe"))?;
            let mut process = skate3::command(&record)?.spawn().map_err(err)?;
            std::thread::sleep(std::time::Duration::from_millis(1200));
            if let Some(code) = process.try_wait().map_err(err)? { return Err(format!("Skate 3 завершилась после старта: {code}")); }
            let pid = process.id(); *current = Some(process);
            *runtime_lock.lock().map_err(err)? = Some(pinned);
            return Ok(format!("Создан процесс Skate 3, PID {pid}. Меню и gameplay ещё не подтверждены."));
        }
        inspect(Path::new(&record.data_path), &Arc::default(), true)?;
        let state = Path::new(&record.root).join("user-data");
        safe(&state)?; fs::create_dir_all(state.join("roaming")).map_err(err)?;
        let config_dir=state.join("roaming/bbport-launcher");
        safe(&config_dir)?;fs::create_dir_all(&config_dir).map_err(err)?;
        let config=config_dir.join("settings.json");
        let mut settings=if config.exists() {
            serde_json::from_slice::<serde_json::Map<String,serde_json::Value>>(&read_small(&config,1024*1024)?).map_err(err)?
        } else {serde_json::Map::new()};
        settings.insert("game_dir".into(),serde_json::Value::String(record.data_path.clone()));
        let temporary=config_dir.join(format!(".port-settings-{}.tmp",SystemTime::now().duration_since(UNIX_EPOCH).map_err(err)?.as_nanos()));
        write_new(&temporary,&serde_json::to_vec(&settings).map_err(err)?)?;
        fs::rename(&temporary,&config).map_err(err)?;
        let mut cmd = Command::new(Path::new(&record.runtime_path).join("Bloodborne.exe"));
        if setup!=Some(true) {cmd.arg("--play");}
        cmd.current_dir(&record.runtime_path).env("BB_DATA_DIR", &state).env("APPDATA", state.join("roaming")).env("PYTHONDONTWRITEBYTECODE","1")
            .env_remove("PYTHONPATH").env_remove("PYTHONHOME").env_remove("BB_CONFIG")
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        let mut process = cmd.spawn().map_err(|e| format!("Windows не смог запустить проверенный Bloodborne.exe: {e}"))?;
        std::thread::sleep(std::time::Duration::from_millis(1200));
        if let Some(code) = process.try_wait().map_err(err)? { return Err(format!("Runtime завершился сразу после старта ({code}). Проверьте зависимости и журнал в user-data/user.")); }
        let pid = process.id(); *current = Some(process);
        Ok(format!("Создан процесс runtime, PID {pid}. {} Папка: {}. Загрузка игры пока не подтверждена.",if setup==Some(true){"Открыт мастер SuperMedo."}else{"Использован документированный --play с собственными настройками установки."},record.data_path))
    }).await.map_err(err)?
}
#[tauri::command]
pub fn launch_status(state: tauri::State<Installer>) -> Result<String> {
    let mut c = state.child.lock().map_err(err)?;
    match c.as_mut() {
        Some(c) => match c.try_wait().map_err(err)? { Some(code) => Ok(format!("Runtime завершился: {code}. Это не подтверждает загрузку игры. Журнал: user-data/user/last_run.log.")), None => Ok(format!("Процесс runtime {} работает; загрузка игры не подтверждена.", c.id())) },
        None => Ok(String::new()),
    }
}
#[cfg(test)]
fn remove_payload(r: &Installation) -> Result<()> {
    let manifest = load_manifest(r)?;
    let root = Path::new(&r.root);
    let data = crate::adapters::get(&r.collection_id)?.data;
    if root.join(data).exists() {
        scan(&root.join(data), &Arc::default())?;
    }
    for e in manifest
        .files
        .iter()
        .filter(|e| e.path.starts_with(&format!("{data}/")))
    {
        let path = root.join(&e.path);
        safe(&path)?;
        if path.exists() {
            fs::remove_file(path).map_err(err)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn remove_installation(
    app: tauri::AppHandle,
    state: tauri::State<'_, Installer>,
    id: String,
    confirmed: bool,
) -> Result<String> {
    if !confirmed {
        return Err("Нужно подтверждение удаления".into());
    }
    let operation = operation(&state, "removing")?;
    let r = get(&app, &id)?;
    if in_use(Path::new(&r.root))? {
        return Err("Сначала закройте runtime и игру этой установки".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let manifest = load_manifest(&r)?;
        with_db(&app, |db| {
            db.execute("INSERT OR IGNORE INTO removal_jobs(id) VALUES(?1)", [&id])
                .map_err(err)?;
            Ok(())
        })?;
        let root = Path::new(&r.root);
        if read_small(&root.join("port-owner"), 256)? != r.id.as_bytes() {
            return Err("Владение папкой не подтверждено; файлы сохранены".into());
        }
        management::remove_owned_files(&r, &manifest)?;
        crate::shortcuts::remove(&app, &id)?;
        management::prune_owned(root, &manifest)?;
        with_db(&app, |db| {
            let tx = db.unchecked_transaction().map_err(err)?;
            tx.execute("DELETE FROM installations WHERE id=?1", [&id])
                .map_err(err)?;
            tx.execute("DELETE FROM removal_jobs WHERE id=?1", [&id])
                .map_err(err)?;
            tx.commit().map_err(err)
        })?;
        // Metadata cleanup after commit is best effort; report leftovers explicitly.
        let cleanup = (|| -> Result<()> {
            fs::remove_file(root.join("port-manifest.json")).map_err(err)?;
            fs::remove_file(root.join("port-owner")).map_err(err)?;
            management::prune_owned(root, &manifest)
        })();
        let warning = cleanup
            .err()
            .map(|e| format!(" Метаданные требуют очистки: {e}"))
            .unwrap_or_default();
        Ok(format!(
            "Установка удалена. Сохранения, изменённые и посторонние файлы сохранены: {}.{warning}",
            r.root
        ))
    })
    .await
    .map_err(err)?
}
