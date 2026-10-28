//! Schema 2 extends the existing baseGame contract with non-overlapping additional inputs.
use super::*;
use std::collections::BTreeMap;

pub type Selections = BTreeMap<String, Vec<String>>;
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceSlot {
    pub role: String,
    pub required: bool,
    pub repeatable: bool,
    pub target: String,
    pub operation: String,
    pub source: Source,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Setup {
    pub executable: String,
    #[serde(default)]
    pub arguments: Vec<Argument>,
    pub working_dir: Placeholder,
    pub results: Vec<OutputPin>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputPin {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    pub source_role: Option<String>,
    pub source_index: Option<usize>,
}
pub(super) fn validate_sources(r: &Recipe) -> Result<()> {
    if r.schema_version == 1 && (!r.sources.is_empty() || r.setup.is_some()) {
        return Err("Несколько источников / мастер требуют schemaVersion 2".into());
    }
    if r.sources.len() > 2 {
        return Err("Разрешены роли titleUpdate и dlc; baseGame задаётся source".into());
    }
    let mut roles = HashSet::new();
    let mut targets: Vec<String> = Vec::new();
    for slot in &r.sources {
        if !matches!(slot.role.as_str(), "titleUpdate" | "dlc")
            || !roles.insert(&slot.role)
            || (slot.repeatable && slot.role != "dlc")
            || (slot.role == "dlc" && slot.required)
        {
            return Err("Некорректная роль / повторяемость источника".into());
        }
        relative(&slot.target)?;
        let target = slot.target.to_lowercase();
        if targets.iter().any(|p| {
            p == &target
                || p.starts_with(&format!("{target}/"))
                || target.starts_with(&format!("{p}/"))
        }) {
            return Err("Целевые папки источников пересекаются".into());
        }
        targets.push(target);
        if !matches!(slot.operation.as_str(), "copy-tree" | "upstream-setup")
            || (slot.operation == "upstream-setup" && r.setup.is_none())
        {
            return Err("Операция источника требует настроенного upstream setup".into());
        }
        let src = &slot.source;
        if src.kind == SourceKind::Xbox360Content {
            if slot.operation != "upstream-setup"
                || !src.required_files.is_empty()
                || !src.forbidden_files.is_empty()
                || !src.title_id.as_deref().is_some_and(|v| hex(v, 8))
                || src.media_id.as_deref().is_some_and(|v| !hex(v, 8))
                || src.version.as_deref().is_some_and(|v| !hex(v, 8))
            {
                return Err(
                    "Xbox content: нужен Title ID; внутренние файлы проверяет штатный мастер"
                        .into(),
                );
            }
            if let Some(h) = &src.sha256 {
                if !hex(h, 64) || h != &h.to_lowercase() {
                    return Err("Некорректный SHA-256 источника".into());
                }
            }
        } else {
            if src.kind != SourceKind::Folder {
                return Err("Дополнительный источник: folder либо xbox360-content".into());
            }
            // Reuse the schema-1 source validator, including unknown operations/arguments.
            let mut single = r.clone();
            single.schema_version = 1;
            single.sources.clear();
            single.setup = None;
            single.source = src.clone();
            validate(&single)?;
        }
        if let (Some(a), Some(b)) = (&r.source.title_id, &src.title_id) {
            if !a.eq_ignore_ascii_case(b) {
                return Err(format!("sources.{}.source.titleId: {b}, source.titleId: {a}. Выберите TU/DLC нужной игры или проверьте явные ограничения рецепта.",slot.role));
            }
        }
        if let (Some(a), Some(b)) = (&r.source.media_id, &src.media_id) {
            if !a.eq_ignore_ascii_case(b) {
                return Err(format!("sources.{}.source.mediaId: {b}, source.mediaId: {a}. Явные требования различаются; выберите совместимое издание. Измеренный ID не является доказательством совместимости.",slot.role));
            }
        }
    }
    if let Some(setup) = &r.setup {
        if setup.executable != r.launch.executable {
            return Err("Мастер должен быть точкой запуска проверенного runtime".into());
        }
        let mut single = r.clone();
        single.schema_version = 1;
        single.sources.clear();
        single.setup = None;
        single.launch = Launch {
            executable: setup.executable.clone(),
            arguments: setup.arguments.clone(),
            working_dir: setup.working_dir,
        };
        validate(&single)?;
        if setup.results.is_empty() || setup.results.len() > 64 {
            return Err("Нужны 1–64 проверенных результата мастера (размер + SHA-256)".into());
        }
        if !setup.results.iter().any(|pin| pin.source_role.is_none()) {
            return Err("Нужен основной результат мастера без sourceRole".into());
        }
        let mut paths = HashSet::new();
        for pin in &setup.results {
            relative(&pin.path)?;
            match (&pin.source_role, pin.source_index) {
                (None, None) => (),
                (Some(role), Some(index))
                    if r.sources.iter().any(|slot| {
                        &slot.role == role
                            && slot.operation == "upstream-setup"
                            && index < if slot.repeatable { 16 } else { 1 }
                    }) => {}
                _ => {
                    return Err(
                        "Результат с ролью требует допустимые sourceRole и sourceIndex".into(),
                    )
                }
            }
            if !pin.path.starts_with("runtime/")
                || pin.path == "runtime/port-recipe.json"
                || pin.size == 0
                || pin.size > MAX_BYTES
                || !hex(&pin.sha256, 64)
                || pin.sha256 != pin.sha256.to_lowercase()
                || !paths.insert(pin.path.to_lowercase())
            {
                return Err(
                    "Результат мастера: уникальный путь runtime/…, размер и SHA-256".into(),
                );
            }
        }
    }
    Ok(())
}

pub(super) enum ExtraInventory {
    Tree(Inventory),
    Content(File, u64, Option<String>),
}

// A bounded HEADER inspection only. STFS/SVOD trees, authentication and XEXP patching
// belong to the verified upstream installer, never guessed by this engine.
fn content(source: &Path, slot: &SourceSlot, s: &Arc<Mutex<Status>>) -> Result<ExtraInventory> {
    safe(source)?;
    package::regular_file(source)?;
    let mut f = open_read(source)?;
    let size = f.metadata().map_err(err)?.len();
    if !(0x1000..=32 * 1024 * 1024 * 1024).contains(&size) {
        return Err(format!("Xbox content.size: {size} байт; нужен полный контейнер от 4096 байт до 32 ГиБ. Выберите распакованный TU/DLC, а не ZIP или ярлык."));
    }
    let mut h = [0u8; 0x3b9];
    f.read_exact(&mut h).map_err(err)?;
    let be = |off: usize| u32::from_be_bytes(h[off..off + 4].try_into().unwrap());
    let title = be(0x360);
    let media = be(0x354);
    let version = be(0x358);
    let expected_type = if slot.role == "titleUpdate" {
        0xb0000
    } else {
        2
    };
    check_content_header(&h, size, expected_type)?;
    for (actual, wanted, label) in [
        (title, &slot.source.title_id, "Title ID"),
        (media, &slot.source.media_id, "Media ID"),
        (version, &slot.source.version, "Version"),
    ] {
        if let Some(w) = wanted {
            if actual != u32::from_str_radix(w, 16).map_err(err)? {
                return Err(format!("sources.{}.{label}: найдено {actual:08X}, требуется {w}. Выберите источник нужной версии/издания; имя файла не меняет его содержимое.", slot.role));
            }
        }
    }
    if let Some(h) = &slot.source.sha256 {
        f.seek(SeekFrom::Start(0)).map_err(err)?;
        if stream(&mut f, None, size, s)? != *h {
            return Err("SHA-256 Xbox content не совпал".into());
        }
    }
    f.seek(SeekFrom::Start(0)).map_err(err)?;
    Ok(ExtraInventory::Content(f, size, slot.source.sha256.clone()))
}

// Metadata version 0 is a legacy STFS layout, used by official LIVE title updates.
// This checks structure only; signatures, internal hashes and patch validity remain upstream gates.
pub(super) fn check_content_header(h: &[u8], size: u64, expected_type: u32) -> Result<()> {
    let fail = |field: &str, actual: String, wanted: &str| -> String {
        format!("Xbox content.{field}: {actual}; требуется {wanted}. Выберите полный исходный TU/DLC; переименование файла не исправляет формат.")
    };
    if h.len() < 0x3b9 {
        return Err(fail("header", h.len().to_string(), "не менее 953 байт"));
    }
    let be = |p| u32::from_be_bytes(h[p..p + 4].try_into().unwrap());
    if !matches!(&h[..4], b"CON " | b"LIVE" | b"PIRS") {
        return Err(fail(
            "magic",
            format!("{:02X?}", &h[..4]),
            "CON / LIVE / PIRS",
        ));
    }
    let header = be(0x340) as u64;
    if header < 0x3b9 || header > size {
        return Err(fail(
            "headerSize@0x340",
            format!("{header}, файл {size}"),
            "заголовок внутри файла",
        ));
    }
    if be(0x344) != expected_type {
        return Err(fail(
            "contentType@0x344",
            format!("{:08X}", be(0x344)),
            &format!("{expected_type:08X}"),
        ));
    }
    if !matches!(be(0x348), 0..=2) {
        return Err(fail(
            "metadataVersion@0x348",
            be(0x348).to_string(),
            "0, 1 или 2",
        ));
    }
    if be(0x3a9) != 0 {
        return Err(fail(
            "volumeType@0x3A9",
            be(0x3a9).to_string(),
            "STFS (0); SVOD не поддерживается",
        ));
    }
    if h[0x379] != 0x24 || h[0x37a] != 0 {
        return Err(fail(
            "volumeDescriptor@0x379",
            format!("{:02X?}", &h[0x379..0x37b]),
            "длина 0x24, версия 0",
        ));
    }
    let count = u16::from_le_bytes(h[0x37c..0x37e].try_into().unwrap()) as u64;
    let first = h[0x37e] as u64 | (h[0x37f] as u64) << 8 | (h[0x380] as u64) << 16;
    let total = be(0x395) as u64;
    let free = be(0x399) as u64;
    let mut block = first;
    for level in [170, 28900, 4913000] {
        block += (first + level) / level;
        if first < level {
            break;
        }
    }
    let table_end = header.div_ceil(4096) * 4096 + (block + 1) * 4096;
    if count == 0
        || total == 0
        || count > total
        || first >= total
        || free > total
        || total > size.saturating_sub(header.div_ceil(4096) * 4096) / 4096
        || table_end > size
    {
        return Err(fail("fileTable", format!("blocks={count}, first={first}, allocated={total}, free={free}, end={table_end}, file={size}"), "непустая таблица STFS в границах контейнера"));
    }
    Ok(())
}

#[cfg(test)]
mod header_tests {
    use super::*;
    fn legacy() -> Vec<u8> {
        let mut h = vec![0u8; 0x3b9];
        h[..4].copy_from_slice(b"LIVE");
        for (p, v) in [(0x340, 0xad0eu32), (0x344, 0xb0000), (0x395, 0x2f2)] {
            h[p..p + 4].copy_from_slice(&v.to_be_bytes());
        }
        h[0x379] = 0x24;
        h[0x37b] = 1;
        h[0x37c] = 1;
        h
    }
    #[test]
    fn legacy_live_metadata_zero_and_modern_layouts() {
        // Numeric layout observed read-only in the owner's TU. No commercial bytes in fixture.
        for magic in [b"LIVE", b"PIRS", b"CON "] {
            for version in 0..=2u32 {
                let mut h = legacy();
                h[..4].copy_from_slice(magic);
                h[0x348..0x34c].copy_from_slice(&version.to_be_bytes());
                assert!(check_content_header(&h, 3158016, 0xb0000).is_ok());
            }
        }
    }
    #[test]
    fn corrupted_legacy_is_rejected_with_field_and_remedy() {
        for (offset, value, field) in [
            (0, 0, "magic"),
            (0x340, 0xff, "headerSize"),
            (0x344, 0xff, "contentType"),
            (0x348, 0xff, "metadataVersion"),
            (0x3ac, 1, "volumeType"),
            (0x379, 0, "volumeDescriptor"),
            (0x37a, 1, "volumeDescriptor"),
            (0x37c, 0, "fileTable"),
            (0x380, 0xff, "fileTable"),
            (0x395, 0xff, "fileTable"),
        ] {
            let mut h = legacy();
            h[offset] = value;
            let e = check_content_header(&h, 3158016, 0xb0000).unwrap_err();
            assert!(e.contains(field), "{e}");
            assert!(e.contains("Выберите"));
        }
        assert!(check_content_header(&legacy(), 0xb000, 0xb0000).is_err());
        assert!(check_content_header(&legacy()[..4], 3158016, 0xb0000).is_err());
        assert!(check_content_header(&legacy(), 3158016, 2).is_err());
    }
}
pub(super) fn inspect_sources(
    r: &Recipe,
    selections: &Selections,
    s: &Arc<Mutex<Status>>,
) -> Result<Vec<(String, ExtraInventory)>> {
    if selections
        .keys()
        .any(|key| !r.sources.iter().any(|slot| &slot.role == key))
    {
        return Err("Неизвестная роль источника".into());
    }
    let mut out = Vec::new();
    for slot in &r.sources {
        let paths = selections.get(&slot.role).map(Vec::as_slice).unwrap_or(&[]);
        if (slot.required && paths.is_empty()) || paths.len() > if slot.repeatable { 16 } else { 1 }
        {
            return Err(format!("{}: неверное число источников", slot.role));
        }
        for (i, path) in paths.iter().enumerate() {
            let target = if slot.repeatable {
                format!("game/{}/{i}", slot.target)
            } else {
                format!("game/{}", slot.target)
            };
            let inv = if slot.source.kind == SourceKind::Xbox360Content {
                content(Path::new(path), slot, s)?
            } else {
                let mut single = r.clone();
                single.source = slot.source.clone();
                ExtraInventory::Tree(inspect_source(&single, Path::new(path), s)?)
            };
            out.push((target, inv));
        }
    }
    Ok(out)
}
pub(super) fn import_extra(
    inv: &mut ExtraInventory,
    stage: &Path,
    target: &str,
    s: &Arc<Mutex<Status>>,
) -> Result<Vec<Entry>> {
    match inv {
        ExtraInventory::Tree(tree) => import_into(tree, stage, target, s),
        ExtraInventory::Content(f, size, expected) => {
            let path = format!("{target}/source.container");
            let sha256 = stream(f, Some(&stage.join(&path)), *size, s)?;
            if expected.as_ref().is_some_and(|e| e != &sha256) {
                return Err("Источник изменился".into());
            }
            Ok(vec![Entry {
                path,
                size: *size,
                sha256,
            }])
        }
    }
}
pub(super) fn preflight(
    r: &Recipe,
    source: &Path,
    selections: &Selections,
    parent: &Path,
    consent: bool,
    s: &Arc<Mutex<Status>>,
) -> Result<()> {
    validate(r)?;
    check_dependencies(r)?;
    if r.setup.is_some() && !consent {
        return Err("Подтвердите запуск проверенного штатного мастера".into());
    }
    safe(parent)?;
    let parent = fs::canonicalize(parent).map_err(err)?;
    for path in std::iter::once(source).chain(selections.values().flatten().map(Path::new)) {
        safe(path)?;
        let p = fs::canonicalize(path).map_err(err)?;
        if parent.starts_with(&p) || p.starts_with(&parent) {
            return Err("Источники и назначение должны находиться отдельно".into());
        }
    }
    if let Some(setup) = &r.setup {
        for slot in &r.sources {
            if slot.operation == "upstream-setup" {
                for i in 0..selections.get(&slot.role).map_or(0, Vec::len) {
                    if !setup.results.iter().any(|pin| {
                        pin.source_role.as_ref() == Some(&slot.role) && pin.source_index == Some(i)
                    }) {
                        return Err(format!(
                            "Нет проверяемого результата мастера для {} #{}",
                            slot.role,
                            i + 1
                        ));
                    }
                }
            }
        }
    }
    let base = inspect_source(r, source, s)?;
    let extra = inspect_sources(r, selections, s)?;
    let total = extra.iter().try_fold(base.bytes(), |n, (_, inv)| {
        n.checked_add(match inv {
            ExtraInventory::Tree(i) => i.bytes(),
            ExtraInventory::Content(_, n, _) => *n,
        })
        .ok_or("Переполнение размера")
    })?;
    if total > MAX_BYTES {
        return Err("Суммарный размер источников превышает лимит".into());
    }
    // Setup output has no declared aggregate size: reserve source budget twice in addition to runtime.
    space(
        &parent,
        total
            .saturating_mul(if r.setup.is_some() { 2 } else { 1 })
            .saturating_add(r.runtime.size.saturating_mul(3)),
    )
}
#[tauri::command]
pub async fn inspect_recipe_sources(
    app: tauri::AppHandle,
    recipe_id: String,
    source: String,
    sources: Selections,
    parent: String,
    setup_consent: bool,
) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let raw = with_db(&app, |db| db.query_row("SELECT value FROM recipe_cache WHERE id=?1", [&recipe_id], |row| row.get::<_, String>(0)).optional().map_err(err)?.ok_or_else(|| "Рецепт не найден. Обновите каталог".to_string()))?;
        preflight(&parse(&raw)?, Path::new(&source), &sources, Path::new(&parent), setup_consent, &Arc::default())?;
        Ok("Предварительные проверки пройдены. Совместимость содержимого TU/DLC окончательно проверит штатный мастер; регион по заголовку не удостоверен.".into())
    }).await.map_err(err)?
}

