//! Local CMS companion operations. No database, registration, publication or game launch on inspection.
use super::*;
use serde_json::json;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    action: String,
    recipe: Value,
    workspace: PathBuf,
    source: Option<PathBuf>,
    #[serde(default)]
    sources: Selections,
    archive: Option<PathBuf>,
    #[serde(default)]
    consent: bool,
}

/// Explicit local CLI, handled before Tauri/single-instance/SQLite initialization.
pub fn entry() -> bool {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).is_none_or(|a| a != "--owner-recipe-request") {
        return false;
    }
    if args.len() != 3 {
        return true;
    }
    let request = PathBuf::from(&args[2]);
    let response = request.with_extension("response.json");
    let result = (|| {
        safe(&request)?;
        let f = open_read(&request)?;
        let mut raw = String::new();
        f.take(128 * 1024 + 1)
            .read_to_string(&mut raw)
            .map_err(err)?;
        if raw.len() > 128 * 1024 {
            return Err("owner request: превышает 128 КиБ".into());
        }
        perform(serde_json::from_str(&raw).map_err(err)?, &github_fetch)
    })();
    let result = match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(message) => json!({"ok":false,"error":message}),
    };
    // Exclusive output; an old/foreign response is never replaced.
    let _ = write_new(&response, result.to_string().as_bytes());
    true
}

