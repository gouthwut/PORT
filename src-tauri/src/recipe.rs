//! Stage 10 universal installation engine (part 1): declarative, strictly validated recipes.
//! A recipe CONFIGURES compiled operations; it never carries scripts, shell commands or
//! free-form arguments. Everything coming from the catalog is re-validated here.
use super::*;
use serde::Deserialize;
use serde_json::Value;
#[path = "recipe_owner.rs"]
pub mod owner;
#[path = "recipe_sources.rs"]
pub mod sources;
use sources::*;

pub const RECIPE_SCHEMA: u32 = 1;
const MAX_RUNTIME_ZIP: u64 = 2 * 1024 * 1024 * 1024;
const MAX_RUNTIME_ENTRY: u64 = 1024 * 1024 * 1024;
const MAX_RUNTIME_FILES: usize = 20_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Recipe {
    pub schema_version: u32,
    pub id: String,
    pub collection_id: String,
    pub title: String,
    pub source: Source,
    #[serde(default)]
    pub sources: Vec<SourceSlot>,
    pub setup: Option<Setup>,
    pub runtime: Runtime,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    pub launch: Launch,
}
#[derive(Debug, Clone, Copy, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceKind {
    Xbox360Iso,
    Folder,
    Xbox360Content,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub kind: SourceKind,
    /// XEX execution title ID (8 hex digits); ISO only.
    pub title_id: Option<String>,
    pub media_id: Option<String>,
    pub version: Option<String>,
    pub sha256: Option<String>,
    /// Paths relative to the source root that must exist and be non-empty.
    pub required_files: Vec<String>,
    /// Paths that must NOT be present (e.g. pre-patched dumps).
    #[serde(default)]
    pub forbidden_files: Vec<String>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Runtime {
    /// https://github.com/{owner}/{repo}/releases/download/{tag}/{asset}.zip only.
    pub url: String,
    pub size: u64,
    pub sha256: String,
    /// Optional single top-level folder inside the ZIP to strip.
    pub strip_prefix: Option<String>,
}
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Dependency {
    /// 64-bit Windows; checked on the running system.
    WindowsX64,
    /// Vulkan loader provided by the GPU driver; checked, never installed by PORT.
    VulkanLoader,
}
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::enum_variant_names)] // Serialized schema-1 names remain stable.
pub enum Placeholder {
    GameDir,
    UserDir,
    RuntimeDir,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Argument {
    pub flag: String,
    pub value: Option<Placeholder>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Launch {
    /// Executable path relative to the runtime folder.
    pub executable: String,
    #[serde(default)]
    pub arguments: Vec<Argument>,
    pub working_dir: Placeholder,
}

pub const GAME_DIR: &str = "game";
pub const RUNTIME_DIR: &str = "runtime";
pub const USER_DIR: &str = "user-data";

pub(crate) fn id_like(s: &str) -> bool {
    (1..=80).contains(&s.len())
        && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn hex(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| b.is_ascii_hexdigit())
}
fn release_url(raw: &str) -> Result<()> {
    let u = reqwest::Url::parse(raw).map_err(|_| "Некорректный URL релиза")?;
    let segs: Vec<_> = u.path_segments().map(|p| p.collect()).unwrap_or_default();
    if u.scheme() != "https"
        || u.host_str() != Some("github.com")
        || u.port().is_some()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || raw.len() > 512
        || segs.len() != 6
        || segs[2] != "releases"
        || segs[3] != "download"
        || !segs.iter().all(|s| {
            !s.is_empty()
                && *s != "."
                && *s != ".."
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._-+".contains(&b))
        })
        || !segs[5].to_ascii_lowercase().ends_with(".zip")
    {
        return Err("Runtime должен быть ZIP-ассетом GitHub Release (https://github.com/owner/repo/releases/download/tag/file.zip)".into());
    }
    Ok(())
}

/// Fail-closed validation; returns a typed recipe or a user-readable reason.
pub fn parse(raw: &str) -> Result<Recipe> {
    if raw.len() > 64 * 1024 {
        return Err("Рецепт превышает 64 КиБ".into());
    }
    let r: Recipe = serde_json::from_str(raw)
        .map_err(|e| format!("Неподдерживаемый сценарий установки: {e}"))?;
    validate(&r)?;
    Ok(r)
}
pub fn validate(r: &Recipe) -> Result<()> {
    if r.schema_version != RECIPE_SCHEMA && r.schema_version != 2 {
        return Err("Неподдерживаемая версия схемы рецепта".into());
    }
    if !id_like(&r.id) || !id_like(&r.collection_id) {
        return Err("Некорректный ID рецепта".into());
    }
    // Compiled adapters keep their own installers; recipes cannot shadow them.
    if crate::adapters::get(&r.collection_id).is_ok() {
        return Err("Коллекция обслуживается встроенным установщиком".into());
    }
    if r.title.trim().is_empty()
        || r.title.chars().count() > 120
        || r.title.chars().any(|c| c.is_control())
    {
        return Err("Некорректное название".into());
    }
    let s = &r.source;
    if s.required_files.is_empty() || s.required_files.len() > 64 || s.forbidden_files.len() > 64 {
        return Err("Нужно 1–64 обязательных файла источника".into());
    }
    for p in s.required_files.iter().chain(&s.forbidden_files) {
        relative(p)?;
    }
    match s.kind {
        SourceKind::Xbox360Iso => {
            if !s.title_id.as_deref().is_some_and(|t| hex(t, 8))
                || s.media_id.as_deref().is_some_and(|m| !hex(m, 8))
            {
                return Err("Для Xbox 360 ISO нужен Title ID (8 hex)".into());
            }
        }
        SourceKind::Folder => {
            if s.title_id.is_some() || s.media_id.is_some() {
                return Err("Title/Media ID проверяются только для ISO".into());
            }
        }
        SourceKind::Xbox360Content => {
            return Err("Контейнер разрешён только для дополнительного источника schema 2".into())
        }
    }
    if s.version.is_some() || s.sha256.is_some() {
        return Err("Для baseGame ограничения версии задаются проверенными файлами; version/sha256 предназначены для дополнительных контейнеров".into());
    }
    validate_sources(r)?;
    release_url(&r.runtime.url)?;
    if r.runtime.size == 0 || r.runtime.size > MAX_RUNTIME_ZIP {
        return Err(format!("runtime.size: {} байт; нужно от 1 байта до 2 ГиБ. Повторите анализ GitHub asset или проверьте официальный ZIP.",r.runtime.size));
    }
    if !hex(&r.runtime.sha256, 64) {
        return Err("runtime.sha256: нужны 64 hex-символа. Используйте автоматическую проверку официального runtime ZIP в CMS.".into());
    }
    if r.runtime.sha256.bytes().any(|b| b.is_ascii_uppercase()) {
        return Err("SHA-256 должен быть в нижнем регистре".into());
    }
    if let Some(p) = &r.runtime.strip_prefix {
        relative(p)?;
        if p.contains('/') {
            return Err("stripPrefix — одна папка верхнего уровня".into());
        }
    }
    if r.dependencies.len() > 8 {
        return Err("Слишком много зависимостей".into());
    }
    let l = &r.launch;
    relative(&l.executable)?;
    if !l.executable.to_ascii_lowercase().ends_with(".exe") {
        return Err("Точка запуска должна быть .exe внутри runtime".into());
    }
    if l.arguments.len() > 16 {
        return Err("Слишком много аргументов".into());
    }
    for a in &l.arguments {
        let f = a.flag.as_bytes();
        let body = a.flag.trim_start_matches('-').trim_end_matches('=');
        if !(2..=48).contains(&f.len())
            || f[0] != b'-'
            || body.is_empty()
            || !body
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            || (a.value.is_some() != a.flag.ends_with('='))
        {
            return Err(format!("Недопустимый аргумент запуска: {}", a.flag));
        }
    }
    Ok(())
}

/// Real checks against the running system; never reports success without probing.
pub fn check_dependencies(r: &Recipe) -> Result<()> {
    for d in &r.dependencies {
        match d {
            Dependency::WindowsX64 => {
                if !cfg!(all(windows, target_arch = "x86_64")) {
                    return Err("Требуется 64-битная Windows".into());
                }
            }
            Dependency::VulkanLoader => {
                let root = std::env::var_os("SystemRoot").ok_or("Нет SystemRoot")?;
                if !Path::new(&root).join("System32/vulkan-1.dll").is_file() {
                    return Err("Не найден Vulkan (vulkan-1.dll). Обновите драйвер видеокарты: PORT не устанавливает системные драйверы.".into());
                }
            }
        }
    }
    Ok(())
}

/// Files of a user-supplied source, read-only. Never writes to the source.
pub enum Inventory {
    Iso(File, Vec<crate::install::skate3::IsoEntry>),
    Folder(PathBuf, Vec<Entry>),
}
impl Inventory {
    pub fn bytes(&self) -> u64 {
        match self {
            Inventory::Iso(_, e) => e.iter().map(|e| e.size).sum(),
            Inventory::Folder(_, e) => e.iter().map(|e| e.size).sum(),
        }
    }
    fn has(&self, p: &str) -> bool {
        let p = p.to_lowercase();
        match self {
            Inventory::Iso(_, e) => e.iter().any(|e| e.path.to_lowercase() == p && e.size > 0),
            Inventory::Folder(_, e) => e.iter().any(|e| e.path.to_lowercase() == p && e.size > 0),
        }
    }
    fn present(&self, p: &str) -> bool {
        let p = p.to_lowercase();
        match self {
            Inventory::Iso(_, e) => e.iter().any(|e| e.path.to_lowercase() == p),
            Inventory::Folder(_, e) => e.iter().any(|e| e.path.to_lowercase() == p),
        }
    }
}
pub fn inspect_source(r: &Recipe, source: &Path, s: &Arc<Mutex<Status>>) -> Result<Inventory> {
    safe(source)?;
    let inv = match r.source.kind {
        SourceKind::Xbox360Content => {
            return Err("Контейнер обрабатывается только штатным мастером".into())
        }
        SourceKind::Xbox360Iso => {
            let mut f = open_read(source)?;
            let entries = crate::install::skate3::xdvdfs(&mut f, s)?;
            let xex = entries
                .iter()
                .find(|e| e.path.eq_ignore_ascii_case("default.xex"))
                .ok_or("В ISO нет default.xex")?;
            let id = crate::install::skate3::xex_identity(&mut f, xex.offset, xex.size)?;
            let want =
                u32::from_str_radix(r.source.title_id.as_deref().unwrap_or(""), 16).map_err(err)?;
            if id.title_id != want {
                return Err(format!(
                    "Неподходящий образ: Title ID {:08X}, нужен {want:08X}",
                    id.title_id
                ));
            }
            if let Some(m) = &r.source.media_id {
                if id.media_id != u32::from_str_radix(m, 16).map_err(err)? {
                    return Err(format!("Неподходящий Media ID {:08X}", id.media_id));
                }
            }
            Inventory::Iso(f, entries)
        }
        SourceKind::Folder => {
            if !source.is_dir() {
                return Err("Выберите папку с файлами игры".into());
            }
            Inventory::Folder(source.to_path_buf(), scan(source, s)?)
        }
    };
    for p in &r.source.required_files {
        if !inv.has(p) {
            return Err(format!("В источнике нет обязательного файла: {p}"));
        }
    }
    for p in &r.source.forbidden_files {
        if inv.present(p) {
            return Err(format!("Источник содержит недопустимый файл: {p}"));
        }
    }
    if inv.bytes() > MAX_BYTES {
        return Err("Источник превышает лимит размера".into());
    }
    Ok(inv)
}

/// Copies the verified source into `stage/game`, hashing every byte.
fn import_source(inv: &mut Inventory, stage: &Path, s: &Arc<Mutex<Status>>) -> Result<Vec<Entry>> {
    import_into(inv, stage, GAME_DIR, s)
}
fn import_into(
    inv: &mut Inventory,
    stage: &Path,
    target: &str,
    s: &Arc<Mutex<Status>>,
) -> Result<Vec<Entry>> {
    phase(s, "extracting", "Подготовка игровых файлов");
    if let Ok(mut st) = s.lock() {
        st.completed = 0;
        st.total = inv.bytes();
    }
    let mut out = Vec::new();
    match inv {
        Inventory::Iso(f, entries) => {
            for e in entries.iter() {
                relative(&e.path)?;
                f.seek(SeekFrom::Start(e.offset)).map_err(err)?;
                let path = format!("{target}/{}", e.path);
                let sha256 = stream((&mut *f).take(e.size), Some(&stage.join(&path)), e.size, s)?;
                out.push(Entry {
                    path,
                    size: e.size,
                    sha256,
                });
            }
        }
        Inventory::Folder(root, entries) => {
            for e in entries.iter() {
                let file = root.join(&e.path);
                safe(&file)?;
                package::regular_file(&file)?;
                let path = format!("{target}/{}", e.path);
                let sha256 = stream(open_read(&file)?, Some(&stage.join(&path)), e.size, s)?;
                if sha256 != e.sha256 && !e.sha256.is_empty() {
                    return Err(format!("Файл изменился во время копирования: {}", e.path));
                }
                out.push(Entry {
                    path,
                    size: e.size,
                    sha256,
                });
            }
        }
    }
    Ok(out)
}

/// Downloads the pinned runtime ZIP (size + SHA-256) and extracts it with bounds.
fn install_runtime(
    r: &Recipe,
    stage: &Path,
    s: &Arc<Mutex<Status>>,
    fetch: &dyn Fn(&str) -> Result<Box<dyn Read>>,
) -> Result<Vec<Entry>> {
    phase(s, "downloading", "Загрузка проверенного Windows-релиза");
    if let Ok(mut st) = s.lock() {
        st.completed = 0;
        st.total = r.runtime.size;
    }
    let zip_path = stage.join(".port-runtime.zip");
    let body = fetch(&r.runtime.url)?;
    let hash = stream(
        body.take(r.runtime.size + 1),
        Some(&zip_path),
        r.runtime.size,
        s,
    )?;
    if fs::metadata(&zip_path).map_err(err)?.len() != r.runtime.size {
        return Err("Размер Windows-релиза не совпал".into());
    }
    if hash != r.runtime.sha256 {
        return Err("SHA-256 Windows-релиза не совпал. Установка остановлена.".into());
    }
    phase(s, "extracting", "Безопасная распаковка runtime");
    let mut zip = zip::ZipArchive::new(open_read(&zip_path)?).map_err(err)?;
    if zip.len() > MAX_RUNTIME_FILES {
        return Err("Слишком много файлов в архиве".into());
    }
    let mut out = Vec::new();
    let mut names = HashSet::new();
    let mut total = 0u64;
    for i in 0..zip.len() {
        checkpoint(s)?;
        let mut e = zip.by_index(i).map_err(err)?;
        let name = e.name().to_string();
        let mode = e.unix_mode().unwrap_or(0) & 0o170000;
        if !download::safe_zip_name(&name)
            || e.is_symlink()
            || e.encrypted()
            || !matches!(mode, 0 | 0o040000 | 0o100000)
        {
            return Err(format!("Небезопасная запись ZIP: {name}"));
        }
        let mut rel = name.trim_end_matches('/').to_string();
        if let Some(p) = &r.runtime.strip_prefix {
            match rel.strip_prefix(&format!("{p}/")) {
                Some(rest) => rel = rest.to_string(),
                None if rel == *p && e.is_dir() => continue,
                None => return Err("Архив не соответствует stripPrefix".into()),
            }
        }
        if e.is_dir() {
            continue;
        }
        relative(&rel)?;
        if !names.insert(rel.to_lowercase()) {
            return Err("Повторяющееся имя в архиве".into());
        }
        let size = e.size();
        total = total.checked_add(size).ok_or("Переполнение размера ZIP")?;
        if size > MAX_RUNTIME_ENTRY
            || total > MAX_RUNTIME_ZIP * 2
            || size
                > e.compressed_size()
                    .saturating_mul(500)
                    .saturating_add(1024 * 1024)
        {
            return Err("Лимит распаковки ZIP превышен".into());
        }
        let path = format!("{RUNTIME_DIR}/{rel}");
        let sha256 = stream((&mut e).take(size + 1), Some(&stage.join(&path)), size, s)?;
        out.push(Entry { path, size, sha256 });
    }
    drop(zip);
    fs::remove_file(&zip_path).map_err(err)?;
    let exe = format!("{RUNTIME_DIR}/{}", r.launch.executable).to_lowercase();
    let entry = out
        .iter()
        .find(|e| e.path.to_lowercase() == exe)
        .ok_or("В Windows-релизе нет указанной точки запуска")?;
    let mut f = open_read(&stage.join(&entry.path))?;
    let mut mz = [0u8; 2];
    f.read_exact(&mut mz).map_err(err)?;
    if &mz != b"MZ" {
        return Err("Точка запуска не является Windows PE".into());
    }
    Ok(out)
}

/// Runs every operation into an owned staging folder. Commit/registration is the caller's job.
#[cfg(test)]
pub fn execute(
    r: &Recipe,
    source: &Path,
    stage: &Path,
    s: &Arc<Mutex<Status>>,
    fetch: &dyn Fn(&str) -> Result<Box<dyn Read>>,
) -> Result<Vec<Entry>> {
    execute_sources(r, source, &Selections::new(), false, stage, s, fetch)
}
#[allow(clippy::too_many_arguments)]
fn execute_sources(
    r: &Recipe,
    source: &Path,
    selections: &Selections,
    consent: bool,
    stage: &Path,
    s: &Arc<Mutex<Status>>,
    fetch: &dyn Fn(&str) -> Result<Box<dyn Read>>,
) -> Result<Vec<Entry>> {
    validate(r)?;
    phase(s, "validating", "Проверка совместимости источника");
    check_dependencies(r)?;
    let mut inv = inspect_source(r, source, s)?;
    let mut extra = inspect_sources(r, selections, s)?;
    if r.setup.is_some() && !consent {
        return Err("Требуется согласие на запуск проверенного штатного мастера".into());
    }
    if stage.starts_with(source) {
        return Err("Папка установки не может находиться внутри источника".into());
    }
    let mut files = install_runtime(r, stage, s, fetch)?;
    files.extend(import_source(&mut inv, stage, s)?);
    for (target, inventory) in &mut extra {
        files.extend(import_extra(inventory, stage, target, s)?);
    }
    fs::create_dir_all(stage.join(USER_DIR)).map_err(err)?;
    if let Some(setup) = &r.setup {
        files = run_setup(r, setup, stage, files, selections, s)?;
    }
    if files.len() >= MAX_FILES
        || files
            .iter()
            .try_fold(0u64, |n, e| n.checked_add(e.size))
            .is_none_or(|n| n > MAX_BYTES)
    {
        return Err("Результат установки превышает лимит файлов / размера".into());
    }
    phase(s, "verifying", "Проверка результата SHA-256");
    for e in &files {
        if stream(open_read(&stage.join(&e.path))?, None, e.size, s)? != e.sha256 {
            return Err(format!("Ошибка проверки записи: {}", e.path));
        }
    }
    Ok(files)
}

/// Builds the launch command purely from typed recipe fields.
pub fn command(r: &Recipe, root: &Path) -> Result<Command> {
    validate(r)?;
    let dir = |p: Placeholder| match p {
        Placeholder::GameDir => root.join(GAME_DIR),
        Placeholder::UserDir => root.join(USER_DIR),
        Placeholder::RuntimeDir => root.join(RUNTIME_DIR),
    };
    let user = root.join(USER_DIR);
    safe(&user)?;
    fs::create_dir_all(&user).map_err(err)?;
    let mut cmd = Command::new(root.join(RUNTIME_DIR).join(&r.launch.executable));
    for a in &r.launch.arguments {
        match a.value {
            Some(p) => cmd.arg(format!("{}{}", a.flag, dir(p).display())),
            None => cmd.arg(&a.flag),
        };
    }
    cmd.current_dir(dir(r.launch.working_dir))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    Ok(cmd)
}

// ---------- Lifecycle: catalog cache, install, recovery, verification ----------

/// Raw recipe pinned inside the owned installation root (re-validated on every use).
pub const RECIPE_FILE: &str = "port-recipe.json";
const RECIPES_LIMIT: usize = 1024 * 1024;

pub fn init(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch(
        "CREATE TABLE IF NOT EXISTS recipe_cache(id TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )
}

/// Universal roots are `PORT-{collection}-{id}` with a lowercase recipe collection id.
pub(crate) fn universal_collection(root: &Path, id: &str) -> Option<String> {
    let name = root.file_name()?.to_str()?;
    let c = name
        .strip_prefix("PORT-")?
        .strip_suffix(&format!("-{id}"))?;
    (id_like(c) && crate::adapters::get(c).is_err()).then(|| c.to_string())
}

pub(crate) fn installed_recipe(record: &Installation) -> Result<Recipe> {
    let raw = read_small(
        &Path::new(&record.runtime_path).join(RECIPE_FILE),
        64 * 1024,
    )?;
    let pinned = format!("{RUNTIME_DIR}/{RECIPE_FILE}");
    let digest = format!("{:x}", Sha256::digest(&raw));
    if !load_manifest(record)?
        .files
        .iter()
        .any(|e| e.path == pinned && e.sha256 == digest && e.size == raw.len() as u64)
    {
        return Err("Рецепт установки изменён или не закреплён в манифесте".into());
    }
    let r = parse(std::str::from_utf8(&raw).map_err(err)?)?;
    if r.collection_id != record.collection_id {
        return Err("Рецепт установки не соответствует записи библиотеки".into());
    }
    Ok(r)
}

/// Manifest-based integrity check; foreign files in runtime/ block launch (DLL planting).
pub(crate) fn verify_installed(
    record: &Installation,
    all: bool,
    s: &Arc<Mutex<Status>>,
) -> Result<()> {
    let m = load_manifest(record)?;
    let r = installed_recipe(record)?;
    let root = Path::new(&record.root);
    let exe = format!("{RUNTIME_DIR}/{}", r.launch.executable).to_lowercase();
    if !m.files.iter().any(|e| e.path.to_lowercase() == exe) {
        return Err("Точка запуска отсутствует в манифесте".into());
    }
    let expected: HashSet<String> = m
        .files
        .iter()
        .filter_map(|e| {
            e.path
                .strip_prefix(&format!("{RUNTIME_DIR}/"))
                .map(str::to_lowercase)
        })
        .collect();
    if scan(&root.join(RUNTIME_DIR), s)?
        .iter()
        .any(|e| !expected.contains(&e.path.to_lowercase()))
    {
        return Err("В runtime появились посторонние файлы; запуск заблокирован".into());
    }
    for e in &m.files {
        checkpoint(s)?;
        let path = root.join(&e.path);
        safe(&path)?;
        package::regular_file(&path)?;
        if fs::metadata(&path).map_err(err)?.len() != e.size {
            return Err(format!("Файл изменён: {}", e.path));
        }
        if all && stream(open_read(&path)?, None, e.size, s)? != e.sha256 {
            return Err(format!("SHA-256 не совпадает: {}", e.path));
        }
    }
    Ok(())
}

/// Recovery of an interrupted universal job, mirroring the compiled-adapter journal.
pub(crate) fn recover_job(
    db: &Connection,
    id: &str,
    collection: &str,
    stage: &Path,
    root: &Path,
) -> Result<()> {
    if stage.file_name().and_then(|v| v.to_str()) != Some(format!(".port-stage-{id}").as_str())
        || stage.parent() != root.parent()
        || !experience::valid_id(id)
    {
        return Err(format!("Некорректный журнал восстановления операции {id}"));
    }
    if root.exists() {
        if read_small(&root.join("port-owner"), 256)? != id.as_bytes() {
            return Err("Не совпадает владелец установки".into());
        }
        let bytes = read_small(&root.join("port-manifest.json"), 32 * 1024 * 1024)?;
        let record = Installation {
            id: id.into(),
            collection_id: collection.into(),
            root: root.display().to_string(),
            data_path: root.join(GAME_DIR).display().to_string(),
            runtime_path: root.join(RUNTIME_DIR).display().to_string(),
            version: None,
            manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        verify_installed(&record, true, &Arc::default())?;
        let exists: Option<String> = db
            .query_row("SELECT id FROM installations WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)?;
        if exists.is_none() {
            register(db, &record)?;
        }
    } else if stage.exists() {
        let owner = stage.join("port-owner");
        if owner.exists() && read_small(&owner, 256)? != id.as_bytes() {
            return Err("Не совпадает владелец временной папки".into());
        }
        if !owner.exists() && fs::read_dir(stage).map_err(err)?.next().is_some() {
            return Err("Нельзя очистить неизвестную временную папку".into());
        }
        if in_use(stage)? {
            return Err("Штатный мастер ещё работает; восстановление отложено".into());
        }
        preserve_setup(stage, id)?;
        cleanup(stage)?;
    }
    db.execute("DELETE FROM installation_jobs WHERE id=?1", [id])
        .map_err(err)?;
    Ok(())
}

/// Public catalog entry: supported recipes and honest "unsupported" states.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeSummary {
    id: String,
    collection_id: String,
    title: String,
    supported: bool,
    reason: Option<String>,
    source_kind: Option<String>,
    title_id: Option<String>,
    required_files: Vec<String>,
    dependencies: Vec<String>,
    runtime_size: u64,
    sources: Vec<SourceSlot>,
    setup: bool,
}
fn summary(raw: &str) -> RecipeSummary {
    let v: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let text = |k: &str| {
        v[k].as_str()
            .unwrap_or("")
            .chars()
            .take(120)
            .collect::<String>()
    };
    match parse(raw) {
        Ok(r) => RecipeSummary {
            id: r.id,
            collection_id: r.collection_id,
            title: r.title,
            supported: true,
            reason: None,
            source_kind: Some(
                match r.source.kind {
                    SourceKind::Xbox360Iso => "xbox360-iso",
                    SourceKind::Folder => "folder",
                    SourceKind::Xbox360Content => "xbox360-content",
                }
                .into(),
            ),
            title_id: r.source.title_id,
            required_files: r.source.required_files,
            dependencies: r
                .dependencies
                .iter()
                .map(|d| {
                    match d {
                        Dependency::WindowsX64 => "windows-x64",
                        Dependency::VulkanLoader => "vulkan-loader",
                    }
                    .into()
                })
                .collect(),
            runtime_size: r.runtime.size,
            sources: r.sources,
            setup: r.setup.is_some(),
        },
        Err(e) => RecipeSummary {
            id: text("id"),
            collection_id: text("collectionId"),
            title: text("title"),
            supported: false,
            reason: Some(format!("Неподдерживаемый сценарий установки: {e}")),
            source_kind: None,
            title_id: None,
            required_files: Vec::new(),
            dependencies: Vec::new(),
            runtime_size: 0,
            sources: Vec::new(),
            setup: false,
        },
    }
}
fn cached(c: &Connection) -> Result<Vec<(String, String)>> {
    let mut q = c
        .prepare("SELECT id,value FROM recipe_cache ORDER BY id")
        .map_err(err)?;
    let v = q
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(err)?
        .collect::<std::result::Result<_, _>>()
        .map_err(err)?;
    Ok(v)
}
/// Replaces the cache atomically; installations and pinned recipes are never touched.
pub(crate) fn store(c: &Connection, body: &[u8]) -> Result<usize> {
    let v: Value = serde_json::from_slice(body).map_err(|_| "Некорректный recipes.json")?;
    let list = v["recipes"].as_array().ok_or("Некорректный recipes.json")?;
    if v["schemaVersion"] != 1 || list.len() > 500 {
        return Err("Неподдерживаемая версия recipes.json".into());
    }
    let tx = c.unchecked_transaction().map_err(err)?;
    tx.execute("DELETE FROM recipe_cache", []).map_err(err)?;
    let mut seen = HashSet::new();
    for item in list {
        let raw = item.to_string();
        let id = item["id"]
            .as_str()
            .filter(|i| id_like(i))
            .ok_or("Рецепт без корректного ID")?;
        if raw.len() > 64 * 1024 || !seen.insert(id.to_string()) {
            return Err("Повторяющийся или слишком большой рецепт".into());
        }
        tx.execute("INSERT INTO recipe_cache VALUES(?1,?2)", params![id, raw])
            .map_err(err)?;
    }
    tx.commit().map_err(err)?;
    Ok(list.len())
}
fn recipes_url(endpoint: &str) -> Result<String> {
    endpoint
        .strip_suffix("/catalog.json")
        .map(|b| format!("{b}/recipes.json"))
        .ok_or_else(|| "Endpoint каталога не поддерживает рецепты".into())
}
#[tauri::command]
pub fn list_recipes(db: tauri::State<crate::Database>) -> Result<Vec<RecipeSummary>> {
    let c = db.0.lock().map_err(err)?;
    Ok(cached(&c)?.iter().map(|(_, raw)| summary(raw)).collect())
}
#[tauri::command]
pub async fn sync_recipes(app: tauri::AppHandle) -> Result<Vec<RecipeSummary>> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = recipes_url(&with_db(&app, crate::catalog::endpoint)?)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(12);
        // Offline or 404 keeps the previous cache; never fabricates recipes.
        let body = crate::catalog::fetch(&url, RECIPES_LIMIT, deadline, "application/json")?;
        with_db(&app, |c| store(c, &body))?;
        with_db(&app, |c| {
            Ok(cached(c)?.iter().map(|(_, raw)| summary(raw)).collect())
        })
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub fn install_recipe(
    app: tauri::AppHandle,
    state: tauri::State<Installer>,
    recipe_id: String,
    source: String,
    parent: String,
    sources: Option<Selections>,
    setup_consent: Option<bool>,
) -> Result<()> {
    let raw = with_db(&app, |c| {
        c.query_row(
            "SELECT value FROM recipe_cache WHERE id=?1",
            [&recipe_id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(err)?
        .ok_or_else(|| "Рецепт не найден. Обновите каталог".to_string())
    })?;
    let recipe = parse(&raw)?;
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
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let db = app.state::<crate::Database>();
            job_sources(
                &db.0,
                &recipe,
                &raw,
                PathBuf::from(source),
                PathBuf::from(parent),
                &status,
                &github_fetch,
                &sources.unwrap_or_default(),
                setup_consent.unwrap_or(false),
            )
        }))
        .unwrap_or_else(|_| Err("Внутренняя ошибка установщика".into()));
        if let Ok(mut s) = status.lock() {
            match result {
                Ok(m) => {
                    s.phase = "ready".into();
                    s.message = m;
                }
                Err(e) => {
                    s.phase = if s.cancel { "cancelled" } else { "error" }.into();
                    s.message = e;
                }
            }
            s.active = false;
        }
    });
    Ok(())
}

fn dbx<T>(db: &Mutex<Connection>, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    f(&*db.lock().map_err(err)?)
}

/// Staged install → atomic rename → SQLite registration, journalled in installation_jobs.
#[cfg(test)]
pub(crate) fn job(
    db: &Mutex<Connection>,
    r: &Recipe,
    raw: &str,
    source: PathBuf,
    parent: PathBuf,
    s: &Arc<Mutex<Status>>,
    fetch: &dyn Fn(&str) -> Result<Box<dyn Read>>,
) -> Result<String> {
    job_sources(
        db,
        r,
        raw,
        source,
        parent,
        s,
        fetch,
        &Selections::new(),
        false,
    )
}
#[allow(clippy::too_many_arguments)]
fn job_sources(
    db: &Mutex<Connection>,
    r: &Recipe,
    raw: &str,
    source: PathBuf,
    parent: PathBuf,
    s: &Arc<Mutex<Status>>,
    fetch: &dyn Fn(&str) -> Result<Box<dyn Read>>,
    selections: &Selections,
    consent: bool,
) -> Result<String> {
    preflight(r, &source, selections, &parent, consent, s)?;
    let id = experience::new_id()?;
    let folder = universal_folder(&r.collection_id, &id);
    let root = dbx(db, |c| {
        experience::destination_folder(&parent, &id, &records(c)?, &r.collection_id, &folder)
    })?;
    safe(&source)?;
    let canonical_source = fs::canonicalize(&source).map_err(err)?;
    if fs::canonicalize(&parent)
        .map_err(err)?
        .starts_with(&canonical_source)
    {
        return Err("Источник и папка назначения должны находиться отдельно".into());
    }
    let source_bytes = if source.is_file() {
        fs::metadata(&source).map_err(err)?.len()
    } else {
        0
    };
    space(
        &parent,
        source_bytes.saturating_add(r.runtime.size.saturating_mul(3)),
    )?;
    let stage = parent.join(format!(".port-stage-{id}"));
    dbx(db, |c| {
        c.execute(
            "INSERT INTO installation_jobs(id,staging,root) VALUES(?1,?2,?3)",
            params![id, stage.display().to_string(), root.display().to_string()],
        )
        .map_err(err)?;
        Ok(())
    })?;
    let result = stage_and_commit(
        db, r, raw, &source, &stage, &root, &id, s, fetch, selections, consent,
    );
    if let Err(failure) = &result {
        if !root.exists() {
            preserve_setup(&stage, &id)?;
            if let Err(e) = cleanup(&stage) {
                return Err(format!("{failure}; очистка не завершена: {e}. Восстановление при следующем запуске PORT."));
            }
            dbx(db, |c| {
                c.execute("DELETE FROM installation_jobs WHERE id=?1", [&id])
                    .map_err(err)?;
                Ok(())
            })?;
            if parent.join(format!(".port-preserved-{id}")).exists() {
                return Err(format!(
                    "{failure}. Файлы мастера сохранены: {}",
                    parent.join(format!(".port-preserved-{id}")).display()
                ));
            }
        }
    }
    result
}
#[allow(clippy::too_many_arguments)]
fn stage_and_commit(
    db: &Mutex<Connection>,
    r: &Recipe,
    raw: &str,
    source: &Path,
    stage: &Path,
    root: &Path,
    id: &str,
    s: &Arc<Mutex<Status>>,
    fetch: &dyn Fn(&str) -> Result<Box<dyn Read>>,
    selections: &Selections,
    consent: bool,
) -> Result<String> {
    safe(stage)?;
    fs::create_dir(stage).map_err(err)?;
    write_new(&stage.join("port-owner"), id.as_bytes())?;
    let mut files = execute_sources(r, source, selections, consent, stage, s, fetch)?;
    // Pin the exact recipe bytes inside the SQLite-hashed manifest: an edited recipe blocks launch.
    fs::create_dir_all(stage.join(RUNTIME_DIR)).map_err(err)?;
    write_new(&stage.join(RUNTIME_DIR).join(RECIPE_FILE), raw.as_bytes())?;
    files.push(Entry {
        path: format!("{RUNTIME_DIR}/{RECIPE_FILE}"),
        size: raw.len() as u64,
        sha256: format!("{:x}", Sha256::digest(raw.as_bytes())),
    });
    let m = Manifest {
        schema: 1,
        id: id.into(),
        version: None,
        files,
    };
    let bytes = serde_json::to_vec(&m).map_err(err)?;
    write_new(&stage.join("port-manifest.json"), &bytes)?;
    checkpoint(s)?;
    // Hold status through rename + DB commit: cancel cannot report success after commit starts.
    let status = s.lock().map_err(err)?;
    if status.cancel {
        return Err("Отменено пользователем".into());
    }
    if fs::symlink_metadata(root).is_ok() {
        return Err("Папка установки уже существует".into());
    }
    fs::rename(stage, root).map_err(err)?;
    let record = Installation {
        id: id.into(),
        collection_id: r.collection_id.clone(),
        root: root.display().to_string(),
        data_path: root.join(GAME_DIR).display().to_string(),
        runtime_path: root.join(RUNTIME_DIR).display().to_string(),
        version: None,
        manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
    };
    dbx(db, |c| {
        let tx = c.unchecked_transaction().map_err(err)?;
        register(&tx, &record)?;
        tx.execute("DELETE FROM installation_jobs WHERE id=?1", [id])
            .map_err(err)?;
        tx.commit().map_err(err)
    })?;
    drop(status);
    Ok(format!(
        "Установлено: {}. Исходный источник не изменялся. Gameplay не подтверждён PORT.",
        r.title
    ))
}

/// Production fetcher: pinned GitHub client with allowlisted redirects.
pub fn github_fetch(url: &str) -> Result<Box<dyn Read>> {
    release_url(url)?;
    let resp = download::client()?
        .get(url)
        .header("Accept-Encoding", "identity")
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|_| "Не удалось загрузить Windows-релиз. Проверьте подключение.".to_string())?;
    Ok(Box::new(resp))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{Cursor, Write as _};

