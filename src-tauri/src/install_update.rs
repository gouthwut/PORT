//! Narrow confirmed full-file update. Only a new, journalled installation is written.
use super::*;
use std::collections::BTreeMap;

pub(super) struct UpdateSource {
    record: Installation,
    package: String,
    hashes: BTreeMap<String, (u64, String)>,
    profile: Vec<Entry>,
}

fn versions(
    base: Option<&str>,
    title: &str,
    role: &str,
    version: Option<&str>,
    package_content: &str,
    content: Option<&str>,
) -> Result<()> {
    if base != Some("01.00") {
        return Err("Поддерживается только обновление подтверждённой базы 01.00 до 01.09".into());
    }
    if title != "CUSA03173"
        || role != "update"
        || version != Some("01.09")
        || content != Some(package_content)
    {
        return Err(
            "Обновление должно иметь CUSA03173, APP_VER 01.09 и Content ID установленной игры"
                .into(),
        );
    }
    Ok(())
}

impl UpdateSource {
    pub(super) fn validate(
        &self,
        source: &(Folder, Vec<Entry>),
        s: &Arc<Mutex<Status>>,
    ) -> Result<()> {
        if in_use(Path::new(&self.record.root))? {
            return Err("Сначала закройте игру и runtime".into());
        }
        let meta = package::sfo(&read_small(
            &Path::new(&self.record.data_path).join("sce_sys/param.sfo"),
            1024 * 1024,
        )?)?;
        let package = package::inspect_file(&self.package)?;
        versions(
            source.0.version.as_deref(),
            &package.title_id,
            &package.role,
            package.version.as_deref(),
            &package.content_id,
            meta.get("CONTENT_ID").map(String::as_str),
        )?;
        phase(
            s,
            "updating",
            "Проверка полного SHA-256 update PKG до копирования базы",
        );
        let file = open_read(Path::new(&self.package))?;
        let size = file.metadata().map_err(err)?.len();
        if let Ok(mut status) = s.lock() {
            status.completed = 0;
            status.total = size;
        }
        if stream(file, None, size, s)?
            != "a138cfdc6133d7718dca77a3ef05072d50020d8e987c21be8d795980f78ff818"
        {
            return Err("Этот update PKG не входит в подтверждённый формат: SHA-256 не совпадает. Никакие файлы игры не изменены".into());
        }
        let expected: BTreeMap<_, _> = self
            .hashes
            .iter()
            .filter_map(|(p, (size, _))| p.strip_prefix("CUSA03173/").map(|p| (p, *size)))
            .collect();
        if source.1.len() != expected.len()
            || source
                .1
                .iter()
                .any(|e| expected.get(e.path.as_str()) != Some(&e.size))
        {
            return Err(
                "Состав основной игры изменён относительно манифеста; обновление остановлено"
                    .into(),
            );
        }
        checkpoint(s)
    }
    pub(super) fn profile_bytes(&self) -> u64 {
        self.profile.iter().map(|e| e.size).sum()
    }
    pub(super) fn check_copied(&self, path: &str, size: u64, hash: &str) -> Result<()> {
        if !self
            .hashes
            .get(path)
            .is_some_and(|(n, h)| *n == size && h == hash)
        {
            return Err(format!(
                "Исходная 1.00 изменена: {path}. Оригинал сохранён."
            ));
        }
        Ok(())
    }
    pub(super) fn apply(
        &self,
        stage: &Path,
        cache: &Path,
        entries: &mut Vec<Entry>,
        s: &Arc<Mutex<Status>>,
    ) -> Result<()> {
        phase(
            s,
            "updating",
            "Проверка SHA-256 и извлечение подтверждённого обновления 1.09",
        );
        let output = stage.join("update-output");
        crate::pkg_worker::extract_update(
            &self.package,
            &output,
            cache,
            |done, total| {
                if let Ok(mut status) = s.lock() {
                    status.completed = done;
                    status.total = total;
                }
            },
            || checkpoint(s).is_err(),
        )?;
        overlay(stage, &output.join("uroot"), entries, s)?;
        cleanup(&output)?;
        if inspect(&stage.join("CUSA03173"), s, true)?
            .0
            .version
            .as_deref()
            != Some("01.09")
        {
            return Err("Извлечённый PARAM.SFO не подтверждает 01.09".into());
        }
        phase(
            s,
            "copying",
            "Копирование отдельного профиля: исходные сохранения и настройки сохраняются",
        );
        if let Ok(mut status) = s.lock() {
            status.completed = 0;
            status.total = self.profile_bytes().saturating_mul(2);
        }
        let profile = Path::new(&self.record.root).join("user-data");
        for e in &self.profile {
            let from = profile.join(&e.path);
            package::regular_file(&from)?;
            let destination = stage.join("user-data").join(&e.path);
            let hash = stream(open_read(&from)?, Some(&destination), e.size, s)?;
            if stream(open_read(&destination)?, None, e.size, s)? != hash {
                return Err(
                    "Не пройдена проверка отдельной копии профиля; исходный профиль сохранён"
                        .into(),
                );
            }
        }
        phase(
            s,
            "updating",
            "Проверка SHA-256 всех файлов новой 1.09 перед регистрацией",
        );
        if let Ok(mut status) = s.lock() {
            status.completed = 0;
            status.total = entries.iter().map(|e| e.size).sum();
        }
        readback(stage, entries, s)?;
        if in_use(Path::new(&self.record.root))? {
            return Err("Игра была запущена во время обновления. Оригинал сохранён; повторите после закрытия игры".into());
        }
        Ok(())
    }
}