fn perform(q: Request, fetch: &dyn Fn(&str) -> Result<Box<dyn Read>>) -> Result<Value> {
    safe(&q.workspace)?;
    if !q.workspace.is_absolute() || q.workspace.exists() {
        return Err("workspace: нужна новая отдельная абсолютная папка".into());
    }
    fs::create_dir(&q.workspace).map_err(err)?;
    let stage = &q.workspace;
    let s = Arc::default();
    let mut raw = q.recipe;
    match q.action.as_str() {
        "runtime" => {
            if !q.consent {
                return Err(
                    "runtime: требуется согласие на официальный download (без запуска)".into(),
                );
            }
            let mut r: Recipe = serde_json::from_value(raw.clone()).map_err(err)?;
            release_url(&r.runtime.url)?;
            if r.runtime.size == 0 || r.runtime.size > MAX_RUNTIME_ZIP {
                return Err("runtime.size: нужен размер GitHub asset от 1 байта до 2 ГиБ".into());
            }
            space(stage, r.runtime.size.saturating_mul(4))?;
            let archive = stage.join("runtime.zip");
            let digest = stream(
                fetch(&r.runtime.url)?.take(r.runtime.size + 1),
                Some(&archive),
                r.runtime.size,
                &s,
            )?;
            if !r.runtime.sha256.is_empty() && r.runtime.sha256 != digest {
                return Err("runtime.sha256: скачанный asset отличается от GitHub/черновика; повторите анализ версии".into());
            }
            r.runtime.sha256 = digest.clone();
            let mut zip = zip::ZipArchive::new(open_read(&archive)?).map_err(err)?;
            if zip.is_empty() || zip.len() > MAX_RUNTIME_FILES {
                return Err("runtime.zip: превышен лимит записей".into());
            }
            let mut paths = Vec::new();
            for i in 0..zip.len() {
                let entry = zip.by_index(i).map_err(err)?;
                if !download::safe_zip_name(entry.name()) {
                    return Err(format!("runtime.zip.path: {}", entry.name()));
                }
                if !entry.is_dir() {
                    paths.push(entry.name().to_string());
                }
            }
            let first = paths
                .first()
                .and_then(|p| p.split('/').next())
                .ok_or("runtime.zip: пустой архив")?;
            let prefix = if paths.iter().all(|p| p.starts_with(&format!("{first}/"))) {
                Some(first.to_string())
            } else {
                None
            };
            r.runtime.strip_prefix = prefix.clone();
            let candidates: Vec<String> = paths
                .iter()
                .map(|p| prefix.as_ref().map_or(p.as_str(), |v| &p[v.len() + 1..]))
                .filter(|p| p.to_ascii_lowercase().ends_with(".exe"))
                .map(str::to_string)
                .collect();
            if candidates.is_empty() {
                return Err(
                    "runtime.launch.executable: в ZIP нет EXE; выберите Windows ZIP".into(),
                );
            }
            r.launch.executable = candidates[0].clone();
            // Reuse full native safe extraction, size/hash and compression limits, even for inspection.
            let files = install_runtime(&r, stage, &s, &|_| Ok(Box::new(open_read(&archive)?)))?;
            let mut executables = Vec::new();
            let mut imports = Vec::new();
            for candidate in candidates {
                if pe_x64(&stage.join(RUNTIME_DIR).join(&candidate)).is_ok() {
                    imports.push(
                        match import_names(&stage.join(RUNTIME_DIR).join(&candidate)) {
                            Ok(dlls) => json!({"executable":candidate,"dlls":dlls}),
                            Err(warning) => json!({"executable":candidate,"warning":warning}),
                        },
                    );
                    executables.push(candidate);
                }
            }
            if executables.is_empty() {
                return Err("runtime.launch.executable: не найден Windows x64 PE".into());
            }
            raw["runtime"]["sha256"] = json!(digest);
            if let Some(prefix) = prefix {
                raw["runtime"]["stripPrefix"] = json!(prefix);
            } else {
                raw["runtime"]
                    .as_object_mut()
                    .unwrap()
                    .remove("stripPrefix");
            }
            if executables.len() == 1 {
                raw["launch"]["executable"] = json!(executables[0]);
            } else if !executables
                .iter()
                .any(|exe| raw["launch"]["executable"].as_str() == Some(exe.as_str()))
            {
                raw["launch"]["executable"] = json!("");
            }
            if raw["setup"].is_object() {
                raw["setup"]["executable"] = raw["launch"]["executable"].clone();
            }
            Ok(
                json!({"recipe":raw,"archive":archive,"files":files,"executables":executables,"imports":imports,"dependencies":dependency_names(stage)?,"verified":false}),
            )
        }
        "sources" => {
            let source = q
                .source
                .as_ref()
                .ok_or("source: выберите ISO или подготовленную папку")?;
            let mut r: Recipe = serde_json::from_value(raw.clone()).map_err(err)?;
            let mut observations = Vec::new();
            if r.source.kind == SourceKind::Xbox360Iso {
                safe(source)?;
                let mut f = open_read(source)?;
                let entries = crate::install::skate3::xdvdfs(&mut f, &s)?;
                let xex = entries
                    .iter()
                    .find(|e| e.path.eq_ignore_ascii_case("default.xex"))
                    .ok_or("source.default.xex: отсутствует в XDVDFS")?;
                let id = crate::install::skate3::xex_identity(&mut f, xex.offset, xex.size)?;
                fill_identity(&mut raw["source"], "titleId", id.title_id)?;
                // A measured base Media ID is not a documented compatibility constraint on a TU.
                // Keep explicit constraints, but never invent an equality requirement from observation.
                if raw["source"]["mediaId"]
                    .as_str()
                    .is_some_and(|v| !v.is_empty())
                {
                    fill_identity(&mut raw["source"], "mediaId", id.media_id)?;
                }
                observations.push(json!({"role":"baseGame","titleId":format!("{:08X}",id.title_id),"mediaId":format!("{:08X}",id.media_id),"version":format!("{:08X}",id.version)}));
                r = serde_json::from_value(raw.clone()).map_err(err)?;
            }
            let base = inspect_source(&r, source, &s)?;
            if r.source.kind == SourceKind::Folder && r.source.required_files.is_empty() {
                if let Inventory::Folder(_, entries) = &base {
                    let required: Vec<_> = entries
                        .iter()
                        .filter(|e| e.size > 0)
                        .map(|e| e.path.clone())
                        .collect();
                    if required.is_empty() || required.len() > 64 {
                        return Err("source.requiredFiles: наблюдаемый набор содержит 0 или более 64 непустых файлов. Укажите обязательные файлы по инструкции upstream; их назначение нельзя надёжно угадать.".into());
                    }
                    raw["source"]["requiredFiles"] = json!(required);
                }
            }
            for (index, slot) in r.sources.iter().enumerate() {
                if let Some(paths) = q.sources.get(&slot.role) {
                    for path in paths {
                        if slot.source.kind == SourceKind::Xbox360Content {
                            safe(Path::new(path))?;
                            let mut f = open_read(Path::new(path))?;
                            let size = f.metadata().map_err(err)?.len();
                            let mut h = [0u8; 0x3b9];
                            f.read_exact(&mut h).map_err(err)?;
                            check_content_header(
                                &h,
                                size,
                                if slot.role == "titleUpdate" {
                                    0xb0000
                                } else {
                                    2
                                },
                            )?;
                            observations.push(json!({"role":slot.role,"titleId":format!("{:08X}",u32::from_be_bytes(h[0x360..0x364].try_into().unwrap())),"mediaId":format!("{:08X}",u32::from_be_bytes(h[0x354..0x358].try_into().unwrap())),"version":format!("{:08X}",u32::from_be_bytes(h[0x358..0x35c].try_into().unwrap()))}));
                            for (key, off) in
                                [("titleId", 0x360), ("mediaId", 0x354), ("version", 0x358)]
                            {
                                if slot.repeatable
                                    && key != "titleId"
                                    && raw["sources"][index]["source"][key].is_null()
                                {
                                    continue;
                                }
                                fill_identity(
                                    &mut raw["sources"][index]["source"],
                                    key,
                                    u32::from_be_bytes(h[off..off + 4].try_into().unwrap()),
                                )?;
                            }
                        }
                    }
                }
            }
            let r: Recipe = serde_json::from_value(raw.clone()).map_err(err)?;
            validate_sources_for_trial(&r)?;
            inspect_sources(&r, &q.sources, &s)?;
            Ok(
                json!({"recipe":raw,"bytes":base.bytes(),"source":source,"sources":q.sources,"observations":observations,"verified":false}),
            )
        }
        "trial" => {
            if !q.consent {
                return Err(
                    "setup: требуется отдельное согласие на запуск upstream-мастера".into(),
                );
            }
            let r: Recipe = serde_json::from_value(raw.clone()).map_err(err)?;
            let r = trial_recipe(&r);
            validate(&r)?;
            let setup = r
                .setup
                .as_ref()
                .ok_or("setup: прямому импорту не нужен пробный мастер")?;
            let source = q.source.as_ref().ok_or("source: выберите исходные файлы")?;
            preflight(&r, source, &q.sources, stage, true, &s)?;
            let archive = q
                .archive
                .as_ref()
                .ok_or("runtime: сначала скачайте и проверьте ZIP")?;
            safe(archive)?;
            let mut base = inspect_source(&r, source, &s)?;
            let mut extra = inspect_sources(&r, &q.sources, &s)?;
            let mut files = install_runtime(&r, stage, &s, &|_| Ok(Box::new(open_read(archive)?)))?;
            files.extend(import_source(&mut base, stage, &s)?);
            for (target, inv) in &mut extra {
                files.extend(import_extra(inv, stage, target, &s)?);
            }
            fs::create_dir(stage.join(USER_DIR)).map_err(err)?;
            write_new(
                &stage.join("user-data/.port-setup-started"),
                b"owner trial: retain entire folder",
            )?;
            let known: HashSet<_> = files.iter().map(|e| e.path.clone()).collect();
            let originals = files.clone();
            let result = (|| {
                run_setup_process(&r, setup, stage, &files, &s)?;
                let mut measurement = setup.clone();
                measurement.results.clear();
                let outputs = verify_setup(&measurement, stage, files, &s)?;
                let candidates: Vec<_> = outputs
                    .into_iter()
                    .filter(|e| !known.contains(&e.path))
                    .collect();
                if candidates.is_empty() {
                    return Err("setup.results: мастер не создал новых runtime-файлов. Успешный выход не доказывает установку; staging сохранён".into());
                }
                let suggestions = suggest_results(&r, stage, &originals, &candidates);
                Ok(
                    json!({"recipe":raw,"candidates":candidates,"suggestions":suggestions,"stage":stage,"verified":false,"warning":"Хеши измерены автоматически. Предложенные эталоны основаны на копии base-файла и изменённом XEX с execution identity TU. Это не проверка алгоритма патчинга: подтвердите применение обновления по upstream. При неоднозначности эталон не выбирается."}),
                )
            })();
            result.map_err(|e: String| {
                format!(
                    "{e}. Пробная папка полностью сохранена: {}",
                    stage.display()
                )
            })
        }
        _ => Err("owner.action: неизвестная операция".into()),
    }
}