pub(super) fn preserve_setup(stage: &Path, id: &str) -> Result<()> {
    if !stage.join("user-data/.port-setup-started").exists() {
        return Ok(());
    }
    safe(stage)?;
    if in_use(stage)? {
        return Err("Мастер ещё работает; staging сохранён".into());
    }
    let backup = stage
        .parent()
        .ok_or("Нет родителя staging")?
        .join(format!(".port-preserved-{id}"));
    if fs::symlink_metadata(&backup).is_ok() {
        return Err("Резерв staging уже существует; восстановление отложено".into());
    }
    fs::rename(stage, &backup).map_err(err)
}
pub(super) fn run_setup(
    r: &Recipe,
    setup: &Setup,
    stage: &Path,
    files: Vec<Entry>,
    selections: &Selections,
    s: &Arc<Mutex<Status>>,
) -> Result<Vec<Entry>> {
    let mut active_setup = setup.clone();
    active_setup.results.retain(|pin| {
        pin.source_role.as_ref().is_none_or(|role| {
            selections
                .get(role)
                .is_some_and(|paths| pin.source_index.is_some_and(|i| i < paths.len()))
        })
    });
    let setup = &active_setup;
    if setup
        .results
        .iter()
        .any(|pin| fs::symlink_metadata(stage.join(&pin.path)).is_ok())
    {
        return Err(
            "Результат мастера уже присутствует до запуска; нужен новый проверяемый файл".into(),
        );
    }
    write_new(
        &stage.join("user-data/.port-setup-started"),
        b"preserve entire staging on failure",
    )?;
    run_setup_process(r, setup, stage, &files, s)?;
    verify_setup(setup, stage, files, s)
}
pub(super) fn run_setup_process(
    r: &Recipe,
    setup: &Setup,
    stage: &Path,
    files: &[Entry],
    s: &Arc<Mutex<Status>>,
) -> Result<()> {
    let exe_path = format!("runtime/{}", setup.executable);
    let entry = files
        .iter()
        .find(|e| e.path == exe_path)
        .ok_or("EXE мастера не входит в проверенный ZIP")?;
    let mut pinned = open_read(&stage.join(&exe_path))?;
    if stream(&mut pinned, None, entry.size, s)? != entry.sha256 {
        return Err("EXE мастера изменён".into());
    }
    pinned.seek(SeekFrom::Start(0)).map_err(err)?;
    let mut dos = [0u8; 64];
    pinned.read_exact(&mut dos).map_err(err)?;
    let offset = u32::from_le_bytes(dos[60..64].try_into().unwrap()) as u64;
    if &dos[..2] != b"MZ"
        || offset < 64
        || offset.checked_add(24).is_none_or(|end| end > entry.size)
    {
        return Err("Некорректный Windows PE мастера".into());
    }
    pinned.seek(SeekFrom::Start(offset)).map_err(err)?;
    let mut pe = [0u8; 24];
    pinned.read_exact(&mut pe).map_err(err)?;
    if &pe[..4] != b"PE\0\0" || u16::from_le_bytes(pe[4..6].try_into().unwrap()) != 0x8664 {
        return Err("Мастер должен быть Windows x64 PE".into());
    }
    let mut setup_recipe = r.clone();
    setup_recipe.launch = Launch {
        executable: setup.executable.clone(),
        arguments: setup.arguments.clone(),
        working_dir: setup.working_dir,
    };
    phase(s, "setup", &format!("В штатном мастере выберите подготовленные источники из {}. Завершите мастер и закройте игру. PORT проверит результат; отмена сохранит staging.", stage.join(GAME_DIR).display()));
    let mut child = command(&setup_recipe, stage)?.spawn().map_err(err)?;
    let result = (|| {
        let _job = crate::install::skate3::SetupJob::attach(&child)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1800);
        loop {
            checkpoint(s)?;
            if let Some(exit) = child.try_wait().map_err(err)? {
                if !exit.success() {
                    return Err(format!("Штатный мастер завершился с ошибкой: {exit}"));
                }
                break;
            }
            if std::time::Instant::now() > deadline {
                return Err("Время мастера истекло; staging сохранён".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = child.kill();
        let _ = child.wait();
    }
    result
}
pub(super) fn verify_setup(
    setup: &Setup,
    stage: &Path,
    mut files: Vec<Entry>,
    s: &Arc<Mutex<Status>>,
) -> Result<Vec<Entry>> {
    // A zero exit code never substitutes for output verification. Original runtime/inputs cannot change.
    for e in &files {
        let p = stage.join(&e.path);
        safe(&p)?;
        package::regular_file(&p)?;
        if stream(open_read(&p)?, None, e.size, s)? != e.sha256 {
            return Err(format!("Мастер изменил исходный файл: {}", e.path));
        }
    }
    for pin in &setup.results {
        let p = stage.join(&pin.path);
        safe(&p).map_err(|e| format!("setup.results[{}].path: {e}", pin.path))?;
        package::regular_file(&p).map_err(|e|format!("setup.results[{}]: {e}. Завершите upstream-мастер с нужными исходными файлами; файл-маркер не заменяет ожидаемый результат.",pin.path))?;
        let file = open_read(&p)?;
        let actual = file.metadata().map_err(err)?.len();
        if actual != pin.size {
            return Err(format!("setup.results[{}].size: найдено {actual}, требуется {} байт. Проверьте версию источников и повторите мастер.",pin.path,pin.size));
        }
        if stream(file, None, pin.size, s)? != pin.sha256 {
            return Err(format!("setup.results[{}].sha256: результат отличается от проверенного эталона. Проверьте версию/издание TU и завершение патчинга; установка не зарегистрирована.", pin.path));
        }
    }
    if in_use(stage)? {
        return Err("Дочерний процесс мастера ещё работает; staging сохранён".into());
    }
    let known: HashSet<_> = files.iter().map(|e| e.path.to_lowercase()).collect();
    if setup
        .results
        .iter()
        .any(|pin| known.contains(&pin.path.to_lowercase()))
    {
        return Err(
            "Результат мастера должен быть новым файлом, отсутствующим в runtime ZIP".into(),
        );
    }
    for e in scan(stage, s)? {
        if !known.contains(&e.path.to_lowercase())
            && !e.path.starts_with("runtime/")
            && !e.path.starts_with("user-data/")
            && e.path != "user-data/.port-setup-started"
            && e.path != "port-owner"
        {
            return Err(format!(
                "Мастер создал файл вне разрешённых папок: {}",
                e.path
            ));
        }
    }
    for mut e in scan(&stage.join(RUNTIME_DIR), s)? {
        e.path = format!("runtime/{}", e.path);
        if !known.contains(&e.path.to_lowercase()) {
            e.sha256 = stream(open_read(&stage.join(&e.path))?, None, e.size, s)?;
            files.push(e);
        }
    }
    Ok(files)
}
