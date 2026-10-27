//! Destination preflight; no migration or mutation of existing registrations.
use super::*;

pub(super) fn new_id() -> Result<String> {
    Ok(format!(
        "{}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(err)?
            .as_nanos(),
        std::process::id()
    ))
}
pub(crate) fn valid_id(id: &str) -> bool {
    let parts: Vec<_> = id.split('-').collect();
    id.len() <= 64
        && parts.len() == 2
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}
pub(super) fn destination(parent: &Path, id: &str, installed: &[Installation]) -> Result<PathBuf> {
    destination_for(parent, id, installed, "bloodborne")
}
pub(super) fn destination_for(
    parent: &Path,
    id: &str,
    installed: &[Installation],
    adapter_id: &str,
) -> Result<PathBuf> {
    let adapter = crate::adapters::get(adapter_id)?;
    safe(parent)?;
    if parent.to_string_lossy().len() > 2048 || parent.components().any(|c| matches!(c, Component::Normal(n) if n.to_str().is_none_or(|s| !download::safe_zip_name(s)))) {
        return Err("Папка содержит недопустимое имя Windows".into());
    }
    if !valid_id(id) || !parent.is_dir() || parent.parent().is_none() {
        return Err("Выберите существующую папку на локальном диске, не корень диска".into());
    }
    #[cfg(windows)]
    for key in [
        "SystemRoot",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "ProgramData",
    ] {
        if let Some(p) = std::env::var_os(key) {
            if overlaps_below(parent, Path::new(&p)) {
                return Err("Выберите папку вне системных каталогов и Program Files".into());
            }
        }
    }
    let root = parent.join(format!("PORT-{}-{id}", adapter.name));
    for r in installed {
        if r.id == id {
            return Err(
                "Этот ID уже зарегистрирован в библиотеке. Откройте установку заново".into(),
            );
        }
        let existing = Path::new(&r.root);
        let canonical_root = fs::canonicalize(parent)
            .map_err(err)?
            .join(format!("PORT-{}-{id}", adapter.name));
        if overlaps_below(parent, existing) || overlaps_below(existing, &canonical_root) {
            return Err(
                "Назначение пересекается с уже установленной игрой. Выберите другую папку".into(),
            );
        }
    }
    for p in [&root, &parent.join(format!(".port-stage-{id}"))] {
        if fs::symlink_metadata(p).is_ok() {
            return Err(
                "В папке назначения уже есть файлы этой установки. Они не будут перезаписаны"
                    .into(),
            );
        }
    }
    Ok(root)
}
fn overlaps_below(path: &Path, base: &Path) -> bool {
    // Windows paths are case insensitive; component boundaries avoid prefix collisions.
    let path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let base = fs::canonicalize(base).unwrap_or_else(|_| base.to_path_buf());
    Path::new(&path.to_string_lossy().to_lowercase())
        .starts_with(base.to_string_lossy().to_lowercase())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    id: String,
    root: String,
    available: u64,
    required: u64,
}
#[tauri::command]
pub fn default_install_parent(app: tauri::AppHandle) -> Result<String> {
    Ok(app
        .path()
        .document_dir()
        .map_err(err)?
        .display()
        .to_string())
}
#[tauri::command]
pub async fn check_install_destination(
    app: tauri::AppHandle,
    parent: String,
    bytes: u64,
    id: Option<String>,
    adapter_id: Option<String>,
) -> Result<Destination> {
    tauri::async_runtime::spawn_blocking(move || {
        let id = id.map(Ok).unwrap_or_else(new_id)?;
        let p = Path::new(&parent);
        let root = with_db(&app, |db| {
            destination_for(
                p,
                &id,
                &records(db)?,
                adapter_id.as_deref().unwrap_or("bloodborne"),
            )
        })?;
        let required = bytes
            .checked_add(3 * 1024 * 1024 * 1024)
            .ok_or("Размер слишком большой")?;
        space(p, required)?;
        // Exclusive, short lived probe: no existing user file can be overwritten.
        let probe = p.join(format!(".port-write-check-{}", new_id()?));
        write_new(&probe, b"PORT destination check").map_err(|_| {
            "Нет доступа для записи в выбранную папку. Выберите другую папку".to_string()
        })?;
        fs::remove_file(&probe).map_err(err)?;
        Ok(Destination {
            id,
            root: root.display().to_string(),
            available: fs2::available_space(p).map_err(err)?,
            required: required + RESERVE,
        })
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub fn open_installation_folder(app: tauri::AppHandle, id: String) -> Result<String> {
    let r = get(&app, &id)?;
    load_manifest(&r)?;
    #[cfg(windows)]
    {
        let explorer =
            PathBuf::from(std::env::var_os("SystemRoot").ok_or("Windows directory unavailable")?)
                .join("explorer.exe");
        Command::new(explorer)
            .arg(&r.root)
            .spawn()
            .map_err(|_| "Не удалось открыть Проводник".to_string())?;
        Ok("Папка установки открыта".into())
    }
    #[cfg(not(windows))]
    Err("Проводник доступен только в Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn custom_destination_registration_survives_reopen_without_rewriting_existing_rows() {
        let t = tempfile::tempdir().unwrap();
        let file = t.path().join("test.sqlite");
        let db = Connection::open(&file).unwrap();
        crate::init(&db).unwrap();
        crate::catalog::init(&db).unwrap();
        let original = Installation {
            id: "1-2".into(),
            collection_id: "bloodborne".into(),
            root: "existing-root".into(),
            data_path: "existing-data".into(),
            runtime_path: "existing-runtime".into(),
            version: Some("01.09".into()),
            manifest_sha256: "original".into(),
        };
        register(&db, &original).unwrap();
        let raw: String = db
            .query_row("SELECT value FROM installations WHERE id='1-2'", [], |r| {
                r.get(0)
            })
            .unwrap();
        let root = destination(t.path(), "3-4", &[]).unwrap();
        let new = Installation {
            id: "3-4".into(),
            collection_id: "bloodborne".into(),
            root: root.display().to_string(),
            data_path: root.join("CUSA03173").display().to_string(),
            runtime_path: root.join(RUNTIME).display().to_string(),
            version: Some("01.00".into()),
            manifest_sha256: "fixture".into(),
        };
        register(&db, &new).unwrap();
        drop(db);
        let db = Connection::open(file).unwrap();
        crate::init(&db).unwrap();
        assert_eq!(
            db.query_row("SELECT value FROM installations WHERE id='1-2'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
            raw
        );
        let reloaded = records(&db)
            .unwrap()
            .into_iter()
            .find(|r| r.id == "3-4")
            .unwrap();
        assert_eq!(reloaded.root, new.root);
        assert_eq!(reloaded.data_path, new.data_path);
        assert_eq!(reloaded.runtime_path, new.runtime_path);
        assert_eq!(
            db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            4
        );
    }
    #[test]
    fn destinations_never_overwrite_or_nest_installations() {
        let t = tempfile::tempdir().unwrap();
        let id = "123-45";
        assert!(!valid_id("../x"));
        assert!(!valid_id("123-4 --evil"));
        assert!(!valid_id("1--2"));
        let mut committed = Status {
            active: true,
            phase: "finishing".into(),
            ..Status::default()
        };
        assert!(request_cancel(&mut committed).is_err());
        assert!(!committed.cancel);
        let root = destination(t.path(), id, &[]).unwrap();
        fs::create_dir(&root).unwrap();
        fs::write(root.join("foreign"), b"untouched").unwrap();
        assert!(destination(t.path(), id, &[]).is_err());
        let r = Installation {
            id: id.into(),
            collection_id: "bloodborne".into(),
            root: root.display().to_string(),
            data_path: String::new(),
            runtime_path: String::new(),
            version: None,
            manifest_sha256: String::new(),
        };
        assert!(destination(t.path(), id, std::slice::from_ref(&r)).is_err());
        assert!(destination(&root, "4-5", &[r]).is_err());
        assert_eq!(fs::read(root.join("foreign")).unwrap(), b"untouched");
        assert!(destination(&t.path().join("missing"), "4-5", &[]).is_err());
        #[cfg(windows)]
        {
            assert!(destination(Path::new("C:\\"), "4-5", &[]).is_err());
            assert!(destination(Path::new("C:\\Windows"), "4-5", &[]).is_err());
            assert!(destination(Path::new("C:\\Windows\\.."), "4-5", &[]).is_err());
        }
    }
}