    fn zip_bytes(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut c = Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut c);
            for (n, b) in files {
                z.start_file(*n, zip::write::SimpleFileOptions::default())
                    .unwrap();
                z.write_all(b).unwrap();
            }
            z.finish().unwrap();
        }
        c.into_inner()
    }
    fn recipe(zip: &[u8]) -> String {
        json!({
            "schemaVersion": 1, "id": "demo-port", "collectionId": "demo-port",
            "title": "Synthetic fixture",
            "source": {"kind": "folder", "requiredFiles": ["data/main.bin"], "forbiddenFiles": ["patch.bin"]},
            "runtime": {"url": "https://github.com/example/demo/releases/download/v1/demo-win.zip",
                        "size": zip.len(), "sha256": format!("{:x}", Sha256::digest(zip)), "stripPrefix": "demo"},
            "dependencies": [],
            "launch": {"executable": "demo.exe", "workingDir": "userDir",
                       "arguments": [{"flag": "--data=", "value": "gameDir"}, {"flag": "--fullscreen"}]}
        })
        .to_string()
    }
    #[test]
    fn rejects_unsafe_or_unsupported_recipes() {
        let z = zip_bytes(&[("demo/demo.exe", b"MZx")]);
        let ok = recipe(&z);
        assert!(parse(&ok).is_ok());
        let mutate = |f: &dyn Fn(&mut Value)| {
            let mut v: Value = serde_json::from_str(&ok).unwrap();
            f(&mut v);
            parse(&v.to_string())
        };
        assert!(mutate(&|v| v["script"] = json!("rm -rf")).is_err());
        assert!(mutate(&|v| v["launch"]["arguments"][0]["flag"] = json!("&calc")).is_err());
        assert!(mutate(&|v| v["launch"]["arguments"][1]["flag"] = json!("--x=")).is_err());
        assert!(mutate(&|v| v["launch"]["executable"] = json!("../x.exe")).is_err());
        assert!(mutate(&|v| v["launch"]["executable"] = json!("run.bat")).is_err());
        assert!(mutate(&|v| v["source"]["requiredFiles"][0] = json!("..\\a")).is_err());
        assert!(mutate(&|v| v["runtime"]["url"] = json!("https://evil.example/a.zip")).is_err());
        assert!(mutate(
            &|v| v["runtime"]["url"] = json!("http://github.com/a/b/releases/download/t/x.zip")
        )
        .is_err());
        assert!(mutate(&|v| v["runtime"]["sha256"] = json!("00")).is_err());
        assert!(mutate(&|v| v["collectionId"] = json!("skate3")).is_err());
        assert!(mutate(&|v| v["schemaVersion"] = json!(3)).is_err());
        assert!(mutate(&|v| v["source"]["kind"] = json!("ps4-encrypted-pkg")).is_err());
        assert!(mutate(&|v| v["source"]["kind"] = json!("xbox360-iso")).is_err());
        assert!(mutate(&|v| v["dependencies"] = json!(["node"])).is_err());
    }
    #[test]
    fn installs_synthetic_folder_into_stage_without_touching_source() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("src");
        fs::create_dir_all(src.join("data")).unwrap();
        fs::write(src.join("data/main.bin"), b"game").unwrap();
        let z = zip_bytes(&[("demo/demo.exe", b"MZ-runtime"), ("demo/lib/a.dll", b"dll")]);
        let r = parse(&recipe(&z)).unwrap();
        let stage = t.path().join(".port-stage-1-2");
        fs::create_dir(&stage).unwrap();
        let zc = z.clone();
        let files = execute(&r, &src, &stage, &Arc::default(), &move |_| {
            Ok(Box::new(Cursor::new(zc.clone())))
        })
        .unwrap();
        let names: Vec<_> = files.iter().map(|e| e.path.as_str()).collect();
        assert!(names.contains(&"runtime/demo.exe"));
        assert!(names.contains(&"runtime/lib/a.dll"));
        assert!(names.contains(&"game/data/main.bin"));
        assert!(!stage.join(".port-runtime.zip").exists());
        assert_eq!(fs::read(src.join("data/main.bin")).unwrap(), b"game");
        let cmd = command(&r, &stage).unwrap();
        let args: Vec<_> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        assert_eq!(args[0], format!("--data={}", stage.join("game").display()));
        assert_eq!(args[1], "--fullscreen");
    }
    #[test]
    fn rejects_hash_mismatch_traversal_missing_files_and_non_pe() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("src");
        fs::create_dir_all(src.join("data")).unwrap();
        fs::write(src.join("data/main.bin"), b"game").unwrap();
        let run = |z: Vec<u8>, sha: Option<String>, n: &str| {
            let mut v: Value = serde_json::from_str(&recipe(&z)).unwrap();
            if let Some(h) = sha {
                v["runtime"]["sha256"] = json!(h);
            }
            let r = parse(&v.to_string()).unwrap();
            let stage = t.path().join(n);
            fs::create_dir(&stage).unwrap();
            execute(&r, &src, &stage, &Arc::default(), &move |_| {
                Ok(Box::new(Cursor::new(z.clone())))
            })
        };
        assert!(run(
            zip_bytes(&[("demo/demo.exe", b"MZ")]),
            Some("0".repeat(64)),
            "a"
        )
        .is_err());
        assert!(run(zip_bytes(&[("demo/../../x.exe", b"MZ")]), None, "b").is_err());
        assert!(run(zip_bytes(&[("demo/demo.exe", b"XX")]), None, "c").is_err());
        assert!(run(zip_bytes(&[("other/demo.exe", b"MZ")]), None, "d").is_err());
        fs::write(src.join("patch.bin"), b"p").unwrap();
        assert!(run(zip_bytes(&[("demo/demo.exe", b"MZ")]), None, "e").is_err());
        assert!(!t.path().join("x.exe").exists());
    }
    fn test_db() -> Mutex<Connection> {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE installations(id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE installation_jobs(id TEXT PRIMARY KEY, staging TEXT NOT NULL, root TEXT NOT NULL); CREATE TABLE update_jobs(id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE removal_jobs(id TEXT PRIMARY KEY);").unwrap();
        init(&c).unwrap();
        Mutex::new(c)
    }
    #[test]
    fn end_to_end_job_registers_verifies_and_recovers() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("src");
        fs::create_dir_all(src.join("data")).unwrap();
        fs::write(src.join("data/main.bin"), b"game").unwrap();
        let parent = t.path().join("Games");
        fs::create_dir(&parent).unwrap();
        let z = zip_bytes(&[("demo/demo.exe", b"MZ-runtime")]);
        let raw = recipe(&z);
        let r = parse(&raw).unwrap();
        let db = test_db();
        let zc = z.clone();
        let fetch =
            move |_: &str| -> Result<Box<dyn Read>> { Ok(Box::new(Cursor::new(zc.clone()))) };
        job(
            &db,
            &r,
            &raw,
            src.clone(),
            parent.clone(),
            &Arc::default(),
            &fetch,
        )
        .unwrap();
        let recs = records(&db.lock().unwrap()).unwrap();
        assert_eq!(recs.len(), 1);
        let rec = &recs[0];
        assert_eq!(rec.collection_id, "demo-port");
        record_paths(rec).unwrap();
        verify_installed(rec, true, &Arc::default()).unwrap();
        // Second install of the same collection is refused; nothing overwritten.
        assert!(job(
            &db,
            &r,
            &raw,
            src.clone(),
            parent.clone(),
            &Arc::default(),
            &fetch
        )
        .is_err());
        // Planted DLL blocks launch verification.
        fs::write(Path::new(&rec.runtime_path).join("evil.dll"), b"x").unwrap();
        assert!(verify_installed(rec, false, &Arc::default()).is_err());
        fs::remove_file(Path::new(&rec.runtime_path).join("evil.dll")).unwrap();
        // Silently edited pinned recipe (e.g. different launch target) blocks launch.
        let pinned = Path::new(&rec.runtime_path).join(RECIPE_FILE);
        let original = fs::read(&pinned).unwrap();
        fs::write(&pinned, raw.replace("demo.exe", "demo2.exe")).unwrap();
        assert!(installed_recipe(rec).is_err());
        assert!(verify_installed(rec, false, &Arc::default()).is_err());
        fs::write(&pinned, original).unwrap();
        verify_installed(rec, false, &Arc::default()).unwrap();
        // Cancelled job leaves no stage and no journal.
        let cancelled = Arc::new(Mutex::new(Status {
            cancel: true,
            ..Status::default()
        }));
        let db2 = test_db();
        let p2 = t.path().join("G2");
        fs::create_dir(&p2).unwrap();
        assert!(job(&db2, &r, &raw, src.clone(), p2.clone(), &cancelled, &fetch).is_err());
        assert_eq!(fs::read_dir(&p2).unwrap().count(), 0);
        assert!(records(&db2.lock().unwrap()).unwrap().is_empty());
        // Crash after rename but before registration: recovery registers the verified root.
        let c = db.lock().unwrap();
        c.execute("DELETE FROM installations", []).unwrap();
        let root = Path::new(&rec.root);
        let stage = parent.join(format!(".port-stage-{}", rec.id));
        c.execute(
            "INSERT INTO installation_jobs VALUES(?1,?2,?3)",
            params![rec.id, stage.display().to_string(), rec.root],
        )
        .unwrap();
        assert_eq!(
            universal_collection(root, &rec.id).as_deref(),
            Some("demo-port")
        );
        recover_job(&c, &rec.id, "demo-port", &stage, root).unwrap();
        assert_eq!(records(&c).unwrap().len(), 1);
        assert_eq!(fs::read(src.join("data/main.bin")).unwrap(), b"game");
    }
    #[test]
    fn cache_marks_unsupported_recipes_honestly() {
        let db = test_db();
        let z = zip_bytes(&[("demo/demo.exe", b"MZ")]);
        let good: Value = serde_json::from_str(&recipe(&z)).unwrap();
        let mut bad = good.clone();
        bad["id"] = json!("bad-one");
        bad["launch"]["shell"] = json!("cmd /c calc");
        let body = json!({"schemaVersion": 1, "recipes": [good, bad]}).to_string();
        let c = db.lock().unwrap();
        assert_eq!(store(&c, body.as_bytes()).unwrap(), 2);
        let list: Vec<_> = cached(&c)
            .unwrap()
            .iter()
            .map(|(_, r)| summary(r))
            .collect();
        assert!(list.iter().any(|s| s.id == "demo-port" && s.supported));
        assert!(list
            .iter()
            .any(|s| s.id == "bad-one" && !s.supported && s.reason.is_some()));
        assert!(store(&c, br#"{"schemaVersion":2,"recipes":[]}"#).is_err());
        assert_eq!(
            recipes_url("https://x.example/v1/catalog.json").unwrap(),
            "https://x.example/v1/recipes.json"
        );
    }
    fn multi_recipe(zip: &[u8], wizard: bool) -> Value {
        let mut v: Value = serde_json::from_str(&recipe(zip)).unwrap();
        v["schemaVersion"] = json!(2);
        v["sources"] = json!([
            {"role":"titleUpdate","required":true,"repeatable":false,"target":"tu","operation":"copy-tree","source":{"kind":"folder","requiredFiles":["patch.bin"]}},
            {"role":"dlc","required":false,"repeatable":true,"target":"dlc","operation":"copy-tree","source":{"kind":"folder","requiredFiles":["dlc.bin"]}}
        ]);
        if wizard {
            v["setup"] = json!({"executable":"demo.exe","workingDir":"runtimeDir","arguments":[{"flag":"--install"}],"results":[{"path":"runtime/output.bin","size":6,"sha256":format!("{:x}",Sha256::digest(b"output"))}]});
        }
        v
    }
    #[test]
    fn multi_source_import_preflight_and_transaction() {
        let t = tempfile::tempdir().unwrap();
        let base = t.path().join("base");
        let tu = t.path().join("tu");
        let dlc = t.path().join("dlc");
        let parent = t.path().join("Games");
        fs::create_dir_all(base.join("data")).unwrap();
        for p in [&tu, &dlc, &parent] {
            fs::create_dir(p).unwrap();
        }
        fs::write(base.join("data/main.bin"), b"base").unwrap();
        fs::write(tu.join("patch.bin"), b"prepared update").unwrap();
        fs::write(dlc.join("dlc.bin"), b"optional").unwrap();
        let z = zip_bytes(&[("demo/demo.exe", b"MZ-fixture")]);
        let raw = multi_recipe(&z, false).to_string();
        let r = parse(&raw).unwrap();
        let mut choices = Selections::new();
        assert!(preflight(&r, &base, &choices, &parent, false, &Arc::default()).is_err());
        choices.insert("titleUpdate".into(), vec![tu.display().to_string()]);
        choices.insert(
            "dlc".into(),
            vec![dlc.display().to_string(), dlc.display().to_string()],
        );
        preflight(&r, &base, &choices, &parent, false, &Arc::default()).unwrap();
        let db = test_db();
        job_sources(
            &db,
            &r,
            &raw,
            base.clone(),
            parent.clone(),
            &Arc::default(),
            &|_| Ok(Box::new(Cursor::new(z.clone()))),
            &choices,
            false,
        )
        .unwrap();
        let rec = records(&db.lock().unwrap()).unwrap().remove(0);
        let root = Path::new(&rec.root);
        assert_eq!(
            fs::read(root.join("game/tu/patch.bin")).unwrap(),
            b"prepared update"
        );
        for i in 0..2 {
            assert_eq!(
                fs::read(root.join(format!("game/dlc/{i}/dlc.bin"))).unwrap(),
                b"optional"
            );
        }
        verify_installed(&rec, true, &Arc::default()).unwrap();
        assert_eq!(fs::read(tu.join("patch.bin")).unwrap(), b"prepared update");
        choices.insert("unknown".into(), vec![]);
        assert!(inspect_sources(&r, &choices, &Arc::default()).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn recipe_rejects_junction_source_and_destination() {
        let t = tempfile::tempdir().unwrap();
        let target = t.path().join("target");
        let link = t.path().join("junction");
        fs::create_dir_all(target.join("data")).unwrap();
        fs::write(target.join("data/main.bin"), b"fixture").unwrap();
        let output = Command::new("cmd.exe")
            .args(["/c", "mklink", "/J"])
            .arg(&link)
            .arg(&target)
            .output()
            .unwrap();
        assert!(output.status.success());
        let z = zip_bytes(&[("demo/demo.exe", b"MZ")]);
        let r = parse(&recipe(&z)).unwrap();
        assert!(inspect_source(&r, &link, &Arc::default()).is_err());
        assert!(preflight(
            &r,
            &target,
            &Selections::new(),
            &link,
            false,
            &Arc::default()
        )
        .is_err());
        fs::remove_dir(&link).unwrap();
        assert!(target.join("data/main.bin").exists());
    }
    #[test]
    fn multi_source_validation_fails_closed() {
        let z = zip_bytes(&[("demo/demo.exe", b"MZ")]);
        let good = multi_recipe(&z, true);
        assert!(parse(&good.to_string()).is_ok());
        for (pointer, value) in [
            ("/schemaVersion", json!(1)),
            ("/sources/0/target", json!("../escape")),
            ("/sources/0/target", json!("dlc/nested")),
            ("/sources/0/repeatable", json!(true)),
            ("/sources/0/operation", json!("shell")),
            ("/setup/executable", json!("other.exe")),
            ("/setup/results", json!([])),
            ("/setup/results/0/path", json!("user-data/save")),
            ("/setup/results/0/sha256", json!("0")),
            ("/setup/arguments/0/flag", json!("/c calc")),
        ] {
            let mut v = good.clone();
            *v.pointer_mut(pointer).unwrap() = value;
            assert!(parse(&v.to_string()).is_err(), "{pointer}");
        }
    }
    #[test]
    fn extensionless_content_is_header_checked_and_delegated_not_extracted() {
        let t = tempfile::tempdir().unwrap();
        let path = t.path().join("tu00000000_00000000");
        let mut bytes = vec![0u8; 0x3000];
        bytes[..4].copy_from_slice(b"LIVE");
        bytes[0x379] = 0x24;
        bytes[0x37b] = 1;
        bytes[0x37c] = 1;
        bytes[0x398] = 1;
        for (off, n) in [
            (0x340, 0x1000u32),
            (0x344, 0xb0000),
            (0x348, 2),
            (0x360, 0x1234abcd),
            (0x358, 3),
        ] {
            bytes[off..off + 4].copy_from_slice(&n.to_be_bytes());
        }
        fs::write(&path, &bytes).unwrap();
        let z = zip_bytes(&[("demo/demo.exe", b"MZ")]);
        let mut v = multi_recipe(&z, true);
        v["sources"][0]["operation"] = json!("upstream-setup");
        v["sources"][0]["source"] = json!({"kind":"xbox360-content","titleId":"1234ABCD","version":"00000003","requiredFiles":[],"sha256":format!("{:x}",Sha256::digest(&bytes))});
        let r = parse(&v.to_string()).unwrap();
        let mut choices = Selections::new();
        choices.insert("titleUpdate".into(), vec![path.display().to_string()]);
        let mut inventories = inspect_sources(&r, &choices, &Arc::default()).unwrap();
        let stage = t.path().join("stage");
        fs::create_dir(&stage).unwrap();
        let (target, inv) = &mut inventories[0];
        import_extra(inv, &stage, target, &Arc::default()).unwrap();
        assert_eq!(
            fs::read(stage.join("game/tu/source.container")).unwrap(),
            bytes
        );
        drop(inventories);
        bytes[0x360] = 0;
        fs::write(&path, &bytes).unwrap();
        assert!(inspect_sources(&r, &choices, &Arc::default()).is_err());
        fs::write(&path, b"LIVE").unwrap();
        assert!(inspect_sources(&r, &choices, &Arc::default()).is_err());
    }
    #[test]
    fn setup_output_gate_and_crash_preserve_user_files() {
        let t = tempfile::tempdir().unwrap();
        let stage = t.path().join(".port-stage-100-200");
        let root = t.path().join("PORT-demo-port-100-200");
        fs::create_dir_all(stage.join("runtime")).unwrap();
        fs::create_dir(stage.join("user-data")).unwrap();
        fs::write(stage.join("port-owner"), b"100-200").unwrap();
        fs::write(
            stage.join("user-data/.port-setup-started"),
            b"preserve entire staging on failure",
        )
        .unwrap();
        fs::write(stage.join("user-data/save"), b"do not lose").unwrap();
        let z = zip_bytes(&[("demo/demo.exe", b"MZ")]);
        let r = parse(&multi_recipe(&z, true).to_string()).unwrap();
        let setup = r.setup.as_ref().unwrap();
        assert!(verify_setup(setup, &stage, vec![], &Arc::default()).is_err());
        fs::write(stage.join("runtime/output.bin"), b"output").unwrap();
        assert!(verify_setup(setup, &stage, vec![], &Arc::default()).is_ok());
        fs::write(stage.join("runtime/output.bin"), b"wrong!").unwrap();
        assert!(verify_setup(setup, &stage, vec![], &Arc::default()).is_err());
        let db = test_db();
        let c = db.lock().unwrap();
        c.execute(
            "INSERT INTO installation_jobs VALUES(?1,?2,?3)",
            params![
                "100-200",
                stage.display().to_string(),
                root.display().to_string()
            ],
        )
        .unwrap();
        recover_job(&c, "100-200", "demo-port", &stage, &root).unwrap();
        assert!(!stage.exists());
        assert!(!root.exists());
        assert!(records(&c).unwrap().is_empty());
        assert_eq!(
            fs::read(t.path().join(".port-preserved-100-200/user-data/save")).unwrap(),
            b"do not lose"
        );
        recover_job(&c, "100-200", "demo-port", &stage, &root).unwrap();
    }
    #[test]
    #[ignore = "original synthetic Windows PE; compile tests/fixtures/recipe-setup.cs and set PORT_RECIPE_SETUP_FIXTURE"]
    fn windows_multi_source_setup_real_process() {
        let exe =
            fs::read(std::env::var_os("PORT_RECIPE_SETUP_FIXTURE").expect("fixture path")).unwrap();
        let z = zip_bytes(&[("demo/demo.exe", &exe)]);
        for mode in ["success", "no-consent", "--fail", "--no-output", "--wait"] {
            let t = tempfile::tempdir().unwrap();
            let base = t.path().join("base");
            let tu = t.path().join("tu");
            let parent = t.path().join("Games");
            fs::create_dir_all(base.join("data")).unwrap();
            fs::create_dir(&tu).unwrap();
            fs::create_dir(&parent).unwrap();
            fs::write(base.join("data/main.bin"), b"base").unwrap();
            fs::write(tu.join("patch.bin"), b"prepared").unwrap();
            let mut v = multi_recipe(&z, true);
            v["setup"]["arguments"] = if mode.starts_with("--") {
                json!([{"flag":mode}])
            } else {
                json!([])
            };
            let raw = v.to_string();
            let r = parse(&raw).unwrap();
            let db = test_db();
            let status = Arc::new(Mutex::new(Status::default()));
            let mut choices = Selections::new();
            choices.insert("titleUpdate".into(), vec![tu.display().to_string()]);
            let watcher = if mode == "--wait" {
                let p = parent.clone();
                let s = status.clone();
                Some(std::thread::spawn(move || {
                    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
                    loop {
                        let started = fs::read_dir(&p)
                            .unwrap()
                            .flatten()
                            .any(|d| d.path().join("runtime/fixture-started").exists());
                        if started || std::time::Instant::now() > deadline {
                            s.lock().unwrap().cancel = true;
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }
                }))
            } else {
                None
            };
            let result = job_sources(
                &db,
                &r,
                &raw,
                base.clone(),
                parent.clone(),
                &status,
                &|_| Ok(Box::new(Cursor::new(z.clone()))),
                &choices,
                mode != "no-consent",
            );
            if let Some(w) = watcher {
                w.join().unwrap();
            }
            let recs = records(&db.lock().unwrap()).unwrap();
            if mode == "success" {
                result.unwrap();
                assert_eq!(recs.len(), 1);
                verify_installed(&recs[0], true, &Arc::default()).unwrap();
                assert_eq!(
                    fs::read(Path::new(&recs[0].root).join("user-data/save")).unwrap(),
                    b"synthetic progress"
                );
            } else {
                assert!(result.is_err(), "{mode}");
                assert!(recs.is_empty());
                if mode == "no-consent" {
                    assert_eq!(fs::read_dir(&parent).unwrap().count(), 0);
                } else {
                    let preserved = fs::read_dir(&parent)
                        .unwrap()
                        .flatten()
                        .find(|p| {
                            p.file_name()
                                .to_string_lossy()
                                .starts_with(".port-preserved-")
                        })
                        .unwrap();
                    assert_eq!(
                        fs::read(preserved.path().join("user-data/save")).unwrap(),
                        b"synthetic progress"
                    );
                    assert!(!in_use(&preserved.path()).unwrap());
                }
            }
            assert_eq!(fs::read(base.join("data/main.bin")).unwrap(), b"base");
            assert_eq!(
                db.lock()
                    .unwrap()
                    .query_row("SELECT COUNT(*) FROM installation_jobs", [], |row| row
                        .get::<_, u32>(0))
                    .unwrap(),
                0
            );
        }
    }
    /// Minimal synthetic XDVDFS image: root dir with default.xex + data.bin.
    fn synthetic_iso(title: u32) -> Vec<u8> {
        let mut img = vec![0u8; 0x10000 + 2048 * 8];
        let h = 0x10000;
        img[h..h + 20].copy_from_slice(b"MICROSOFT*XBOX*MEDIA");
        img[h + 20..h + 24].copy_from_slice(&33u32.to_le_bytes()); // root sector
        img[h + 24..h + 28].copy_from_slice(&2048u32.to_le_bytes());
        img[h + 2028..h + 2048].copy_from_slice(b"MICROSOFT*XBOX*MEDIA");
        let dir = 33 * 2048;
        img.resize(dir + 2048 * 4, 0);
        // entry 0: default.xex, right -> entry at offset 28 (edge 7*4)
        let mut put = |off: usize, right: u16, sector: u32, size: u32, name: &[u8]| {
            let e = dir + off;
            img[e + 2..e + 4].copy_from_slice(&right.to_le_bytes());
            img[e + 4..e + 8].copy_from_slice(&sector.to_le_bytes());
            img[e + 8..e + 12].copy_from_slice(&size.to_le_bytes());
            img[e + 12] = 0x20;
            img[e + 13] = name.len() as u8;
            img[e + 14..e + 14 + name.len()].copy_from_slice(name);
        };
        put(0, 7, 34, 64, b"default.xex");
        put(28, 0, 35, 4, b"data.bin");
        let x = 34 * 2048;
        img[x..x + 4].copy_from_slice(b"XEX2");
        img[x + 20..x + 24].copy_from_slice(&1u32.to_be_bytes());
        img[x + 24..x + 28].copy_from_slice(&0x40006u32.to_be_bytes());
        img[x + 28..x + 32].copy_from_slice(&32u32.to_be_bytes());
        img[x + 32 + 12..x + 32 + 16].copy_from_slice(&title.to_be_bytes());
        img[x + 32 + 18] = 1;
        img[x + 32 + 19] = 1;
        img[35 * 2048..35 * 2048 + 4].copy_from_slice(b"DATA");
        img
    }
    #[test]
    fn xbox360_iso_recipe_checks_title_and_extracts() {
        let t = tempfile::tempdir().unwrap();
        let iso = t.path().join("game.iso");
        fs::write(&iso, synthetic_iso(0x1234ABCD)).unwrap();
        let z = zip_bytes(&[("demo/demo.exe", b"MZ")]);
        let mut v: Value = serde_json::from_str(&recipe(&z)).unwrap();
        v["source"] = json!({"kind": "xbox360-iso", "titleId": "1234ABCD", "requiredFiles": ["default.xex", "data.bin"]});
        let r = parse(&v.to_string()).unwrap();
        let before = fs::read(&iso).unwrap();
        let stage = t.path().join("s");
        fs::create_dir(&stage).unwrap();
        let files = execute(&r, &iso, &stage, &Arc::default(), &move |_| {
            Ok(Box::new(Cursor::new(z.clone())))
        })
        .unwrap();
        assert!(files.iter().any(|e| e.path == "game/data.bin"));
        assert_eq!(fs::read(stage.join("game/data.bin")).unwrap(), b"DATA");
        assert_eq!(fs::read(&iso).unwrap(), before);
        v["source"]["titleId"] = json!("DEADBEEF");
        let wrong = parse(&v.to_string()).unwrap();
        assert!(inspect_source(&wrong, &iso, &Arc::default()).is_err());
    }
}
