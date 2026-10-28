//! Original bounded XDVDFS reader. No decryption, mounted image, external extractor or GUI automation.
use super::*;

const ZIP_SIZE: u64 = 30_292_532;
const ZIP_HASH: &str = "b9785b9f3ba6f8180268dc5ea26ed2ec7b64af46a4c04219a33236c64bc65a17";
const ZIP_URL: &str =
    "https://github.com/mchughalex/skate3recomp/releases/download/v2.0.2/Skate3Recomp-Windows.zip";
const TITLE_UPDATE: [(&str, u64, &str); 2] = [
    (
        "default.xexp",
        1_701_888,
        "eb9ef9109dfa6d940df2e156e7eaeda4603d2b2319ca6451f324b1c27f2b1f4c",
    ),
    (
        "data/webkit/EAWebkit.xexp",
        4096,
        "5d4a308d2a6c768fc27c8b62ccb6661171dc504f8c0011a3e116cf0074e09438",
    ),
];
#[derive(Debug)]
struct IsoEntry {
    path: String,
    offset: u64,
    size: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsoInfo {
    bytes: u64,
    files: usize,
    title_id: String,
    version: String,
    warning: String,
}

fn at(file: &mut File, offset: u64, size: usize) -> Result<Vec<u8>> {
    let length = file.metadata().map_err(err)?.len();
    if offset
        .checked_add(size as u64)
        .is_none_or(|end| end > length)
    {
        return Err("ISO обрезан: диапазон за концом файла".into());
    }
    file.seek(SeekFrom::Start(offset)).map_err(err)?;
    let mut bytes = vec![0; size];
    file.read_exact(&mut bytes).map_err(err)?;
    Ok(bytes)
}
fn le32(b: &[u8]) -> u32 {
    u32::from_le_bytes(b[..4].try_into().unwrap())
}
fn be32(b: &[u8]) -> u32 {
    u32::from_be_bytes(b[..4].try_into().unwrap())
}
fn inventory(file: &mut File, s: &Arc<Mutex<Status>>) -> Result<Vec<IsoEntry>> {
    let size = file.metadata().map_err(err)?.len();
    if !(65536..=16 * 1024 * 1024 * 1024).contains(&size) {
        return Err("Неподдерживаемый размер Xbox 360 ISO".into());
    }
    let mut base = None;
    for candidate in [0, 0xfb20, 0x20600, 0x2080000, 0xfd90000] {
        if candidate + 67584 <= size && at(file, candidate + 65536, 20)? == b"MICROSOFT*XBOX*MEDIA"
        {
            base = Some(candidate);
            break;
        }
    }
    let base = base.ok_or("Нет поддерживаемого XDVDFS-раздела Xbox 360")?;
    let header = at(file, base + 65536, 2048)?;
    if &header[2028..] != b"MICROSOFT*XBOX*MEDIA" {
        return Err("Повреждён дескриптор XDVDFS".into());
    }
    let mut pending = vec![(
        base + le32(&header[20..]) as u64 * 2048,
        le32(&header[24..]) as u64,
        0u64,
        String::new(),
    )];
    let mut visited = HashSet::new();
    let mut names = HashSet::new();
    let mut entries = Vec::new();
    let mut total = 0u64;
    let mut ranges = Vec::new();
    while let Some((dir, len, node, prefix)) = pending.pop() {
        checkpoint(s)?;
        if visited.len() >= MAX_FILES
            || !visited.insert((dir, node))
            || !(14..=32 * 1024 * 1024).contains(&len)
            || node + 14 > len
            || dir.checked_add(len).is_none_or(|end| end > size)
        {
            return Err("Цикл или недопустимые границы дерева XDVDFS".into());
        }
        let h = at(file, dir + node, 14)?;
        let n = h[13] as usize;
        if n == 0 || n > 240 || node + 14 + n as u64 > len {
            return Err("Недопустимое имя XDVDFS".into());
        }
        let name = String::from_utf8(at(file, dir + node + 14, n)?).map_err(err)?;
        if name.contains(['/', '\\']) {
            return Err("Разделитель в имени ISO".into());
        }
        let path = format!("{prefix}{name}");
        relative(&path)?;
        if !names.insert(path.to_lowercase()) {
            return Err("Конфликт имён ISO".into());
        }
        for edge in [
            u16::from_le_bytes(h[0..2].try_into().unwrap()),
            u16::from_le_bytes(h[2..4].try_into().unwrap()),
        ] {
            if edge != 0 {
                pending.push((dir, len, edge as u64 * 4, prefix.clone()));
            }
        }
        let offset = base + le32(&h[4..]) as u64 * 2048;
        let length = le32(&h[8..]) as u64;
        if offset.checked_add(length).is_none_or(|end| end > size) {
            return Err("Файл ISO выходит за границы образа".into());
        }
        if h[12] & 0x10 != 0 {
            if length > 0 {
                pending.push((offset, length, 0, format!("{path}/")));
            }
        } else {
            total = total
                .checked_add(length)
                .ok_or("Переполнение размера ISO")?;
            if total > 16 * 1024 * 1024 * 1024 {
                return Err("Превышен лимит распаковки ISO".into());
            }
            if length > 0 {
                ranges.push((offset, offset + length));
            }
            entries.push(IsoEntry {
                path,
                offset,
                size: length,
            });
        }
    }
    ranges.sort_unstable();
    if ranges.windows(2).any(|r| r[0].1 > r[1].0) {
        return Err("Пересекающиеся файлы ISO".into());
    }
    let xex = entries
        .iter()
        .find(|e| e.path == "default.xex")
        .ok_or("Нет default.xex")?;
    let h = at(file, xex.offset, 24)?;
    let count = be32(&h[20..]) as usize;
    if &h[..4] != b"XEX2" || count > 256 || 24 + count as u64 * 8 > xex.size {
        return Err("Неподдерживаемый XEX2".into());
    }
    let opts = at(file, xex.offset + 24, count * 8)?;
    let execution = opts
        .as_chunks::<8>()
        .0
        .iter()
        .find(|o| be32(*o) == 0x40006)
        .ok_or("Нет Xbox execution identity")?;
    let offset = be32(&execution[4..]) as u64;
    if offset + 24 > xex.size {
        return Err("Некорректный execution identity".into());
    }
    let id = at(file, xex.offset + offset, 24)?;
    if be32(&id[12..]) != 0x454108e6
        || be32(&id[..4]) != 0x5c087c2c
        || be32(&id[4..]) != 3
        || id[17] != 0
        || id[18] != 1
        || id[19] != 1
    {
        return Err("Нужен Skate 3 454108E6, Media ID 5C087C2C, retail 3.0.0.0".into());
    }
    for required in [
        "data/webkit/EAWebkit.xex",
        "data/big/miscboot.big",
        "data/big/shaders_final.big",
        "data/content/worldmisc.big",
    ] {
        if !entries.iter().any(|e| e.path == required && e.size > 0) {
            return Err(format!("Неполный ISO: нет {required}"));
        }
    }
    if entries.iter().any(|e| {
        TITLE_UPDATE
            .iter()
            .any(|(p, _, _)| e.path.eq_ignore_ascii_case(p))
    }) {
        return Err("Нужен исходный base ISO без встроенных TU payloads".into());
    }
    Ok(entries)
}
#[tauri::command]
pub async fn inspect_skate3_iso(path: String) -> Result<IsoInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        safe(Path::new(&path))?; let mut file = open_read(Path::new(&path))?;
        let entries = inventory(&mut file,&Arc::default())?;
        Ok(IsoInfo { bytes: entries.iter().map(|e| e.size).sum(), files: entries.len(), title_id: "454108E6".into(), version: "retail".into(), warning: "Title ID/Media ID/base version проверены. Официальный мастер запросит Title Update 3. Затем закройте игру для финальной проверки PORT. Регион/gameplay не подтверждены.".into() })
    }).await.map_err(err)?
}
fn download_event(log: &mut dyn Write, event: &str) {
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Only fixed stage names are logged: no paths, URLs, headers or error payloads.
    let _ = writeln!(log, "{time} skate3-v2.0.2 {event}");
    let _ = log.flush();
}
fn runtime(stage: &Path, s: &Arc<Mutex<Status>>, log: &mut dyn Write) -> Result<Vec<Entry>> {
    download_event(log, "start");
    let result = runtime_inner(stage, s, log);
    download_event(
        log,
        if result.is_ok() {
            "complete"
        } else if s.lock().is_ok_and(|s| s.cancel) {
            "cancelled"
        } else {
            "failed"
        },
    );
    result
}
fn receive_runtime(
    mut response: reqwest::blocking::Response,
    path: &Path,
    s: &Arc<Mutex<Status>>,
) -> Result<()> {
    checkpoint(s)?;
    if response.status() != reqwest::StatusCode::OK || response.content_length() != Some(ZIP_SIZE) {
        return Err("Размер или статус HTTP Windows-релиза не совпал. Повторите установку.".into());
    }
    let hash = stream((&mut response).take(ZIP_SIZE + 1), Some(path), ZIP_SIZE, s)
        .map_err(|_| if s.lock().is_ok_and(|s| s.cancel) {
            "Отменено пользователем".to_string()
        } else {
            "Не удалось прочитать или записать Windows-релиз. Проверьте сеть и доступ к диску; повторите установку.".to_string()
        })?;
    if hash != ZIP_HASH {
        return Err("SHA-256 Windows-релиза не совпал. Повторите установку.".into());
    }
    Ok(())
}
fn runtime_inner(stage: &Path, s: &Arc<Mutex<Status>>, log: &mut dyn Write) -> Result<Vec<Entry>> {
    phase(
        s,
        "downloading",
        "Skate 3 Recomp v2.0.2: загрузка и SHA-256",
    );
    {
        let mut status = s.lock().map_err(err)?;
        status.completed = 0;
        status.total = ZIP_SIZE;
    }
    let zip_path = stage.join("runtime.zip");
    checkpoint(s)?;
    download_event(log, "client");
    let client = download::client()?;
    download_event(log, "release-request");
    let response = client.get(ZIP_URL).header("Accept-Encoding", "identity").send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .or_else(|e| {
            if s.lock().is_ok_and(|s| s.cancel) { return Err(e); }
            download_event(log, "api-fallback");
            client.get("https://api.github.com/repos/mchughalex/skate3recomp/releases/assets/488835902")
                .header("Accept", "application/octet-stream").header("Accept-Encoding", "identity").send()
                .and_then(reqwest::blocking::Response::error_for_status)
        });
    checkpoint(s)?;
    let response = response.map_err(|e| {
        if e.is_timeout() {
            "Истекло время ожидания Windows-релиза. Повторите установку.".to_string()
        } else {
            "Не удалось загрузить Windows-релиз. Проверьте подключение и повторите установку."
                .to_string()
        }
    })?;
    download_event(log, "headers-received");
    receive_runtime(response, &zip_path, s)?;
    download_event(log, "size-sha256-verified");
    phase(s, "extracting", "Подготовка проверенной Windows-сборки");
    let mut archive = zip::ZipArchive::new(open_read(&zip_path)?).map_err(err)?;
    if archive.len() != 3 {
        return Err("Неожиданный состав Windows-релиза".into());
    }
    let mut out = Vec::new();
    for (name, size) in [("skate3.exe", 101_586_944), ("rexruntime.dll", 18_671_616)] {
        let mut file = archive
            .by_name(&format!("Skate3Recomp-Windows/{name}"))
            .map_err(err)?;
        if file.size() != size || file.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
            return Err("Некорректный Windows ZIP".into());
        }
        let path = format!("skate3-runtime/{name}");
        let sha256 = stream(&mut file, Some(&stage.join(&path)), size, s)?;
        if at(&mut open_read(&stage.join(&path))?, 0, 2)? != b"MZ" {
            return Err("Нет PE-заголовка".into());
        }
        out.push(Entry { path, size, sha256 });
    }
    drop(archive);
    fs::remove_file(zip_path).map_err(err)?;
    Ok(out)
}
pub(super) fn verify(r: &Installation, all: bool, s: &Arc<Mutex<Status>>) -> Result<()> {
    let m = load_manifest(r)?;
    for (path, size, hash) in TITLE_UPDATE {
        if !m
            .files
            .iter()
            .any(|e| e.path == format!("game/{path}") && e.size == size && e.sha256 == hash)
        {
            return Err(
                "Title Update 3 не закреплён в установке; завершите проверку установки".into(),
            );
        }
        if stream(
            open_read(&Path::new(&r.data_path).join(path))?,
            None,
            size,
            s,
        )? != hash
        {
            return Err("Title Update 3 повреждён".into());
        }
    }
    for name in [
        "skate3-runtime/skate3.exe",
        "skate3-runtime/rexruntime.dll",
        "game/default.xex",
        "game/data/big/miscboot.big",
        "game/data/big/shaders_final.big",
        "game/data/content/worldmisc.big",
        "game/data/webkit/EAWebkit.xex",
    ] {
        if !m.files.iter().any(|e| e.path == name && e.size > 0) {
            return Err(format!("Неполная установка: {name}"));
        }
    }
    let actual = scan(Path::new(&r.runtime_path), s)?;
    if actual
        .iter()
        .any(|e| !["skate3.exe", "rexruntime.dll"].contains(&e.path.as_str()))
    {
        return Err("Посторонние файлы в Windows runtime".into());
    }
    for e in m.files {
        let path = Path::new(&r.root).join(&e.path);
        safe(&path)?;
        package::regular_file(&path)?;
        if fs::metadata(&path).map_err(err)?.len() != e.size {
            return Err(format!("Изменён размер: {}", e.path));
        }
        if (all || e.path.starts_with("skate3-runtime/") || e.path == "game/default.xex")
            && stream(open_read(&path)?, None, e.size, s)? != e.sha256
        {
            return Err(format!("SHA-256 не совпал: {}", e.path));
        }
    }
    Ok(())
}
pub(super) fn command(r: &Installation) -> Result<Command> {
    record_paths(r)?;
    command_at(
        Path::new(&r.runtime_path),
        Path::new(&r.data_path),
        &Path::new(&r.root).join("user-data"),
    )
}
fn command_at(runtime: &Path, data: &Path, user: &Path) -> Result<Command> {
    safe(user)?;
    fs::create_dir_all(user).map_err(err)?;
    let mut cmd = Command::new(runtime.join(crate::adapters::SKATE3.executable));
    cmd.arg(format!("--game_data_root={}", data.display()))
        .arg(format!("--user_data_root={}", user.display()))
        .arg(format!("--log_file={}", user.join("skate3.log").display()))
        .current_dir(user)
        .env_remove("SKATE3_INSTALL_ISO")
        .env_remove("SKATE3_INSTALL_TU")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    Ok(cmd)
}
pub(super) fn preserve_profile(stage: &Path, id: &str) -> Result<()> {
    let user = stage.join("user-data");
    if user.exists() {
        scan(&user, &Arc::default())?;
        let backup = stage
            .parent()
            .ok_or("Нет родителя")?
            .join(format!(".port-profile-{id}"));
        safe(&backup)?;
        if backup.exists() {
            return Err("Резерв профиля уже существует; временные файлы сохранены".into());
        }
        fs::rename(user, backup).map_err(err)?;
    }
    Ok(())
}
// The official wizard obtains TU3 only after the user's own choice. PORT never
// submits a download/consent click or fetches a commercial update package itself.
fn official_setup(stage: &Path, s: &Arc<Mutex<Status>>) -> Result<Vec<Entry>> {
    phase(s,"setup","Завершите официальный мастер Title Update 3, затем закройте игру. PORT проверит файлы и завершит установку.");
    let _pinned = open_read(&stage.join("skate3-runtime/skate3.exe"))?;
    let mut child = command_at(
        &stage.join("skate3-runtime"),
        &stage.join("game"),
        &stage.join("user-data"),
    )?
    .spawn()
    .map_err(err)?;
    let result = (|| {
        let _job = SetupJob::attach(&child)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1800);
        loop {
            checkpoint(s)?;
            if let Some(exit) = child.try_wait().map_err(err)? {
                if !exit.success() {
                    return Err(format!("Мастер завершился с ошибкой: {exit}"));
                }
                break;
            }
            if std::time::Instant::now() > deadline {
                return Err("Истекло время мастера; профиль сохранён отдельно".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
        update_entries(stage, s)
    })();
    if result.is_err() {
        let _ = child.kill();
        let _ = child.wait();
    }
    result
}
fn update_entries(root: &Path, s: &Arc<Mutex<Status>>) -> Result<Vec<Entry>> {
    let mut out = Vec::new();
    for (path, size, hash) in TITLE_UPDATE {
        let relative = format!("game/{path}");
        let file = root.join(&relative);
        safe(&file)?;
        if stream(open_read(&file)?, None, size, s)? != hash {
            return Err("Официальный мастер не подготовил ожидаемый Title Update 3".into());
        }
        out.push(Entry {
            path: relative,
            size,
            sha256: hash.into(),
        });
    }
    Ok(out)
}
#[cfg(windows)]
struct SetupJob(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl SetupJob {
    fn attach(child: &Child) -> Result<Self> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(err(std::io::Error::last_os_error()));
            }
            let job = Self(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle()) == 0
            {
                return Err(err(std::io::Error::last_os_error()));
            }
            Ok(job)
        }
    }
}
#[cfg(windows)]
impl Drop for SetupJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(not(windows))]
struct SetupJob;
#[cfg(not(windows))]
impl SetupJob {
    fn attach(_: &Child) -> Result<Self> {
        Err("Официальный мастер поддерживается только в Windows".into())
    }
}
fn job(
    app: &tauri::AppHandle,
    source: &str,
    parent: &str,
    id: &str,
    shortcut: bool,
    s: &Arc<Mutex<Status>>,
) -> Result<()> {
    let source = Path::new(source);
    safe(source)?;
    let mut iso = open_read(source)?;
    let entries = inventory(&mut iso, s)?;
    let bytes = entries.iter().map(|e| e.size).sum::<u64>();
    let parent = Path::new(parent);
    let root = with_db(app, |db| {
        let installed = records(db)?;
        if installed.iter().any(|r| r.collection_id == "skate3") {
            return Err("Skate 3 уже установлена".into());
        }
        experience::destination_for(parent, id, &installed, "skate3")
    })?;
    space(parent, bytes + 512 * 1024 * 1024)?;
    let stage = parent.join(format!(".port-stage-{id}"));
    with_db(app, |db| {
        db.execute(
            "INSERT INTO installation_jobs(id,staging,root) VALUES(?1,?2,?3)",
            params![id, stage.display().to_string(), root.display().to_string()],
        )
        .map_err(err)?;
        Ok(())
    })?;
    // Recovery owns this intent before the first write; incomplete outputs are never registrations.
    let mut stage_created = false;
    let result = (|| {
        fs::create_dir(&stage).map_err(err)?;
        stage_created = true;
        write_new(&stage.join("port-owner"), id.as_bytes())?;
        let logs = app.path().app_log_dir().map_err(err)?;
        safe(&logs)?;
        fs::create_dir_all(&logs).map_err(err)?;
        let log_path = logs.join("skate3-download.log");
        safe(&log_path)?;
        let truncate = log_path.metadata().is_ok_and(|m| m.len() > 64 * 1024);
        let mut log = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(truncate)
            .append(!truncate)
            .open(log_path)
            .map_err(err)?;
        let mut files = runtime(&stage, s, &mut log)?;
        phase(s, "extracting", "Копирование данных из Xbox 360 ISO");
        {
            let mut status = s.lock().map_err(err)?;
            status.completed = 0;
            status.total = bytes;
        }
        for e in entries {
            iso.seek(SeekFrom::Start(e.offset)).map_err(err)?;
            let path = format!("game/{}", e.path);
            let sha256 = stream((&mut iso).take(e.size), Some(&stage.join(&path)), e.size, s)?;
            files.push(Entry {
                path,
                size: e.size,
                sha256,
            });
        }
        files.extend(official_setup(&stage, s)?);
        let m = Manifest {
            schema: 1,
            id: id.into(),
            version: Some("retail / recomp v2.0.2".into()),
            files,
        };
        let bytes = serde_json::to_vec(&m).map_err(err)?;
        write_new(&stage.join("port-manifest.json"), &bytes)?;
        let record = Installation {
            id: id.into(),
            collection_id: "skate3".into(),
            root: root.display().to_string(),
            data_path: root.join("game").display().to_string(),
            runtime_path: root.join("skate3-runtime").display().to_string(),
            version: m.version,
            manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        manifest_bytes(&record, &bytes)?;
        if scan(&stage.join("skate3-runtime"), s)?
            .iter()
            .any(|e| !["skate3.exe", "rexruntime.dll"].contains(&e.path.as_str()))
        {
            return Err(
                "Мастер оставил неизвестные файлы в runtime; установка не зарегистрирована".into(),
            );
        }
        // Re-read every staged byte before commit, using the exact same manifest checks.
        phase(s, "verifying", "Проверка установленных данных SHA-256");
        {
            let mut status = s.lock().map_err(err)?;
            status.completed = 0;
            status.total = m.files.iter().map(|e| e.size).sum();
        }
        for e in &m.files {
            if stream(open_read(&stage.join(&e.path))?, None, e.size, s)? != e.sha256 {
                return Err("Ошибка проверки записи".into());
            }
        }
        let mut status = s.lock().map_err(err)?;
        if status.cancel {
            return Err("Отменено пользователем".into());
        }
        safe(&root)?;
        if root.exists() {
            return Err("Назначение уже существует".into());
        }
        fs::rename(&stage, &root).map_err(err)?;
        with_db(app, |db| {
            db.execute_batch("BEGIN IMMEDIATE").map_err(err)?;
            let result = (|| {
                register(db, &record)?;
                db.execute("DELETE FROM installation_jobs WHERE id=?1", [id])
                    .map_err(err)?;
                Ok(())
            })();
            match result {
                Ok(()) => db.execute_batch("COMMIT").map_err(err),
                Err(e) => {
                    let _ = db.execute_batch("ROLLBACK");
                    Err(e)
                }
            }
        })?;
        status.phase = "finishing".into();
        drop(status);
        let warning = if shortcut && crate::shortcuts::create_named(app, id, "Skate 3").is_err() {
            " Ярлык создать не удалось; запуск доступен из библиотеки."
        } else {
            ""
        };
        let mut status = s.lock().map_err(err)?;
        status.phase = "ready".into();
        status.active = false;
        status.message =
            format!("Skate 3 установлена и проверена. Загрузка игры ещё не подтверждена.{warning}");
        Ok(())
    })();
    if result.is_err() && !root.exists() {
        if stage_created && stage.exists() {
            preserve_profile(&stage, id)?;
            cleanup(&stage)?;
        }
        with_db(app, |db| {
            db.execute("DELETE FROM installation_jobs WHERE id=?1", [id])
                .map_err(err)?;
            Ok(())
        })?;
    }
    result
}
#[tauri::command]
pub fn install_skate3(
    app: tauri::AppHandle,
    state: tauri::State<Installer>,
    source: String,
    parent: String,
    destination_id: String,
    desktop_shortcut: Option<bool>,
) -> Result<()> {
    let guard = operation(&state, "validating")?;
    state.status.lock().map_err(err)?.collection_id = Some("skate3".into());
    let status = state.status.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| job(
            &app,
            &source,
            &parent,
            &destination_id,
            desktop_shortcut.unwrap_or(false),
            &status,
        ))).unwrap_or_else(|_| Err("Внутренняя ошибка установки. Перезапустите PORT для восстановления временных данных.".into()));
        if let Err(e) = result {
            if let Ok(mut s) = status.lock() {
                s.phase = if s.cancel { "cancelled" } else { "error" }.into();
                s.message = e;
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(headers: &str, body: Vec<u8>) -> reqwest::blocking::Response {
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let headers = headers.to_string();
        std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 4096];
            let _ = socket.read(&mut request);
            let _ = write!(socket, "HTTP/1.1 {headers}\r\nConnection: close\r\n\r\n");
            let _ = socket.write_all(&body);
        });
        reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap()
            .get(format!("http://{address}"))
            .send()
            .unwrap()
    }
    #[test]
    fn runtime_http_rejects_status_length_truncation_hash_and_cancel() {
        let stage = tempfile::tempdir().unwrap();
        let path = stage.path().join("runtime.zip");
        let s = Arc::default();
        for headers in [
            "503 Unavailable\r\nContent-Length: 0",
            "200 OK\r\nContent-Length: 3",
            "200 OK",
        ] {
            assert!(receive_runtime(response(headers, vec![]), &path, &s).is_err());
            assert!(!path.exists());
        }
        let headers = format!("200 OK\r\nContent-Length: {ZIP_SIZE}");
        assert!(receive_runtime(response(&headers, b"abc".to_vec()), &path, &s).is_err());
        fs::remove_file(&path).unwrap();
        assert!(
            receive_runtime(response(&headers, vec![0; ZIP_SIZE as usize]), &path, &s)
                .unwrap_err()
                .contains("SHA-256")
        );
        // A retry never overwrites an existing output, even after a failed attempt.
        assert!(receive_runtime(response(&headers, vec![]), &path, &s).is_err());
        fs::remove_file(&path).unwrap();
        s.lock().unwrap().cancel = true;
        assert!(receive_runtime(response(&headers, vec![]), &path, &s)
            .unwrap_err()
            .contains("Отменено"));
        assert!(!path.exists());
        let mut log = Vec::new();
        assert!(runtime(stage.path(), &s, &mut log).is_err());
        let log = String::from_utf8(log).unwrap();
        assert!(log.contains("start") && log.contains("cancelled"));
        assert!(!log.contains("http") && !log.contains(stage.path().to_str().unwrap()));
        // Cancellation before the request can be retried with a fresh status.
        s.lock().unwrap().cancel = false;
        assert!(
            receive_runtime(response("200 OK\r\nContent-Length: 0", vec![]), &path, &s)
                .unwrap_err()
                .contains("HTTP")
        );
    }
    #[test]
    #[ignore = "official 30 MB runtime only, temporary directory; no ISO/setup/registration"]
    fn runtime_download_on_native_worker() {
        tauri::async_runtime::block_on(async {
            tauri::async_runtime::spawn_blocking(|| {
                let stage = tempfile::tempdir().unwrap();
                let entries = runtime(stage.path(), &Arc::default(), &mut std::io::sink()).unwrap();
                assert_eq!(entries.len(), 2);
            })
            .await
            .unwrap();
        });
    }
    fn fixture() -> Vec<u8> {
        use std::collections::BTreeMap;
        fn directory(
            prefix: &str,
            paths: &BTreeMap<String, Vec<u8>>,
            image: &mut Vec<u8>,
            next: &mut u32,
        ) -> (u32, u32) {
            let mut children = BTreeMap::<String, bool>::new();
            for p in paths.keys().filter_map(|p| p.strip_prefix(prefix)) {
                let name = p.split('/').next().unwrap();
                children.insert(name.into(), p.contains('/'));
            }
            let sector = *next;
            *next += 2;
            let mut cursor = 0usize;
            let count = children.len();
            for (i, (name, dir)) in children.into_iter().enumerate() {
                let full = format!("{prefix}{name}");
                let (start, size) = if dir {
                    directory(&format!("{full}/"), paths, image, next)
                } else {
                    let start = *next;
                    *next += 2;
                    let b = &paths[&full];
                    image[start as usize * 2048..start as usize * 2048 + b.len()]
                        .copy_from_slice(b);
                    (start, b.len() as u32)
                };
                let at = sector as usize * 2048 + cursor;
                let length = (14 + name.len() + 3) & !3;
                if i + 1 < count {
                    image[at + 2..at + 4]
                        .copy_from_slice(&(((cursor + length) / 4) as u16).to_le_bytes());
                }
                image[at + 4..at + 8].copy_from_slice(&start.to_le_bytes());
                image[at + 8..at + 12].copy_from_slice(&size.to_le_bytes());
                image[at + 12] = if dir { 0x10 } else { 0 };
                image[at + 13] = name.len() as u8;
                image[at + 14..at + 14 + name.len()].copy_from_slice(name.as_bytes());
                cursor += length;
            }
            (sector, cursor as u32)
        }
        let mut image = vec![0u8; 512 * 2048];
        let mut xex = vec![0u8; 256];
        xex[..4].copy_from_slice(b"XEX2");
        xex[20..24].copy_from_slice(&1u32.to_be_bytes());
        xex[24..28].copy_from_slice(&0x40006u32.to_be_bytes());
        xex[28..32].copy_from_slice(&64u32.to_be_bytes());
        xex[64..68].copy_from_slice(&0x5c087c2cu32.to_be_bytes());
        xex[68..72].copy_from_slice(&3u32.to_be_bytes());
        xex[76..80].copy_from_slice(&0x454108e6u32.to_be_bytes());
        xex[82] = 1;
        xex[83] = 1;
        let paths = BTreeMap::from([
            ("default.xex".into(), xex),
            ("data/webkit/EAWebkit.xex".into(), vec![1]),
            ("data/big/miscboot.big".into(), vec![2]),
            ("data/big/shaders_final.big".into(), vec![3]),
            ("data/content/worldmisc.big".into(), vec![4]),
        ]);
        let (root, size) = directory("", &paths, &mut image, &mut 40);
        image[65536..65556].copy_from_slice(b"MICROSOFT*XBOX*MEDIA");
        image[65556..65560].copy_from_slice(&root.to_le_bytes());
        image[65560..65564].copy_from_slice(&size.to_le_bytes());
        image[67564..67584].copy_from_slice(b"MICROSOFT*XBOX*MEDIA");
        image
    }
    fn parse(bytes: &[u8]) -> Result<Vec<IsoEntry>> {
        let mut file = tempfile::tempfile().unwrap();
        file.write_all(bytes).unwrap();
        inventory(&mut file, &Arc::default())
    }
    #[test]
    fn xdvdfs_bounds_cycles_paths_identity_and_cancellation() {
        let original = fixture();
        let entries = parse(&original).unwrap();
        assert_eq!(entries.len(), 5);
        for length in [0, 24, 65540, 67583] {
            assert!(parse(&original[..length]).is_err());
        }
        let mut cycle = original.clone();
        cycle[40 * 2048..40 * 2048 + 2].copy_from_slice(&1u16.to_le_bytes());
        assert!(parse(&cycle).is_err());
        let mut path = original.clone();
        path[40 * 2048 + 14] = b'/';
        assert!(parse(&path).is_err());
        let mut bound = original.clone();
        bound[40 * 2048 + 4..40 * 2048 + 8].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(parse(&bound).is_err());
        let xex = entries
            .iter()
            .find(|e| e.path == "default.xex")
            .unwrap()
            .offset as usize;
        let mut foreign = original.clone();
        foreign[xex + 76] = 0;
        assert!(parse(&foreign).is_err());
        let mut invalid = original.clone();
        invalid[xex + 28..xex + 32].copy_from_slice(&u32::MAX.to_be_bytes());
        assert!(parse(&invalid).is_err());
        let mut file = tempfile::tempfile().unwrap();
        file.write_all(&original).unwrap();
        let state = Arc::new(Mutex::new(Status {
            cancel: true,
            ..Status::default()
        }));
        assert!(inventory(&mut file, &state).is_err());
    }
    #[test]
    fn skate_journal_recovers_only_complete_manifest_and_preserves_other_rows() {
        let temp = tempfile::tempdir().unwrap();
        let db = Connection::open_in_memory().unwrap();
        crate::init(&db).unwrap();
        db.execute("INSERT INTO installations VALUES('owner','{}')", [])
            .unwrap();
        let root = temp.path().join("PORT-Skate3-1-2");
        let stage = temp.path().join(".port-stage-1-2");
        fs::create_dir(&stage).unwrap();
        write_new(&stage.join("port-owner"), b"1-2").unwrap();
        write_new(&stage.join("partial"), b"partial").unwrap();
        fs::create_dir(stage.join("user-data")).unwrap();
        write_new(&stage.join("user-data/save"), b"setup progress").unwrap();
        db.execute(
            "INSERT INTO installation_jobs VALUES('1-2',?1,?2)",
            params![stage.display().to_string(), root.display().to_string()],
        )
        .unwrap();
        recover(&db).unwrap();
        assert!(!stage.exists());
        assert_eq!(
            fs::read(temp.path().join(".port-profile-1-2/save")).unwrap(),
            b"setup progress"
        );
        assert_eq!(
            db.query_row(
                "SELECT value FROM installations WHERE id='owner'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "{}"
        );
    }
    #[test]
    fn incomplete_tu_recovery_is_blocked_and_removal_preserves_saves() {
        let temp = tempfile::tempdir().unwrap();
        let db = Connection::open_in_memory().unwrap();
        crate::init(&db).unwrap();
        let id = "3-4";
        let root = temp.path().join("PORT-Skate3-3-4");
        let stage = temp.path().join(".port-stage-3-4");
        fs::create_dir(&root).unwrap();
        let mut files = Vec::new();
        for path in [
            "skate3-runtime/skate3.exe",
            "skate3-runtime/rexruntime.dll",
            "game/default.xex",
            "game/data/big/miscboot.big",
            "game/data/big/shaders_final.big",
            "game/data/content/worldmisc.big",
            "game/data/webkit/EAWebkit.xex",
        ] {
            let data = b"QA original fixture";
            let hash = stream(
                &data[..],
                Some(&root.join(path)),
                data.len() as u64,
                &Arc::default(),
            )
            .unwrap();
            files.push(Entry {
                path: path.into(),
                size: data.len() as u64,
                sha256: hash,
            });
        }
        let bytes = serde_json::to_vec(&Manifest {
            schema: 1,
            id: id.into(),
            version: Some("QA".into()),
            files,
        })
        .unwrap();
        write_new(&root.join("port-manifest.json"), &bytes).unwrap();
        write_new(&root.join("port-owner"), id.as_bytes()).unwrap();
        db.execute(
            "INSERT INTO installation_jobs VALUES(?1,?2,?3)",
            params![id, stage.display().to_string(), root.display().to_string()],
        )
        .unwrap();
        assert!(recover(&db).is_err());
        assert!(records(&db).unwrap().is_empty());
        let pending = Installation {
            id: id.into(),
            collection_id: "skate3".into(),
            root: root.display().to_string(),
            data_path: root.join("game").display().to_string(),
            runtime_path: root.join("skate3-runtime").display().to_string(),
            version: Some("QA".into()),
            manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        register(&db, &pending).unwrap();
        let items = records(&db).unwrap();
        assert_eq!(items.len(), 1);
        let record = &items[0];
        assert_eq!(record.collection_id, "skate3");
        assert!(verify(record, true, &Arc::default()).is_err());
        let cmd = command(record).unwrap();
        assert_eq!(cmd.get_program(), root.join("skate3-runtime/skate3.exe"));
        let args: Vec<_> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert!(args.contains(&format!("--game_data_root={}", record.data_path)));
        assert!(args.contains(&format!(
            "--user_data_root={}",
            root.join("user-data").display()
        )));
        write_new(&root.join("user-data/save"), b"keep progress").unwrap();
        write_new(&root.join("game/unknown-user-file"), b"keep unknown").unwrap();
        write_new(&root.join("skate3-runtime/injection.dll"), b"blocked").unwrap();
        assert!(verify(record, false, &Arc::default()).is_err());
        fs::remove_file(root.join("skate3-runtime/injection.dll")).unwrap();
        fs::write(root.join("game/default.xex"), b"modified").unwrap();
        assert!(verify(record, true, &Arc::default()).is_err());
        remove_payload(record).unwrap();
        assert_eq!(
            fs::read(root.join("user-data/save")).unwrap(),
            b"keep progress"
        );
        assert!(root.join("skate3-runtime/skate3.exe").exists());
        assert!(root.join("game/unknown-user-file").exists());
        assert!(!root.join("game/default.xex").exists());
    }
    #[test]
    #[ignore = "read-only owner ISO probe; run explicitly on owner machine"]
    fn owner_iso_structure() {
        let mut file = open_read(Path::new("C:/skate3/Skate_3.iso")).unwrap();
        let entries = inventory(&mut file, &Arc::default()).unwrap();
        assert_eq!(entries.len(), 101);
        assert_eq!(entries.iter().map(|e| e.size).sum::<u64>(), 6_396_955_444);
    }
    #[test]
    #[ignore = "owner-only native staging/setup probe; requires local ISO and owner-acquired TU files, opens game until closed"]
    fn owner_staging_setup_probe() {
        let source = std::env::var("PORT_SKATE_QA_ISO").expect("explicit owner ISO");
        let tu = PathBuf::from(
            std::env::var("PORT_SKATE_QA_TU").expect("explicit owner-acquired TU root"),
        );
        let root =
            PathBuf::from(std::env::var("PORT_SKATE_QA_ROOT").expect("new isolated QA root"));
        assert_eq!(root.file_name().unwrap(), "PORT-Skate3-9-9");
        safe(&root).unwrap();
        assert!(!root.exists());
        fs::create_dir(&root).unwrap();
        let status = Arc::default();
        let mut iso = open_read(Path::new(&source)).unwrap();
        let entries = inventory(&mut iso, &status).unwrap();
        let mut files = runtime(&root, &status, &mut std::io::sink()).unwrap();
        for e in entries {
            iso.seek(SeekFrom::Start(e.offset)).unwrap();
            let path = format!("game/{}", e.path);
            let hash = stream(
                (&mut iso).take(e.size),
                Some(&root.join(&path)),
                e.size,
                &status,
            )
            .unwrap();
            files.push(Entry {
                path,
                size: e.size,
                sha256: hash,
            });
        }
        for (path, size, hash) in TITLE_UPDATE {
            let source = tu.join(path);
            let target = root.join("game").join(path);
            assert_eq!(
                stream(open_read(&source).unwrap(), Some(&target), size, &status).unwrap(),
                hash
            );
        }
        println!("QA staged. Official setup/game will open; close its window normally to finish verification.");
        files.extend(official_setup(&root, &status).unwrap());
        let m = Manifest {
            schema: 1,
            id: "9-9".into(),
            version: Some("QA".into()),
            files,
        };
        let bytes = serde_json::to_vec(&m).unwrap();
        write_new(&root.join("port-manifest.json"), &bytes).unwrap();
        let r = Installation {
            id: "9-9".into(),
            collection_id: "skate3".into(),
            root: root.display().to_string(),
            data_path: root.join("game").display().to_string(),
            runtime_path: root.join("skate3-runtime").display().to_string(),
            version: Some("QA".into()),
            manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        verify(&r, true, &status).unwrap();
        println!("Official process exited; full ISO/runtime/TU verification passed, immutable exe survived icon patch attempt. No library registration in QA probe.");
    }
}