fn readback(root: &Path, entries: &[Entry], s: &Arc<Mutex<Status>>) -> Result<()> {
    for e in entries {
        if stream(open_read(&root.join(&e.path))?, None, e.size, s)? != e.sha256 {
            return Err(format!("Проверка новой копии не пройдена: {}", e.path));
        }
    }
    Ok(())
}

fn overlay(
    stage: &Path,
    patch: &Path,
    entries: &mut Vec<Entry>,
    s: &Arc<Mutex<Status>>,
) -> Result<()> {
    let files = scan(patch, s)?;
    if files.is_empty() || files.iter().any(|e| e.size == 0) {
        return Err("Пустое обновление или файл".into());
    }
    phase(
        s,
        "updating",
        "Применение полных файлов обновления только к новой копии",
    );
    if let Ok(mut status) = s.lock() {
        status.completed = 0;
        status.total = files.iter().map(|e| e.size).sum();
    }
    let meta = package::sfo(&read_small(&patch.join("sce_sys/param.sfo"), 1024 * 1024)?)?;
    if meta.get("TITLE_ID").map(String::as_str) != Some("CUSA03173")
        || meta.get("CATEGORY").map(String::as_str) != Some("gp")
        || meta.get("APP_VER").map(String::as_str) != Some("01.09")
    {
        return Err("Метаданные извлечённого обновления не совпадают".into());
    }
    // The worker accepts one exact package digest, whose confirmed semantics are full-file
    // replacements/additions. There is deliberately no deletion/delta interpretation here.
    for e in files {
        checkpoint(s)?;
        let path = format!("CUSA03173/{}", e.path);
        let target = stage.join(&path);
        safe(&target)?;
        if target.exists() {
            package::regular_file(&target)?;
            fs::remove_file(&target).map_err(err)?;
        }
        let hash = stream(open_read(&patch.join(&e.path))?, Some(&target), e.size, s)?;
        entries.retain(|old| !old.path.eq_ignore_ascii_case(&path));
        entries.push(Entry {
            path,
            size: e.size,
            sha256: hash,
        });
    }
    Ok(())
}