fn fill_identity(object: &mut Value, key: &str, actual: u32) -> Result<()> {
    let text = format!("{actual:08X}");
    if let Some(old) = object[key].as_str().filter(|s| !s.is_empty()) {
        if !old.eq_ignore_ascii_case(&text) {
            return Err(format!("source.{key}: найдено {text}, в рецепте {old}. Выберите совместимый источник или отдельно пересмотрите требование."));
        }
    }
    object[key] = json!(text);
    Ok(())
}
fn trial_recipe(r: &Recipe) -> Recipe {
    let mut r = r.clone();
    if let Some(setup) = &mut r.setup {
        // Internal placeholders validate the operation, never become evidence or a saved recipe.
        setup.results = vec![OutputPin {
            path: "runtime/.port-owner-base-reference".into(),
            size: 1,
            sha256: "0".repeat(64),
            source_role: None,
            source_index: None,
        }];
        for slot in &r.sources {
            if slot.operation == "upstream-setup" {
                for i in 0..if slot.repeatable { 16 } else { 1 } {
                    setup.results.push(OutputPin {
                        path: format!("runtime/.port-owner-{}-{i}", slot.role),
                        size: 1,
                        sha256: "0".repeat(64),
                        source_role: Some(slot.role.clone()),
                        source_index: Some(i),
                    });
                }
            }
        }
    }
    r
}
fn validate_sources_for_trial(r: &Recipe) -> Result<()> {
    validate_sources(&trial_recipe(r))
}
fn pe_x64(path: &Path) -> Result<()> {
    let mut f = open_read(path)?;
    let size = f.metadata().map_err(err)?.len();
    let mut dos = [0u8; 64];
    f.read_exact(&mut dos).map_err(err)?;
    let offset = u32::from_le_bytes(dos[60..64].try_into().unwrap()) as u64;
    if &dos[..2] != b"MZ" || offset < 64 || offset + 24 > size {
        return Err("PE header: повреждён".into());
    }
    f.seek(SeekFrom::Start(offset)).map_err(err)?;
    let mut pe = [0u8; 24];
    f.read_exact(&mut pe).map_err(err)?;
    if &pe[..4] != b"PE\0\0" || u16::from_le_bytes([pe[4], pe[5]]) != 0x8664 {
        return Err("PE.machine: нужен Windows x64".into());
    }
    Ok(())
}
fn dependency_names(stage: &Path) -> Result<Vec<String>> {
    // Observe shipped DLLs; do not pretend that filenames establish system requirements.
    Ok(scan(&stage.join(RUNTIME_DIR), &Arc::default())?
        .into_iter()
        .filter(|e| e.path.to_ascii_lowercase().ends_with(".dll"))
        .map(|e| e.path)
        .collect())
}

