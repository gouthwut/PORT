//! Confirmed cumulative update, in place, with a durable per-file undo journal.
use super::*;
use std::collections::BTreeMap;

const PACKAGE_HASH: &str = "a138cfdc6133d7718dca77a3ef05072d50020d8e987c21be8d795980f78ff818";
const PATCH_BYTES: u64 = 185_382_731;
const PROFILE_BACKUP: &str = ".port-profile-before-1.09";
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Change {
    before: Option<Entry>,
    after: Entry,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    schema: u32,
    before: Installation,
    after: Option<Installation>,
    changes: Vec<Change>,
    merge: Option<Installation>,
    had_profile: bool,
}
fn stage(j: &Journal) -> PathBuf {
    Path::new(&j.before.root).join(".port-update")
}
fn digest(path: &Path, size: u64, s: &Arc<Mutex<Status>>) -> Result<String> {
    package::regular_file(path)?;
    stream(open_read(path)?, None, size, s)
}
fn matches(path: &Path, e: &Entry) -> Result<bool> {
    if !path.exists() {
        return Ok(false);
    }
    Ok(digest(path, e.size, &Arc::default())? == e.sha256)
}
fn reset(s: &Arc<Mutex<Status>>, name: &str, message: &str, total: u64) {
    phase(s, name, message);
    if let Ok(mut s) = s.lock() {
        s.completed = 0;
        s.total = total;
    }
}
fn persist(db: &Connection, j: &Journal) -> Result<()> {
    let value = serde_json::to_string(j).map_err(err)?;
    if value.len() > 1024 * 1024 {
        return Err("Журнал обновления слишком велик".into());
    }
    db.execute("INSERT INTO update_jobs(id,value) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET value=excluded.value",params![j.before.id,value]).map_err(err)?;
    Ok(())
}
fn validate(j: &Journal) -> Result<()> {
    record_paths(&j.before)?;
    if j.schema != 1
        || j.before.collection_id != "bloodborne"
        || j.before.version.as_deref() != Some("01.00")
        || j.changes.len() > 1024
    {
        return Err("Некорректный журнал обновления".into());
    }
    if let Some(after) = &j.after {
        record_paths(after)?;
        if after.id != j.before.id
            || after.root != j.before.root
            || after.data_path != j.before.data_path
            || after.runtime_path != j.before.runtime_path
            || after.version.as_deref() != Some("01.09")
            || after.collection_id != j.before.collection_id
        {
            return Err("Обновление не может менять идентичность установки".into());
        }
    } else if !j.changes.is_empty() {
        return Err("Не завершён план обновления".into());
    }
    let mut names = HashSet::new();
    for change in &j.changes {
        relative(&change.after.path)?;
        if !change.after.path.starts_with("CUSA03173/")
            || !names.insert(change.after.path.to_lowercase())
            || change.after.size == 0
            || change.after.size > 16 * 1024 * 1024 * 1024
            || change.after.sha256.len() != 64
            || !change.after.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Небезопасная запись обновления".into());
        }
        if let Some(before) = &change.before {
            if before.path != change.after.path || before.sha256.len() != 64 {
                return Err("Некорректная резервная запись".into());
            }
        }
    }
    if let Some(merge) = &j.merge {
        record_paths(merge)?;
        if merge.id == j.before.id
            || merge.collection_id != j.before.collection_id
            || merge.version.as_deref() != Some("01.09")
            || Path::new(&merge.root).parent() != Path::new(&j.before.root).parent()
        {
            return Err("Не согласованы две установки для объединения".into());
        }
    }
    Ok(())
}
fn owner(j: &Journal) -> Result<()> {
    let stage = stage(j);
    safe(&stage)?;
    if stage.exists() {
        let marker = stage.join("port-owner");
        if marker.exists() {
            if read_small(&marker, 256)? != j.before.id.as_bytes() {
                return Err("Не совпадает владелец временного обновления".into());
            }
        } else if fs::read_dir(stage).map_err(err)?.next().is_some() {
            return Err("Неизвестные временные файлы; очистка запрещена".into());
        }
    }
    Ok(())
}
fn apply_change(j: &Journal, change: &Change) -> Result<()> {
    let stage = stage(j);
    let root = Path::new(&j.before.root);
    let target = root.join(&change.after.path);
    safe(&target)?;
    let payload = stage.join("payload/uroot").join(
        change
            .after
            .path
            .strip_prefix("CUSA03173/")
            .ok_or("Неверный путь")?,
    );
    let backup = stage.join("backup").join(&change.after.path);
    if let Some(before) = &change.before {
        package::regular_file(&target)?;
        if fs::metadata(&target).map_err(err)?.len() != before.size || backup.exists() {
            return Err("Исходный файл изменён или резервная копия уже существует".into());
        }
        fs::create_dir_all(backup.parent().ok_or("Нет резервной папки")?).map_err(err)?;
        safe(&backup)?;
        fs::rename(&target, &backup).map_err(err)?;
    } else if target.exists() {
        return Err("Новый файл уже существует; перезапись неизвестного файла запрещена".into());
    }
    fs::create_dir_all(target.parent().ok_or("Нет папки файла")?).map_err(err)?;
    safe(&target)?;
    safe(&payload)?;
    fs::rename(payload, target).map_err(err)
}
fn swap_profile(j: &Journal) -> Result<()> {
    if j.merge.is_none() {
        return Ok(());
    }
    let root = Path::new(&j.before.root);
    let stage = stage(j);
    let current = root.join("user-data");
    if j.had_profile {
        scan(&current, &Arc::default())?;
        fs::rename(&current, stage.join("backup-profile")).map_err(err)?;
    }
    fs::rename(stage.join("next-profile"), current).map_err(err)
}
fn rollback(j: &Journal) -> Result<()> {
    let root = Path::new(&j.before.root);
    let stage = stage(j);
    // Undo does not use the cancelled task's token. File moves are idempotent across restarts.
    for change in j.changes.iter().rev() {
        let target = root.join(&change.after.path);
        safe(&target)?;
        let backup = stage.join("backup").join(&change.after.path);
        safe(&backup)?;
        let payload = stage.join("payload/uroot").join(
            change
                .after
                .path
                .strip_prefix("CUSA03173/")
                .ok_or("Неверный путь")?,
        );
        if let Some(before) = &change.before {
            if backup.exists() {
                if !matches(&backup, before)? {
                    return Err(
                        "Повреждена резервная копия; файлы сохранены для восстановления".into(),
                    );
                }
                if target.exists() {
                    if !matches(&target, &change.after)? {
                        return Err("Постороннее изменение во время отката; файл сохранён".into());
                    }
                    fs::remove_file(&target).map_err(err)?;
                }
                fs::rename(backup, target).map_err(err)?;
            } else if !matches(&target, before)? {
                return Err("Не найдена исходная версия файла для отката".into());
            }
        } else if target.exists() {
            if payload.exists() || !matches(&target, &change.after)? {
                return Err("Нельзя удалить неизвестный файл при откате".into());
            }
            fs::remove_file(&target).map_err(err)?;
        }
    }
    if j.merge.is_some() && stage.exists() {
        let profile = root.join("user-data");
        let backup = stage.join("backup-profile");
        if backup.exists() {
            scan(&backup, &Arc::default())?;
            if profile.exists() {
                scan(&profile, &Arc::default())?;
                fs::rename(&profile, stage.join("failed-profile")).map_err(err)?;
            }
            fs::rename(backup, profile).map_err(err)?;
        } else if !j.had_profile && !stage.join("next-profile").exists() && profile.exists() {
            scan(&profile, &Arc::default())?;
            fs::rename(profile, stage.join("failed-profile")).map_err(err)?;
        }
    }
    let manifest = root.join("port-manifest.json");
    let current = read_small(&manifest, 32 * 1024 * 1024)?;
    let hash = format!("{:x}", Sha256::digest(&current));
    if hash != j.before.manifest_sha256 {
        if !j.after.as_ref().is_some_and(|a| a.manifest_sha256 == hash) {
            return Err("Неизвестный манифест; восстановление остановлено".into());
        }
        let saved = stage.join("old-manifest.json");
        manifest_bytes(&j.before, &read_small(&saved, 32 * 1024 * 1024)?)?;
        fs::rename(saved, manifest).map_err(err)?;
    }
    load_manifest(&j.before)?;
    Ok(())
}
fn retire_duplicate(merge: &Installation) -> Result<()> {
    if in_use(Path::new(&merge.root))? {
        return Err("Закройте runtime старой отдельной копии для завершения объединения".into());
    }
    let manifest = load_manifest(merge)?;
    for e in manifest
        .files
        .iter()
        .filter(|e| e.path.starts_with("CUSA03173/"))
    {
        let path = Path::new(&merge.root).join(&e.path);
        safe(&path)?;
        if path.exists() {
            package::regular_file(&path)?;
            fs::remove_file(path).map_err(err)?;
        }
    }
    // Source profile, saves, runtime and unknown files survive, as with normal uninstall.
    Ok(())
}
fn finish_committed(j: &Journal) -> Result<()> {
    let after = j.after.as_ref().ok_or("Нет новой записи")?;
    load_manifest(after)?;
    for change in &j.changes {
        if !matches(
            &Path::new(&after.root).join(&change.after.path),
            &change.after,
        )? {
            return Err("Новая версия не прошла проверку после прерывания".into());
        }
    }
    let stage = stage(j);
    let backup = stage.join("backup-profile");
    if backup.exists() {
        let preserved = Path::new(&after.root).join(PROFILE_BACKUP);
        safe(&preserved)?;
        if preserved.exists() {
            return Err("Папка старого профиля уже существует; обе копии сохранены".into());
        }
        scan(&backup, &Arc::default())?;
        fs::rename(backup, preserved).map_err(err)?;
    }
    if let Some(merge) = &j.merge {
        retire_duplicate(merge)?;
    }
    cleanup(&stage)
}
fn same(a: &Installation, b: &Installation) -> bool {
    serde_json::to_value(a).ok() == serde_json::to_value(b).ok()
}
pub(super) fn recover(db: &Connection) -> Result<()> {
    let rows = {
        let mut q = db
            .prepare("SELECT id,value FROM update_jobs")
            .map_err(err)?;
        let rows = q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        rows
    };
    for (id, value) in rows {
        if value.len() > 1024 * 1024 {
            return Err("Слишком большой журнал восстановления".into());
        }
        let j: Journal = serde_json::from_str(&value).map_err(err)?;
        validate(&j)?;
        owner(&j)?;
        if id != j.before.id
            || in_use(Path::new(&j.before.root))?
            || j.merge
                .as_ref()
                .is_some_and(|m| in_use(Path::new(&m.root)).unwrap_or(true))
        {
            return Err("Закройте игру для восстановления обновления".into());
        }
        let current = records(db)?
            .into_iter()
            .find(|r| r.id == id)
            .ok_or("Установка исчезла из SQLite; данные сохранены")?;
        if j.after.as_ref().is_some_and(|after| same(&current, after)) {
            finish_committed(&j)?;
        } else if same(&current, &j.before) {
            rollback(&j)?;
            cleanup(&stage(&j))?;
        } else {
            return Err("Запись SQLite не совпадает с журналом; данные сохранены".into());
        }
        db.execute("DELETE FROM update_jobs WHERE id=?1", [id])
            .map_err(err)?;
    }
    Ok(())
}
fn commit(db: &Connection, j: &Journal) -> Result<()> {
    db.execute_batch("BEGIN IMMEDIATE").map_err(err)?;
    let result = (|| {
        let current = records(db)?;
        if !current.iter().any(|r| same(r, &j.before)) {
            return Err("Исходная запись SQLite изменилась".into());
        }
        if let Some(merge) = &j.merge {
            if !current.iter().any(|r| same(r, merge)) {
                return Err("Запись отдельной копии изменилась".into());
            }
        }
        let after = j.after.as_ref().ok_or("Нет новой записи")?;
        db.execute(
            "UPDATE installations SET value=?2 WHERE id=?1",
            params![after.id, serde_json::to_string(after).map_err(err)?],
        )
        .map_err(err)?;
        if let Some(merge) = &j.merge {
            db.execute("DELETE FROM installations WHERE id=?1", [&merge.id])
                .map_err(err)?;
        }
        Ok(())
    })();
    match result {
        Ok(()) => db.execute_batch("COMMIT").map_err(err),
        Err(e) => {
            let _ = db.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}
fn check_package(record: &Installation, path: &str, s: &Arc<Mutex<Status>>) -> Result<()> {
    let p = package::inspect_file(path)?;
    let meta = package::sfo(&read_small(
        &Path::new(&record.data_path).join("sce_sys/param.sfo"),
        1024 * 1024,
    )?)?;
    if record.version.as_deref() != Some("01.00")
        || meta.get("APP_VER").map(String::as_str) != Some("01.00")
        || p.title_id != "CUSA03173"
        || p.role != "update"
        || p.version.as_deref() != Some("01.09")
        || meta.get("CONTENT_ID") != Some(&p.content_id)
    {
        return Err(
            "Нужны установленная CUSA03173 01.00 и update 01.09 с тем же Content ID".into(),
        );
    }
    let file = open_read(Path::new(path))?;
    let size = file.metadata().map_err(err)?.len();
    reset(s, "updating", "Проверка полного SHA-256 update PKG", size);
    if stream(file, None, size, s)? != PACKAGE_HASH {
        return Err("Неподдерживаемый или повреждённый update PKG: SHA-256 не совпадает".into());
    }
    Ok(())
}
fn execute(
    app: &tauri::AppHandle,
    mut j: Journal,
    path: &str,
    s: &Arc<Mutex<Status>>,
) -> Result<()> {
    validate(&j)?;
    check_package(&j.before, path, s)?;
    let root = Path::new(&j.before.root);
    let stage = stage(&j);
    if stage.exists() {
        return Err("Осталась временная область обновления; перезапустите PORT".into());
    }
    let old = load_manifest(&j.before)?;
    let mut profile = Vec::new();
    if let Some(merge) = &j.merge {
        load_manifest(merge)?;
        if root.join(PROFILE_BACKUP).exists() {
            return Err("Резервная копия профиля уже существует; перезапись запрещена".into());
        }
        profile = scan(&Path::new(&merge.root).join("user-data"), s)?;
        if j.had_profile {
            scan(&root.join("user-data"), s)?;
        }
    }
    let profile_bytes: u64 = profile.iter().map(|e| e.size).sum();
    space(
        root,
        PATCH_BYTES
            .checked_add(profile_bytes)
            .and_then(|n| n.checked_add(64 * 1024 * 1024))
            .ok_or("Слишком большой профиль")?,
    )?;
    reset(
        s,
        "updating",
        "Проверка исходной установки; игровые файлы пока не изменяются",
        old.files.iter().map(|e| e.size).sum(),
    );
    verify(&j.before, true, s)?;
    with_db(app, |db| persist(db, &j))?;
    fs::create_dir(&stage).map_err(err)?;
    write_new(&stage.join("port-owner"), j.before.id.as_bytes())?;
    write_new(
        &stage.join("old-manifest.json"),
        &read_small(&root.join("port-manifest.json"), 32 * 1024 * 1024)?,
    )?;
    let cache = app.path().app_cache_dir().map_err(err)?;
    reset(
        s,
        "updating",
        "Извлечение и проверка обновления во временной области",
        PATCH_BYTES,
    );
    crate::pkg_worker::extract_update(
        path,
        &stage.join("payload"),
        &cache,
        |done, total| {
            if let Ok(mut s) = s.lock() {
                s.completed = done;
                s.total = total;
            }
        },
        || checkpoint(s).is_err(),
    )?;
    let payload = stage.join("payload/uroot");
    let files = scan(&payload, s)?;
    let meta = package::sfo(&read_small(
        &payload.join("sce_sys/param.sfo"),
        1024 * 1024,
    )?)?;
    if meta.get("TITLE_ID").map(String::as_str) != Some("CUSA03173")
        || meta.get("CATEGORY").map(String::as_str) != Some("gp")
        || meta.get("APP_VER").map(String::as_str) != Some("01.09")
        || files.len() != 432
        || files.iter().map(|e| e.size).sum::<u64>() != PATCH_BYTES
    {
        return Err("Извлечённое обновление не соответствует подтверждённому формату".into());
    }
    let mut entries: BTreeMap<_, _> = old.files.into_iter().map(|e| (e.path.clone(), e)).collect();
    reset(
        s,
        "updating",
        "Проверка файлов обновления до изменения оригинала",
        PATCH_BYTES,
    );
    for mut e in files {
        e.sha256 = digest(&payload.join(&e.path), e.size, s)?;
        e.path = format!("CUSA03173/{}", e.path);
        j.changes.push(Change {
            before: entries.insert(e.path.clone(), e.clone()),
            after: e,
        });
    }
    if let Some(merge) = &j.merge {
        fs::create_dir(stage.join("next-profile")).map_err(err)?;
        reset(
            s,
            "updating",
            "Сохранение актуального прогресса отдельной 1.09",
            profile_bytes.saturating_mul(2),
        );
        for e in &profile {
            let target = stage.join("next-profile").join(&e.path);
            let hash = stream(
                open_read(&Path::new(&merge.root).join("user-data").join(&e.path))?,
                Some(&target),
                e.size,
                s,
            )?;
            if digest(&target, e.size, s)? != hash {
                return Err("Не пройдена проверка копии актуального профиля".into());
            }
        }
    }
    let manifest = Manifest {
        schema: 1,
        id: j.before.id.clone(),
        version: meta.get("APP_VER").cloned(),
        files: entries.into_values().collect(),
    };
    let bytes = serde_json::to_vec(&manifest).map_err(err)?;
    let mut after = j.before.clone();
    after.version = manifest.version.clone();
    after.manifest_sha256 = format!("{:x}", Sha256::digest(&bytes));
    j.after = Some(after);
    write_new(&stage.join("next-manifest.json"), &bytes)?;
    validate(&j)?;
    with_db(app, |db| persist(db, &j))?; // Complete undo intent is durable before the first original-file move.
    if in_use(root)?
        || j.merge
            .as_ref()
            .is_some_and(|m| in_use(Path::new(&m.root)).unwrap_or(true))
    {
        return Err("Игра была запущена во время подготовки обновления".into());
    }
    reset(
        s,
        "updating",
        "Замена файлов в текущей установке; оригиналы резервируются для отката",
        PATCH_BYTES,
    );
    for change in &j.changes {
        checkpoint(s)?;
        apply_change(&j, change)?;
        if digest(&root.join(&change.after.path), change.after.size, s)? != change.after.sha256 {
            return Err("Проверка заменённого файла не пройдена".into());
        }
    }
    checkpoint(s)?;
    swap_profile(&j)?;
    if inspect(Path::new(&j.before.data_path), s, true)?
        .0
        .version
        .as_deref()
        != Some("01.09")
    {
        return Err("Фактическая версия после обновления не равна 01.09".into());
    }
    {
        let mut status = s.lock().map_err(err)?;
        if status.cancel {
            return Err("Отменено пользователем".into());
        }
        // Atomic manifest replacement + SQLite commit form the commit boundary. Late cancellation is refused.
        fs::rename(
            stage.join("next-manifest.json"),
            root.join("port-manifest.json"),
        )
        .map_err(err)?;
        with_db(app, |db| commit(db, &j))?;
        status.phase = "finalizing".into();
        status.message = "Обновление проверено; завершение транзакции".into();
    }
    with_db(app, recover)?;
    if let Ok(mut s) = s.lock() {
        s.phase = "ready".into();
        s.message="Установлена версия 1.09 поверх текущей игры. Папка и карточка сохранены; прогресс и настройки доступны в прежней установке.".into();
    }
    Ok(())
}
#[tauri::command]
pub fn update_installation(
    app: tauri::AppHandle,
    state: tauri::State<Installer>,
    id: String,
    path: String,
    updated_id: Option<String>,
) -> Result<()> {
    if !crate::pkg_worker::pkg_install_available() {
        return Err("В этой сборке нет PKG worker".into());
    }
    let guard = operation(&state, "updating")?;
    let before = get(&app, &id)?;
    let merge = updated_id.as_ref().map(|id| get(&app, id)).transpose()?;
    let j = Journal {
        schema: 1,
        had_profile: Path::new(&before.root).join("user-data").exists(),
        before,
        after: None,
        changes: Vec::new(),
        merge,
    };
    validate(&j)?;
    if in_use(Path::new(&j.before.root))?
        || j.merge
            .as_ref()
            .is_some_and(|m| in_use(Path::new(&m.root)).unwrap_or(true))
    {
        return Err("Сначала закройте игру и runtime обеих версий".into());
    }
    let status = state.status.clone();
    let job_id = j.before.id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        if let Err(e) = execute(&app, j, &path, &status) {
            let undo = with_db(&app, recover);
            let committed = with_db(&app, |db| {
                Ok(records(db)?
                    .iter()
                    .any(|r| r.id == job_id && r.version.as_deref() == Some("01.09")))
            })
            .unwrap_or(false);
            if let Ok(mut s) = status.lock() {
                s.phase = if committed && undo.is_ok() {
                    "ready"
                } else if s.cancel && undo.is_ok() {
                    "cancelled"
                } else {
                    "error"
                }
                .into();
                s.message=match undo {Ok(()) if committed=>"Обновление 1.09 проверено и завершено после восстановления.".into(),Ok(())=>format!("{e}. Незавершённые изменения отменены."),Err(undo)=>format!("{e}. Восстановление не завершено: {undo}. Файлы сохранены; запуск заблокирован до восстановления.")};
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::install::tests::{fixture, metadata, status};
    fn record(root: &Path, id: &str, version: &str) -> Installation {
        fixture(&root.join("CUSA03173"), Some(version));
        let files = scan(&root.join("CUSA03173"), &status())
            .unwrap()
            .into_iter()
            .map(|mut e| {
                e.sha256 =
                    digest(&root.join("CUSA03173").join(&e.path), e.size, &status()).unwrap();
                e.path = format!("CUSA03173/{}", e.path);
                e
            })
            .collect();
        let bytes = serde_json::to_vec(&Manifest {
            schema: 1,
            id: id.into(),
            version: Some(version.into()),
            files,
        })
        .unwrap();
        fs::write(root.join("port-manifest.json"), &bytes).unwrap();
        Installation {
            id: id.into(),
            collection_id: "bloodborne".into(),
            root: root.display().to_string(),
            data_path: root.join("CUSA03173").display().to_string(),
            runtime_path: root.join(RUNTIME).display().to_string(),
            version: Some(version.into()),
            manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
        }
    }
    fn job(merge: bool) -> (tempfile::TempDir, Connection, Journal) {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("PORT-Bloodborne-base");
        let before = record(&root, "base", "01.00");
        fs::create_dir(root.join("user-data")).unwrap();
        fs::write(root.join("user-data/save"), b"old progress").unwrap();
        let db = Connection::open_in_memory().unwrap();
        crate::init(&db).unwrap();
        register(&db, &before).unwrap();
        let merge = if merge {
            let other = temp.path().join("PORT-Bloodborne-separate");
            let r = record(&other, "separate", "01.09");
            register(&db, &r).unwrap();
            fs::create_dir(other.join("user-data")).unwrap();
            fs::write(other.join("user-data/save"), b"new 1.09 progress").unwrap();
            Some(r)
        } else {
            None
        };
        let mut j = Journal {
            schema: 1,
            before: before.clone(),
            after: None,
            changes: Vec::new(),
            merge,
            had_profile: true,
        };
        let stage = stage(&j);
        fs::create_dir(&stage).unwrap();
        fs::write(stage.join("port-owner"), b"base").unwrap();
        fs::copy(
            root.join("port-manifest.json"),
            stage.join("old-manifest.json"),
        )
        .unwrap();
        let payload = stage.join("payload/uroot");
        fs::create_dir_all(payload.join("sce_sys")).unwrap();
        let mut sfo = metadata(Some("01.09"));
        let at = sfo.windows(3).position(|w| w == b"gd\0").unwrap();
        sfo[at + 1] = b'p';
        fs::write(payload.join("sce_sys/param.sfo"), sfo).unwrap();
        fs::write(payload.join("eboot.bin"), b"new eboot").unwrap();
        fs::write(payload.join("added"), b"new full file").unwrap();
        let mut entries: BTreeMap<_, _> = load_manifest(&before)
            .unwrap()
            .files
            .into_iter()
            .map(|e| (e.path.clone(), e))
            .collect();
        for mut e in scan(&payload, &status()).unwrap() {
            e.sha256 = digest(&payload.join(&e.path), e.size, &status()).unwrap();
            e.path = format!("CUSA03173/{}", e.path);
            j.changes.push(Change {
                before: entries.insert(e.path.clone(), e.clone()),
                after: e,
            });
        }
        let bytes = serde_json::to_vec(&Manifest {
            schema: 1,
            id: before.id.clone(),
            version: Some("01.09".into()),
            files: entries.into_values().collect(),
        })
        .unwrap();
        let mut after = before;
        after.version = Some("01.09".into());
        after.manifest_sha256 = format!("{:x}", Sha256::digest(&bytes));
        j.after = Some(after);
        fs::write(stage.join("next-manifest.json"), bytes).unwrap();
        if j.merge.is_some() {
            fs::create_dir(stage.join("next-profile")).unwrap();
            fs::write(stage.join("next-profile/save"), b"new 1.09 progress").unwrap();
        }
        persist(&db, &j).unwrap();
        (temp, db, j)
    }
    fn apply_all(j: &Journal) {
        for change in &j.changes {
            apply_change(j, change).unwrap();
        }
        swap_profile(j).unwrap();
        fs::rename(
            stage(j).join("next-manifest.json"),
            Path::new(&j.before.root).join("port-manifest.json"),
        )
        .unwrap();
    }
    fn restored(db: &Connection, j: &Journal) {
        assert!(records(db).unwrap().iter().any(|r| same(r, &j.before)));
        let m = load_manifest(&j.before).unwrap();
        for e in m.files {
            assert!(matches(&Path::new(&j.before.root).join(&e.path), &e).unwrap());
        }
        assert!(!Path::new(&j.before.root).join("CUSA03173/added").exists());
        assert_eq!(
            fs::read(Path::new(&j.before.root).join("user-data/save")).unwrap(),
            b"old progress"
        );
    }
    #[test]
    fn successful_update_keeps_id_path_profile_and_one_record() {
        let (_temp, db, j) = job(false);
        apply_all(&j);
        commit(&db, &j).unwrap();
        recover(&db).unwrap();
        recover(&db).unwrap();
        let rows = records(&db).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(same(&rows[0], j.after.as_ref().unwrap()));
        assert_eq!(rows[0].root, j.before.root);
        assert!(!stage(&j).exists());
        assert_eq!(
            fs::read(Path::new(&rows[0].root).join("user-data/save")).unwrap(),
            b"old progress"
        );
    }
    #[test]
    fn every_partial_replacement_and_interrupted_backup_rolls_back() {
        for count in 0..=3 {
            let (_temp, db, j) = job(false);
            for change in j.changes.iter().take(count) {
                apply_change(&j, change).unwrap();
            }
            recover(&db).unwrap();
            recover(&db).unwrap();
            restored(&db, &j);
        }
        let (_temp, db, j) = job(false);
        let c = j.changes.iter().find(|c| c.before.is_some()).unwrap();
        let backup = stage(&j).join("backup").join(&c.after.path);
        fs::create_dir_all(backup.parent().unwrap()).unwrap();
        fs::rename(Path::new(&j.before.root).join(&c.after.path), backup).unwrap();
        recover(&db).unwrap();
        restored(&db, &j);
    }
    #[test]
    fn cancellation_reaches_update_checkpoint_and_undo_finishes() {
        let (_temp, db, j) = job(false);
        apply_change(&j, &j.changes[0]).unwrap();
        let s = status();
        {
            let mut s = s.lock().unwrap();
            s.active = true;
            s.phase = "updating".into();
            request_cancel(&mut s).unwrap();
        }
        assert!(checkpoint(&s).is_err());
        recover(&db).unwrap();
        restored(&db, &j);
    }
    #[test]
    fn crash_before_sqlite_commit_restores_manifest_and_both_profiles() {
        let (_temp, db, j) = job(true);
        apply_all(&j);
        recover(&db).unwrap();
        restored(&db, &j);
        assert_eq!(records(&db).unwrap().len(), 2);
        assert_eq!(
            fs::read(Path::new(&j.merge.as_ref().unwrap().root).join("user-data/save")).unwrap(),
            b"new 1.09 progress"
        );
    }
    #[test]
    fn committed_merge_retains_new_progress_and_old_profile_backup() {
        let (_temp, db, j) = job(true);
        apply_all(&j);
        commit(&db, &j).unwrap();
        recover(&db).unwrap();
        recover(&db).unwrap();
        let rows = records(&db).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "base");
        assert_eq!(rows[0].version.as_deref(), Some("01.09"));
        let root = Path::new(&rows[0].root);
        assert_eq!(
            fs::read(root.join("user-data/save")).unwrap(),
            b"new 1.09 progress"
        );
        assert_eq!(
            fs::read(root.join(PROFILE_BACKUP).join("save")).unwrap(),
            b"old progress"
        );
        let other = Path::new(&j.merge.as_ref().unwrap().root);
        assert!(!other.join("CUSA03173/eboot.bin").exists());
        assert_eq!(
            fs::read(other.join("user-data/save")).unwrap(),
            b"new 1.09 progress"
        );
    }
    #[test]
    fn damaged_backup_or_unknown_target_preserves_journal_and_files() {
        let (_temp, db, j) = job(false);
        let c = j.changes.iter().find(|c| c.before.is_some()).unwrap();
        apply_change(&j, c).unwrap();
        fs::write(stage(&j).join("backup").join(&c.after.path), b"corrupted").unwrap();
        assert!(recover(&db).is_err());
        assert!(stage(&j).exists());
        assert_eq!(records(&db).unwrap()[0].version.as_deref(), Some("01.00"));
        let (_temp, db, j) = job(false);
        let added = j.changes.iter().find(|c| c.before.is_none()).unwrap();
        fs::write(
            Path::new(&j.before.root).join(&added.after.path),
            b"unknown user file",
        )
        .unwrap();
        assert!(recover(&db).is_err());
        assert_eq!(
            fs::read(Path::new(&j.before.root).join(&added.after.path)).unwrap(),
            b"unknown user file"
        );
    }
    #[test]
    fn traversal_identity_and_space_errors_are_blocked() {
        let (temp, db, mut j) = job(false);
        j.changes[0].after.path = "../outside".into();
        persist(&db, &j).unwrap();
        assert!(recover(&db).is_err());
        j.changes[0].after.path = "user-data/save".into();
        assert!(validate(&j).is_err());
        let free = fs2::available_space(temp.path()).unwrap();
        assert!(space(temp.path(), free)
            .unwrap_err()
            .contains("Недостаточно"));
        assert!(space(temp.path(), u64::MAX).is_err());
    }
}