#[tauri::command]
pub fn update_installation(
    app: tauri::AppHandle,
    state: tauri::State<Installer>,
    id: String,
    path: String,
) -> Result<()> {
    if !crate::pkg_worker::pkg_install_available() {
        return Err("В этой сборке нет PKG worker".into());
    }
    let guard = operation(&state, "updating")?;
    if with_db(&app, records)?
        .iter()
        .any(|r| r.collection_id == "bloodborne" && r.version.as_deref() == Some("01.09"))
    {
        return Err(
            "Версия 1.09 уже есть в библиотеке. Дополнительная полная копия не создаётся".into(),
        );
    }
    let record = get(&app, &id)?;
    if in_use(Path::new(&record.root))? {
        return Err("Сначала закройте игру и runtime".into());
    }
    let source = record.data_path.clone();
    let parent = Path::new(&record.root)
        .parent()
        .ok_or("Нет папки установки")?
        .display()
        .to_string();
    let status = state.status.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let result = (|| {
            let manifest = load_manifest(&record)?;
            let profile = Path::new(&record.root).join("user-data");
            let profile = if profile.exists() {
                scan(&profile, &status)?
            } else {
                Vec::new()
            };
            let hashes = manifest
                .files
                .into_iter()
                .map(|e| (e.path, (e.size, e.sha256)))
                .collect();
            let update = UpdateSource {
                record,
                package: path,
                hashes,
                profile,
            };
            install_job(
                &app,
                Some(source),
                Vec::new(),
                parent,
                &status,
                Some(update),
            )
        })();
        if let Err(e) = result {
            if let Ok(mut s) = status.lock() {
                s.phase = if s.cancel { "cancelled" } else { "error" }.into();
                s.message = e;
                s.active = false;
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::install::tests::{fixture, metadata, status};
    #[test]
    fn replacement_addition_readback_and_original_untouched() {
        let temp = tempfile::tempdir().unwrap();
        let original = temp.path().join("original");
        fixture(&original, Some("01.00"));
        let before = fs::read(original.join("sce_sys/param.sfo")).unwrap();
        let stage = temp.path().join("stage");
        let patch = temp.path().join("patch");
        fixture(&stage.join("CUSA03173"), Some("01.00"));
        fs::create_dir_all(patch.join("sce_sys")).unwrap();
        let mut sfo = metadata(Some("01.09"));
        let at = sfo.windows(3).position(|w| w == b"gd\0").unwrap();
        sfo[at + 1] = b'p';
        fs::write(patch.join("sce_sys/param.sfo"), sfo).unwrap();
        fs::write(patch.join("added"), b"new full file").unwrap();
        let mut entries = Vec::new();
        overlay(&stage, &patch, &mut entries, &status()).unwrap();
        readback(&stage, &entries, &status()).unwrap();
        assert_eq!(
            fs::read(original.join("sce_sys/param.sfo")).unwrap(),
            before
        );
        assert!(stage.join("CUSA03173/sce_module/module.sprx").exists());
        assert_eq!(
            inspect(&stage.join("CUSA03173"), &status(), false)
                .unwrap()
                .0
                .version
                .as_deref(),
            Some("01.09")
        );
        fs::write(stage.join("CUSA03173/added"), b"bad").unwrap();
        assert!(readback(&stage, &entries, &status()).is_err());
        let cancelled = status();
        cancelled.lock().unwrap().cancel = true;
        assert!(overlay(&stage, &patch, &mut entries, &cancelled).is_err());
        fs::write(patch.join("sce_sys/param.sfo"), metadata(Some("01.00"))).unwrap();
        assert!(overlay(&stage, &patch, &mut entries, &status()).is_err());
    }
    #[test]
    fn compatibility_rejects_foreign_identity_and_version() {
        let valid = |base, title, role, version, content| {
            versions(base, title, role, version, "matching", content)
        };
        assert!(valid(
            Some("01.00"),
            "CUSA03173",
            "update",
            Some("01.09"),
            Some("matching")
        )
        .is_ok());
        for (base, title, role, version, content) in [
            (
                Some("01.09"),
                "CUSA03173",
                "update",
                Some("01.09"),
                Some("matching"),
            ),
            (None, "CUSA03173", "update", Some("01.09"), Some("matching")),
            (
                Some("01.00"),
                "CUSA00000",
                "update",
                Some("01.09"),
                Some("matching"),
            ),
            (
                Some("01.00"),
                "CUSA03173",
                "delta",
                Some("01.09"),
                Some("matching"),
            ),
            (
                Some("01.00"),
                "CUSA03173",
                "update",
                Some("01.08"),
                Some("matching"),
            ),
            (
                Some("01.00"),
                "CUSA03173",
                "update",
                Some("01.09"),
                Some("foreign"),
            ),
        ] {
            assert!(valid(base, title, role, version, content).is_err());
        }
        let temp = tempfile::tempdir().unwrap();
        // Reuse bounded package metadata fixtures from the existing inspector tests indirectly:
        // invalid/truncated packages never enter an extraction job.
        let path = temp.path().join("broken.pkg");
        fs::write(&path, b"broken").unwrap();
        assert!(package::inspect_file(path.to_str().unwrap()).is_err());
    }
    #[test]
    fn insufficient_space_and_finalized_update_recovery_keep_original() {
        let temp = tempfile::tempdir().unwrap();
        let free = fs2::available_space(temp.path()).unwrap();
        assert!(space(temp.path(), free)
            .unwrap_err()
            .contains("Недостаточно"));
        let db = Connection::open_in_memory().unwrap();
        crate::init(&db).unwrap();
        let mut original = None;
        for (id, version) in [("base", "01.00"), ("update", "01.09")] {
            let root = temp.path().join(format!("PORT-Bloodborne-{id}"));
            fixture(&root.join("CUSA03173"), Some(version));
            let files = scan(&root.join("CUSA03173"), &status())
                .unwrap()
                .into_iter()
                .map(|mut e| {
                    e.sha256 = stream(
                        open_read(&root.join("CUSA03173").join(&e.path)).unwrap(),
                        None,
                        e.size,
                        &status(),
                    )
                    .unwrap();
                    e.path = format!("CUSA03173/{}", e.path);
                    e
                })
                .collect();
            let manifest = Manifest {
                schema: 1,
                id: id.into(),
                version: Some(version.into()),
                files,
            };
            let bytes = serde_json::to_vec(&manifest).unwrap();
            fs::write(root.join("port-manifest.json"), &bytes).unwrap();
            fs::write(root.join("port-owner"), id).unwrap();
            let record = Installation {
                id: id.into(),
                collection_id: "bloodborne".into(),
                root: root.display().to_string(),
                data_path: root.join("CUSA03173").display().to_string(),
                runtime_path: root.join(RUNTIME).display().to_string(),
                version: Some(version.into()),
                manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
            };
            if id == "base" {
                register(&db, &record).unwrap();
                original = Some(serde_json::to_string(&record).unwrap());
            } else {
                db.execute(
                    "INSERT INTO installation_jobs VALUES(?1,?2,?3)",
                    params![
                        id,
                        temp.path().join(".port-stage-update").display().to_string(),
                        record.root
                    ],
                )
                .unwrap();
            }
        }
        recover(&db).unwrap();
        recover(&db).unwrap();
        let rows = records(&db).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(
            serde_json::to_string(rows.iter().find(|r| r.id == "base").unwrap()).unwrap(),
            original.unwrap()
        );
        assert!(rows.iter().any(|r| r.version.as_deref() == Some("01.09")));
        assert!(temp
            .path()
            .join("PORT-Bloodborne-base/CUSA03173/eboot.bin")
            .exists());
    }
}
