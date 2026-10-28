//! Explicit local recovery: never discover or register arbitrary folders automatically.
use super::*;
pub(super) fn owned_root(root: &Path, adapter: &crate::adapters::Adapter, id: &str) -> bool {
    let name = root.file_name().and_then(|n| n.to_str());
    name == Some(format!("PORT-{}-{id}", adapter.name).as_str())
        || (name
            == Some(if adapter.id == "skate3" {
                "Skate 3"
            } else {
                adapter.name
            })
            && read_small(&root.join("port-owner"), 256).is_ok_and(|v| v == id.as_bytes()))
}
fn candidate(root: &Path) -> Result<Installation> {
    safe(root)?;
    let bytes = read_small(&root.join("port-manifest.json"), 32 * 1024 * 1024)?;
    let m: Manifest = serde_json::from_slice(&bytes).map_err(err)?;
    if !experience::valid_id(&m.id) || read_small(&root.join("port-owner"), 256)? != m.id.as_bytes()
    {
        return Err("Не подтверждено владение папкой PORT".into());
    }
    let mut matches = Vec::new();
    for a in [&crate::adapters::BLOODBORNE, &crate::adapters::SKATE3] {
        let r = Installation {
            id: m.id.clone(),
            collection_id: a.id.into(),
            root: root.display().to_string(),
            data_path: root.join(a.data).display().to_string(),
            runtime_path: root.join(a.runtime).display().to_string(),
            version: m.version.clone(),
            manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        if load_manifest(&r).is_ok() && !m.files.is_empty() {
            matches.push(r);
        }
    }
    if matches.len() != 1 {
        return Err("Неизвестная или неоднозначная установка".into());
    }
    Ok(matches.remove(0))
}
#[tauri::command]
pub async fn restore_installation(
    app: tauri::AppHandle,
    state: tauri::State<'_, Installer>,
    path: String,
) -> Result<String> {
    let operation = operation(&state, "recovering")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = operation;
        let r = candidate(Path::new(&path))?;
        if in_use(Path::new(&r.root))? {
            return Err("Сначала закройте игру".into());
        }
        verify(&r, true, &Arc::default())?;
        with_db(&app, |db| {
            let items = records(db)?;
            if let Some(old) = items.iter().find(|i| i.id == r.id) {
                if Path::new(&old.root).exists()
                    || old.collection_id != r.collection_id
                    || old.manifest_sha256 != r.manifest_sha256
                {
                    return Err(
                        "Эта установка уже зарегистрирована или манифест не совпадает".into(),
                    );
                }
                if db
                    .query_row("SELECT COUNT(*) FROM update_jobs", [], |row| {
                        row.get::<_, i64>(0)
                    })
                    .map_err(err)?
                    > 0
                {
                    return Err("Сначала завершите восстановление обновления".into());
                }
                db.execute(
                    "UPDATE installations SET value=?1 WHERE id=?2",
                    params![serde_json::to_string(&r).map_err(err)?, r.id],
                )
                .map_err(err)?;
                return Ok(());
            }
            if items.iter().any(|i| i.root.eq_ignore_ascii_case(&r.root)) {
                return Err("Папка уже зарегистрирована".into());
            }
            register(db, &r)
        })?;
        Ok("Связь с проверенной установкой восстановлена".into())
    })
    .await
    .map_err(err)?
}