fn import_names(path: &Path) -> Result<Vec<String>> {
    let mut f = open_read(path)?;
    let size = f.metadata().map_err(err)?.len();
    fn at(f: &mut File, size: u64, offset: u64, n: usize) -> Result<Vec<u8>> {
        if offset.checked_add(n as u64).is_none_or(|v| v > size) {
            return Err("PE imports: диапазон за концом файла".into());
        }
        f.seek(SeekFrom::Start(offset)).map_err(err)?;
        let mut b = vec![0; n];
        f.read_exact(&mut b).map_err(err)?;
        Ok(b)
    }
    let dos = at(&mut f, size, 0, 64)?;
    let pe_offset = u32::from_le_bytes(dos[60..64].try_into().unwrap()) as u64;
    let pe = at(&mut f, size, pe_offset, 24)?;
    let count = u16::from_le_bytes(pe[6..8].try_into().unwrap()) as usize;
    let optional = u16::from_le_bytes(pe[20..22].try_into().unwrap()) as usize;
    if count == 0 || count > 96 || !(128..=4096).contains(&optional) {
        return Err(
            "PE imports: неподдерживаемая таблица секций/optional header; зависимости неизвестны"
                .into(),
        );
    }
    let header = at(&mut f, size, pe_offset + 24, optional)?;
    if u16::from_le_bytes(header[..2].try_into().unwrap()) != 0x20b {
        return Err("PE imports: нужен PE32+ optional header".into());
    }
    let le = |b: &[u8], p| u32::from_le_bytes(b[p..p + 4].try_into().unwrap());
    let rva = le(&header, 120);
    let length = le(&header, 124);
    if rva == 0 && length == 0 {
        return Ok(Vec::new());
    }
    if !(20..=65536).contains(&length) {
        return Err("PE imports: недопустимый размер directory".into());
    }
    let sections = at(&mut f, size, pe_offset + 24 + optional as u64, count * 40)?;
    let physical = |address: u32, n: usize| -> Result<u64> {
        for section in sections.as_chunks::<40>().0 {
            let start = le(section, 12);
            let raw_size = le(section, 16);
            if let Some(delta) = address.checked_sub(start) {
                if (delta as u64) + (n as u64) <= raw_size as u64 {
                    return Ok(le(section, 20) as u64 + delta as u64);
                }
            }
        }
        Err("PE imports: RVA не принадлежит данным секций".into())
    };
    let descriptors = at(
        &mut f,
        size,
        physical(rva, length as usize)?,
        length as usize,
    )?;
    let mut names = Vec::new();
    let mut ended = false;
    for desc in descriptors.as_chunks::<20>().0 {
        if desc.iter().all(|v| *v == 0) {
            ended = true;
            break;
        }
        let name_rva = le(desc, 12);
        let mut bytes = Vec::new();
        let mut terminated = false;
        for i in 0..260 {
            let address = name_rva
                .checked_add(i)
                .ok_or("PE imports: переполнение RVA")?;
            let b = at(&mut f, size, physical(address, 1)?, 1)?[0];
            if b == 0 {
                terminated = true;
                break;
            }
            if !b.is_ascii_alphanumeric() && !b"._-".contains(&b) {
                return Err("PE imports: недопустимое имя DLL".into());
            }
            bytes.push(b);
        }
        if !terminated || bytes.is_empty() {
            return Err("PE imports: имя DLL не завершено".into());
        }
        names.push(String::from_utf8(bytes).map_err(err)?);
    }
    if !ended {
        return Err("PE imports: directory не завершён".into());
    }
    names.sort();
    names.dedup();
    Ok(names)
}

fn suggest_results(r: &Recipe, stage: &Path, originals: &[Entry], candidates: &[Entry]) -> Value {
    let mut chosen = serde_json::Map::new();
    let supplemental: Vec<_> = r
        .sources
        .iter()
        .map(|s| format!("game/{}/", s.target))
        .collect();
    if let Some(copy) = candidates.iter().find(|c| {
        c.size > 0
            && c.path != "runtime/port-recipe.json"
            && originals.iter().any(|o| {
                o.path.starts_with("game/")
                    && !supplemental.iter().any(|p| o.path.starts_with(p))
                    && o.size == c.size
                    && o.sha256 == c.sha256
            })
    }) {
        chosen.insert(copy.path.clone(),json!({"role":"base","reason":"Полные байты совпадают с проверенной копией основного источника"}));
    }
    if let Some(tu) = r
        .sources
        .iter()
        .find(|s| s.role == "titleUpdate" && s.source.kind == SourceKind::Xbox360Content)
    {
        if let (Some(title), Some(media), Some(version)) =
            (&tu.source.title_id, &tu.source.media_id, &tu.source.version)
        {
            let matches: Vec<_> = candidates
                .iter()
                .filter(|c| {
                    let identity = (|| {
                        let mut f = open_read(&stage.join(&c.path))?;
                        crate::install::skate3::xex_identity(&mut f, 0, c.size)
                    })();
                    identity.is_ok_and(|id| {
                        format!("{:08X}", id.title_id).eq_ignore_ascii_case(title)
                            && format!("{:08X}", id.media_id).eq_ignore_ascii_case(media)
                            && format!("{:08X}", id.version).eq_ignore_ascii_case(version)
                    }) && !originals.iter().any(|o| o.sha256 == c.sha256)
                })
                .collect();
            if matches.len() == 1 && !chosen.contains_key(&matches[0].path) {
                chosen.insert(matches[0].path.clone(),json!({"role":"titleUpdate:0","reason":"Новый изменённый XEX; Title/Media/Version совпали с TU. Требуется подтверждение успешного патчинга upstream"}));
            }
        }
    }
    Value::Object(chosen)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    fn recipe() -> Value {
        json!({"schemaVersion":1,"id":"owner-demo","collectionId":"owner-demo","title":"Synthetic owner test","source":{"kind":"folder","requiredFiles":[]},"runtime":{"url":"https://github.com/example/demo/releases/download/v1/demo.zip","size":1,"sha256":""},"launch":{"executable":"","workingDir":"runtimeDir","arguments":[]}})
    }
    fn request(action: &str, recipe: Value, workspace: PathBuf) -> Request {
        Request {
            action: action.into(),
            recipe,
            workspace,
            source: None,
            sources: Selections::new(),
            archive: None,
            consent: false,
        }
    }
    fn archive() -> Vec<u8> {
        let mut pe = vec![0u8; 256];
        pe[..2].copy_from_slice(b"MZ");
        pe[60..64].copy_from_slice(&64u32.to_le_bytes());
        pe[64..68].copy_from_slice(b"PE\0\0");
        pe[68..70].copy_from_slice(&0x8664u16.to_le_bytes());
        let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
        w.start_file("demo/demo.exe", zip::write::SimpleFileOptions::default())
            .unwrap();
        w.write_all(&pe).unwrap();
        w.finish().unwrap().into_inner()
    }
    #[test]
    fn owner_runtime_measures_extracts_and_never_claims_verification() {
        let t = tempfile::tempdir().unwrap();
        let bytes = archive();
        let mut raw = recipe();
        raw["runtime"]["size"] = json!(bytes.len());
        let mut q = request("runtime", raw.clone(), t.path().join("no-consent"));
        assert!(perform(q, &|_| panic!("no consent must not download"))
            .unwrap_err()
            .contains("согласие"));
        q = request("runtime", raw.clone(), t.path().join("inspect"));
        q.consent = true;
        let result = perform(q, &|_| Ok(Box::new(Cursor::new(bytes.clone())))).unwrap();
        assert_eq!(
            result["recipe"]["runtime"]["sha256"],
            format!("{:x}", Sha256::digest(&bytes))
        );
        assert_eq!(result["executables"], json!(["demo.exe"]));
        assert_eq!(result["verified"], false);
        assert!(t.path().join("inspect/runtime/demo.exe").exists());
        assert!(!t.path().join("inspect/user-data").exists());
        raw["runtime"]["sha256"] = json!("f".repeat(64));
        let mut q = request("runtime", raw, t.path().join("wrong"));
        q.consent = true;
        assert!(perform(q, &|_| Ok(Box::new(Cursor::new(bytes.clone()))))
            .unwrap_err()
            .contains("runtime.sha256"));
    }
    #[test]
    fn owner_folder_fills_observed_structure_without_upload_or_write() {
        let t = tempfile::tempdir().unwrap();
        let source = t.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("main.dat"), b"source").unwrap();
        let mut q = request("sources", recipe(), t.path().join("inspection"));
        q.source = Some(source.clone());
        let result = perform(q, &|_| panic!("source inspection must not download")).unwrap();
        assert_eq!(
            result["recipe"]["source"]["requiredFiles"],
            json!(["main.dat"])
        );
        assert_eq!(result["verified"], false);
        assert_eq!(fs::read(source.join("main.dat")).unwrap(), b"source");
        let mut object = json!({"titleId":"AAAAAAAA"});
        assert!(fill_identity(&mut object, "titleId", 0xbbbbbbbb)
            .unwrap_err()
            .contains("titleId"));
        assert_eq!(object["titleId"], "AAAAAAAA");
    }
    #[test]
    fn owner_output_proposal_does_not_attribute_opaque_or_arbitrary_files_to_tu() {
        let t = tempfile::tempdir().unwrap();
        let r: Recipe = serde_json::from_value(recipe()).unwrap();
        let original = Entry {
            path: "game/data.bin".into(),
            size: 4,
            sha256: "a".repeat(64),
        };
        let copied = Entry {
            path: "runtime/data.bin".into(),
            ..original.clone()
        };
        let arbitrary = Entry {
            path: "runtime/marker".into(),
            size: 3,
            sha256: "b".repeat(64),
        };
        let result = suggest_results(&r, t.path(), &[original], &[copied, arbitrary]);
        assert_eq!(result["runtime/data.bin"]["role"], "base");
        assert!(result["runtime/marker"].is_null());
    }
    #[test]
    fn pe_static_imports_are_bounded_and_report_actual_dll_names() {
        let t = tempfile::tempdir().unwrap();
        let path = t.path().join("demo.exe");
        let mut pe = vec![0u8; 1024];
        pe[..2].copy_from_slice(b"MZ");
        pe[60..64].copy_from_slice(&64u32.to_le_bytes());
        pe[64..68].copy_from_slice(b"PE\0\0");
        pe[68..70].copy_from_slice(&0x8664u16.to_le_bytes());
        pe[70..72].copy_from_slice(&1u16.to_le_bytes());
        pe[84..86].copy_from_slice(&240u16.to_le_bytes());
        pe[88..90].copy_from_slice(&0x20bu16.to_le_bytes());
        for (p, v) in [
            (208, 0x1000u32),
            (212, 40),
            (340, 0x1000),
            (344, 512),
            (348, 512),
            (524, 0x1040),
        ] {
            pe[p..p + 4].copy_from_slice(&v.to_le_bytes());
        }
        pe[576..589].copy_from_slice(b"KERNEL32.dll\0");
        fs::write(&path, &pe).unwrap();
        assert_eq!(import_names(&path).unwrap(), vec!["KERNEL32.dll"]);
        pe[208..212].copy_from_slice(&0xffff0000u32.to_le_bytes());
        fs::write(&path, &pe).unwrap();
        assert!(import_names(&path).unwrap_err().contains("RVA"));
        fs::write(&path, b"MZ").unwrap();
        assert!(import_names(&path).is_err());
    }
    #[test]
    fn tu_proposal_needs_unique_changed_xex_with_matching_identity() {
        let t = tempfile::tempdir().unwrap();
        fs::create_dir(t.path().join("runtime")).unwrap();
        let mut raw = recipe();
        raw["sources"] = json!([{"role":"titleUpdate","required":true,"repeatable":false,"target":"tu","operation":"upstream-setup","source":{"kind":"xbox360-content","titleId":"1234ABCD","mediaId":"11223344","version":"00000003","requiredFiles":[]}}]);
        let r: Recipe = serde_json::from_value(raw).unwrap();
        let mut xex = vec![0u8; 128];
        xex[..4].copy_from_slice(b"XEX2");
        for (p, v) in [
            (20, 1u32),
            (24, 0x40006),
            (28, 64),
            (64, 0x11223344),
            (68, 3),
            (76, 0x1234abcd),
        ] {
            xex[p..p + 4].copy_from_slice(&v.to_be_bytes());
        }
        fs::write(t.path().join("runtime/patched.xex"), &xex).unwrap();
        let candidate = Entry {
            path: "runtime/patched.xex".into(),
            size: xex.len() as u64,
            sha256: format!("{:x}", Sha256::digest(&xex)),
        };
        let original = Entry {
            path: "game/default.xex".into(),
            size: 128,
            sha256: "f".repeat(64),
        };
        let result = suggest_results(
            &r,
            t.path(),
            std::slice::from_ref(&original),
            std::slice::from_ref(&candidate),
        );
        assert_eq!(result[&candidate.path]["role"], "titleUpdate:0");
        let already = Entry {
            sha256: candidate.sha256.clone(),
            ..original.clone()
        };
        assert_eq!(
            suggest_results(&r, t.path(), &[already], std::slice::from_ref(&candidate))
                [&candidate.path]["role"],
            "base"
        );
        let other = Entry {
            path: "runtime/other.xex".into(),
            ..candidate.clone()
        };
        fs::write(t.path().join(&other.path), &xex).unwrap();
        assert!(suggest_results(
            &r,
            t.path(),
            std::slice::from_ref(&original),
            &[candidate.clone(), other]
        )[&candidate.path]
            .is_null());
        xex[71] = 2;
        fs::write(t.path().join(&candidate.path), &xex).unwrap();
        assert!(
            suggest_results(&r, t.path(), &[original], std::slice::from_ref(&candidate))
                [&candidate.path]
                .is_null()
        );
    }
    #[test]
    #[ignore = "explicit synthetic Windows process; PORT_RECIPE_SETUP_FIXTURE required"]
    fn owner_trial_real_process_and_preservation() {
        let exe =
            fs::read(std::env::var_os("PORT_RECIPE_SETUP_FIXTURE").expect("fixture path")).unwrap();
        let t = tempfile::tempdir().unwrap();
        let source = t.path().join("source");
        let tu = t.path().join("tu");
        fs::create_dir_all(source.join("data")).unwrap();
        fs::create_dir(&tu).unwrap();
        fs::write(source.join("data/main.bin"), b"base").unwrap();
        fs::write(tu.join("patch.bin"), b"prepared").unwrap();
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("demo.exe", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&exe).unwrap();
        let bytes = zip.finish().unwrap().into_inner();
        let archive = t.path().join("archive.zip");
        fs::write(&archive, &bytes).unwrap();
        let mut raw = recipe();
        raw["schemaVersion"] = json!(2);
        raw["source"]["requiredFiles"] = json!(["data/main.bin"]);
        raw["runtime"]["size"] = json!(bytes.len());
        raw["runtime"]["sha256"] = json!(format!("{:x}", Sha256::digest(&bytes)));
        raw["launch"]["executable"] = json!("demo.exe");
        raw["sources"] = json!([{"role":"titleUpdate","required":true,"repeatable":false,"target":"tu","operation":"upstream-setup","source":{"kind":"folder","requiredFiles":["patch.bin"]}}]);
        raw["setup"] =
            json!({"executable":"demo.exe","workingDir":"runtimeDir","arguments":[],"results":[]});
        for (name, args, success) in [
            ("success", json!([]), true),
            ("fail", json!([{"flag":"--fail"}]), false),
        ] {
            let mut raw = raw.clone();
            raw["setup"]["arguments"] = args;
            let mut q = request("trial", raw, t.path().join(name));
            q.source = Some(source.clone());
            q.sources
                .insert("titleUpdate".into(), vec![tu.display().to_string()]);
            q.archive = Some(archive.clone());
            q.consent = true;
            let result = perform(q, &|_| panic!("cached runtime only"));
            assert_eq!(result.is_ok(), success, "{result:?}");
            if let Ok(value) = result {
                assert_eq!(value["verified"], false);
                assert!(value["candidates"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|p| p["path"] == "runtime/output.bin"));
            }
            assert_eq!(
                fs::read(t.path().join(name).join("user-data/save")).unwrap(),
                b"synthetic progress"
            );
        }
        assert_eq!(fs::read(source.join("data/main.bin")).unwrap(), b"base");
    }
}