/// Only inventoried parent directories are eligible; unknown empty directories survive too.
pub(super) fn prune_owned(root: &Path, manifest: &Manifest) -> Result<()> {
    let mut dirs = HashSet::new();
    for entry in &manifest.files {
        relative(&entry.path)?;
        let mut path = root.join(&entry.path);
        while let Some(parent) = path.parent() {
            if parent == root {
                break;
            }
            if !parent.starts_with(root) {
                return Err("Directory outside installation".into());
            }
            dirs.insert(parent.to_path_buf());
            path = parent.to_path_buf();
        }
    }
    let mut dirs: Vec<_> = dirs.into_iter().collect();
    dirs.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    dirs.push(root.to_path_buf());
    for dir in dirs {
        safe(&dir)?;
        if dir.is_dir() && fs::read_dir(&dir).map_err(err)?.next().is_none() {
            fs::remove_dir(dir).map_err(err)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_requires_owner_and_valid_manifest() {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("Bloodborne");
        fs::create_dir(&root).unwrap();
        let m = Manifest {
            schema: 1,
            id: "1-2".into(),
            version: None,
            files: vec![Entry {
                path: "CUSA03173/eboot.bin".into(),
                size: 1,
                sha256: "a".repeat(64),
            }],
        };
        fs::write(
            root.join("port-manifest.json"),
            serde_json::to_vec(&m).unwrap(),
        )
        .unwrap();
        assert!(candidate(&root).is_err());
        fs::write(root.join("port-owner"), b"1-2").unwrap();
        let r = candidate(&root).unwrap();
        assert_eq!(r.id, "1-2");
        assert!(verify(&r, true, &Arc::default()).is_err());
        fs::write(root.join("port-owner"), b"3-4").unwrap();
        assert!(candidate(&root).is_err());
    }
    #[test]
    fn prune_preserves_saves_unknown_and_source() {
        let t = tempfile::tempdir().unwrap();
        let r = t.path().join("game");
        fs::create_dir_all(r.join("empty/nested")).unwrap();
        fs::create_dir_all(r.join("user-data")).unwrap();
        fs::write(r.join("user-data/save"), b"save").unwrap();
        fs::write(r.join("source.iso"), b"iso").unwrap();
        let m = Manifest {
            schema: 1,
            id: "1-2".into(),
            version: None,
            files: vec![Entry {
                path: "empty/nested/removed".into(),
                size: 0,
                sha256: "a".repeat(64),
            }],
        };
        prune_owned(&r, &m).unwrap();
        assert!(!r.join("empty").exists());
        assert!(r.join("source.iso").exists());
        assert!(r.join("user-data/save").exists());
    }
}

pub(super) fn remove_owned_files(r: &Installation, manifest: &Manifest) -> Result<()> {
    let root = Path::new(&r.root);
    // Inventory only. Modified files may contain user data and are retained.
    // Keep manifest and DB row until every fallible deletion succeeds: retries are idempotent.
    for e in &manifest.files {
        let path = root.join(&e.path);
        safe(&path)?;
        if path.exists() {
            package::regular_file(&path)?;
            if fs::metadata(&path).map_err(err)?.len() != e.size
                || stream(open_read(&path)?, None, e.size, &Arc::default())? != e.sha256
            {
                continue;
            }
            fs::remove_file(&path).map_err(err)?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod removal_tests {
    use super::*;
    #[test]
    fn removal_retry_preserves_modified_and_source_files() {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("Bloodborne");
        fs::create_dir_all(root.join("CUSA03173")).unwrap();
        let mut entries = vec![];
        for name in ["owned", "modified"] {
            fs::write(root.join("CUSA03173").join(name), b"original").unwrap();
            entries.push(Entry {
                path: format!("CUSA03173/{name}"),
                size: 8,
                sha256: format!("{:x}", Sha256::digest(b"original")),
            });
        }
        fs::write(root.join("CUSA03173/modified"), b"saveData").unwrap();
        fs::write(root.join("source.pkg"), b"source").unwrap();
        let r = Installation {
            id: "1-2".into(),
            collection_id: "bloodborne".into(),
            root: root.display().to_string(),
            data_path: String::new(),
            runtime_path: String::new(),
            version: None,
            manifest_sha256: String::new(),
        };
        let m = Manifest {
            schema: 1,
            id: r.id.clone(),
            version: None,
            files: entries,
        };
        remove_owned_files(&r, &m).unwrap();
        remove_owned_files(&r, &m).unwrap();
        assert!(!root.join("CUSA03173/owned").exists());
        assert_eq!(
            fs::read(root.join("CUSA03173/modified")).unwrap(),
            b"saveData"
        );
        assert!(root.join("source.pkg").exists());
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    #[test]
    fn valid_recovery_reopens_and_partial_removal_is_retryable() {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("Bloodborne");
        fs::create_dir_all(root.join(RUNTIME)).unwrap();
        fs::create_dir_all(root.join("CUSA03173")).unwrap();
        let mut files = vec![];
        for name in ["bbport-windows/Bloodborne.exe", "CUSA03173/eboot.bin"] {
            fs::write(root.join(name), b"fixture").unwrap();
            files.push(Entry {
                path: name.into(),
                size: 7,
                sha256: format!("{:x}", Sha256::digest(b"fixture")),
            });
        }
        let m = Manifest {
            schema: 1,
            id: "7-8".into(),
            version: None,
            files,
        };
        fs::write(root.join("port-owner"), b"7-8").unwrap();
        fs::write(
            root.join("port-manifest.json"),
            serde_json::to_vec(&m).unwrap(),
        )
        .unwrap();
        let r = candidate(&root).unwrap();
        // Small synthetic inventory: full recovery additionally enforces the real dump completeness floor.
        verify(&r, false, &Arc::default()).unwrap();
        let dbpath = t.path().join("test.db");
        let db = Connection::open(&dbpath).unwrap();
        crate::init(&db).unwrap();
        register(&db, &r).unwrap();
        drop(db);
        let db = Connection::open(&dbpath).unwrap();
        crate::init(&db).unwrap();
        assert_eq!(records(&db).unwrap()[0].manifest_sha256, r.manifest_sha256);
        // A directory in place of an inventoried file causes a hard failure after partial progress.
        fs::remove_file(root.join("CUSA03173/eboot.bin")).unwrap();
        fs::create_dir(root.join("CUSA03173/eboot.bin")).unwrap();
        assert!(remove_owned_files(&r, &m).is_err());
        assert_eq!(records(&db).unwrap().len(), 1);
        assert!(root.join("port-manifest.json").exists());
        fs::remove_dir(root.join("CUSA03173/eboot.bin")).unwrap();
        fs::write(root.join("CUSA03173/eboot.bin"), b"fixture").unwrap();
        remove_owned_files(&r, &m).unwrap();
    }
}
