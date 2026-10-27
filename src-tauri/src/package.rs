//! Read-only, bounded PS4 metadata inspection. No keys, decryption or extraction.
use serde::Serialize;
use std::{
    collections::BTreeMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    format: String,
    pub(crate) content_id: String,
    pub(crate) title_id: String,
    region: String,
    pub(crate) version: Option<String>,
    package_type: String,
    pub(crate) role: String,
    category: Option<String>,
    pfs_encrypted: Option<bool>,
    size: u64,
    compatible: bool,
    reason: String,
}
fn be32(b: &[u8], n: usize) -> u32 {
    u32::from_be_bytes(b[n..n + 4].try_into().unwrap())
}
fn be64(b: &[u8], n: usize) -> u64 {
    u64::from_be_bytes(b[n..n + 8].try_into().unwrap())
}
fn le32(b: &[u8], n: usize) -> u32 {
    u32::from_le_bytes(b[n..n + 4].try_into().unwrap())
}
fn text(b: &[u8]) -> Result<String, String> {
    let end = b.iter().position(|&b| b == 0).unwrap_or(b.len());
    let s = std::str::from_utf8(&b[..end]).map_err(|_| "Метаданные не UTF-8")?;
    if s.chars().any(char::is_control) {
        return Err("Управляющие символы в метаданных".into());
    }
    Ok(s.into())
}
fn range(start: u64, len: u64, total: u64) -> Result<(), String> {
    if start.checked_add(len).is_none_or(|end| end > total) {
        Err("Диапазон метаданных вне файла".into())
    } else {
        Ok(())
    }
}
pub fn sfo(b: &[u8]) -> Result<BTreeMap<String, String>, String> {
    if b.len() < 20 || b.len() > 1024 * 1024 || &b[..4] != b"\0PSF" {
        return Err("Некорректный PARAM.SFO".into());
    }
    let keys = le32(b, 8) as usize;
    let values = le32(b, 12) as usize;
    let count = le32(b, 16) as usize;
    if count > 256
        || 20 + count * 16 > b.len()
        || keys < 20 + count * 16
        || keys > values
        || values > b.len()
    {
        return Err("Некорректная таблица SFO".into());
    }
    let mut out = BTreeMap::new();
    for i in 0..count {
        let p = 20 + i * 16;
        let key = keys + u16::from_le_bytes(b[p..p + 2].try_into().unwrap()) as usize;
        if key >= values {
            return Err("Некорректный ключ SFO".into());
        }
        let key = text(&b[key..values])?;
        if ["APP_VER", "TITLE_ID", "CATEGORY", "TITLE", "CONTENT_ID"].contains(&key.as_str()) {
            let format = u16::from_le_bytes(b[p + 2..p + 4].try_into().unwrap());
            if format != 0x204 {
                continue;
            }
            let len = le32(b, p + 4) as usize;
            let offset = values + le32(b, p + 12) as usize;
            range(offset as u64, len as u64, b.len() as u64)?;
            if len > 1024 || len == 0 {
                return Err("Недопустимая длина SFO".into());
            }
            if out.insert(key, text(&b[offset..offset + len])?).is_some() {
                return Err("Повторный ключ SFO".into());
            }
        }
    }
    Ok(out)
}
pub fn inspect<R: Read + Seek>(r: &mut R, size: u64) -> Result<Inspection, String> {
    let mut h = [0u8; 0x5a0];
    r.read_exact(&mut h)
        .map_err(|_| "Файл слишком короткий для PS4 PKG")?;
    if &h[..4] != b"\x7fCNT" {
        return Err(
            "Это не распознанный PS4 PKG (ожидался Orbis CNT). PS3/PS5 и ZIP не поддерживаются."
                .into(),
        );
    }
    if be64(&h, 0x430) != size {
        return Err("Размер PKG не совпадает с заголовком: файл неполный или повреждён".into());
    }
    let count = be32(&h, 0x10) as u64;
    let table = be32(&h, 0x18) as u64;
    if count == 0 || count > 4096 || table < 0x5a0 {
        return Err("Недопустимая таблица PKG".into());
    }
    range(table, count * 32, size)?;
    range(be64(&h, 0x20), be64(&h, 0x28), size)?;
    range(be64(&h, 0x410), be64(&h, 0x418), size)?;
    let content = text(&h[0x40..0x70])?;
    let content_title = content
        .get(7..16)
        .filter(|s| s.starts_with("CUSA") && s.as_bytes()[4..].iter().all(u8::is_ascii_digit))
        .ok_or("Не распознан Content ID PS4")?
        .to_string();
    let region = match content.get(..2) {
        Some("EP") => "Европа (по Content ID)",
        Some("UP") => "Северная Америка (по Content ID)",
        Some("JP") => "Япония (по Content ID)",
        Some("HP") => "Азия (по Content ID)",
        _ => "Не определён",
    }
    .to_string();
    let mut meta = BTreeMap::new();
    let mut seen_sfo = false;
    for i in 0..count {
        r.seek(SeekFrom::Start(table + i * 32))
            .map_err(|e| e.to_string())?;
        let mut e = [0u8; 32];
        r.read_exact(&mut e).map_err(|e| e.to_string())?;
        let offset = be32(&e, 16) as u64;
        let len = be32(&e, 20) as u64;
        range(offset, len, size)?;
        if be32(&e, 0) == 0x1000 {
            if seen_sfo || len > 1024 * 1024 {
                return Err("Недопустимая запись SFO".into());
            }
            seen_sfo = true;
            if be32(&e, 8) & 0x80000000 != 0 {
                continue;
            }
            r.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
            let mut data = vec![0; len as usize];
            r.read_exact(&mut data).map_err(|e| e.to_string())?;
            meta = sfo(&data)?;
        }
    }
    if meta.get("TITLE_ID").is_some_and(|s| s != &content_title) {
        return Err("TITLE_ID и Content ID не совпадают".into());
    }
    if meta.get("CONTENT_ID").is_some_and(|s| s != &content) {
        return Err("CONTENT_ID в SFO и заголовке не совпадают".into());
    }
    if meta
        .get("APP_VER")
        .is_some_and(|v| version_number(v).is_none())
    {
        return Err("Некорректная версия APP_VER".into());
    }
    let flags = be32(&h, 0x78);
    let patch = flags & 0x60100000 != 0;
    let delta = flags & 0x41000000 == 0x41000000 || be32(&h, 0x74) == 0x1e;
    let category = meta.remove("CATEGORY");
    let role = match (be32(&h, 0x74), category.as_deref(), patch, delta) {
        (_, _, _, true) => "delta",
        (0x1a, Some("gd"), false, false) => "base",
        (0x1a, Some("gp"), true, false) => "update",
        (0x1a, Some("gp"), false, false) | (0x1a, Some("gd"), true, false) => {
            return Err("CATEGORY в SFO противоречит флагам типа пакета".into());
        }
        _ => "unknown",
    };
    let pfs_offset = be64(&h, 0x410);
    let pfs_size = be64(&h, 0x418);
    let pfs_encrypted = if pfs_size >= 0x400 {
        r.seek(SeekFrom::Start(pfs_offset))
            .map_err(|e| e.to_string())?;
        let mut header = [0u8; 0x400];
        r.read_exact(&mut header).map_err(|e| e.to_string())?;
        if u64::from_le_bytes(header[..8].try_into().unwrap()) != 1
            || u64::from_le_bytes(header[8..16].try_into().unwrap()) != 20130315
        {
            return Err("Некорректный заголовок PFS".into());
        }
        let mode = u16::from_le_bytes(header[0x1c..0x1e].try_into().unwrap());
        Some(mode & 4 != 0)
    } else {
        None
    };
    let kind = match be32(&h, 0x74) {
        0x1a => {
            if patch {
                "PS4 обновление / patch"
            } else {
                "PS4 приложение"
            }
        }
        0x1b | 0x1c => "PS4 дополнение",
        0x1e => "PS4 delta patch",
        _ => "Неизвестный тип CNT",
    };
    let reason = if content_title != "CUSA03173" {
        "Этот Title ID не входит в проверяемый профиль Bloodborne CUSA03173."
    } else {
        "Title ID соответствует профилю Bloodborne. Это не подтверждает подлинность, целостность или доступность содержимого. Автоматическое извлечение зашифрованного PFS не поддерживается. Нужна собственная подготовленная расшифрованная папка игры; ключи и обход DRM не предоставляются."
    };
    Ok(Inspection {
        format: "PS4 Orbis CNT · проверка метаданных".into(),
        content_id: content,
        title_id: content_title,
        region,
        version: meta.remove("APP_VER"),
        package_type: kind.into(),
        role: role.into(),
        category,
        pfs_encrypted,
        size,
        compatible: false,
        reason: reason.into(),
    })
}
fn version_number(s: &str) -> Option<u32> {
    let b = s.as_bytes();
    if b.len() != 5 || b[2] != b'.' || ![b[0], b[1], b[3], b[4]].iter().all(u8::is_ascii_digit) {
        return None;
    }
    Some(s[..2].parse::<u32>().ok()? * 100 + s[3..].parse::<u32>().ok()?)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageItem {
    file_name: String,
    inspection: Option<Inspection>,
    error: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    items: Vec<PackageItem>,
    metadata_compatible: bool,
    installable: bool,
    issues: Vec<String>,
    summary: String,
}
fn assess(items: Vec<PackageItem>) -> Selection {
    let mut issues = Vec::new();
    let mut bases = Vec::new();
    let mut updates = Vec::new();
    for item in &items {
        if let Some(e) = &item.error {
            issues.push(format!("{}: {e}", item.file_name));
        }
        if let Some(p) = &item.inspection {
            if p.title_id != "CUSA03173" {
                issues.push("Чужой Title ID: нужен Bloodborne CUSA03173.".into());
            }
            if p.version.is_none() {
                issues.push("APP_VER недоступна: версию нельзя подтвердить.".into());
            }
            match p.role.as_str() {
                "base" => bases.push(p),
                "update" => updates.push(p),
                "delta" => issues.push("Delta patch требует отдельного алгоритма применения; такой пакет не поддерживается.".into()),
                _ => issues.push("Тип пакета не подтверждён согласованными CATEGORY и флагами CNT.".into()),
            }
        }
    }
    if bases.len() != 1 {
        issues.push(
            "Выберите ровно один основной PKG; обновление можно выбрать вместе с ним.".into(),
        );
    }
    if updates.len() > 1 {
        issues.push("Выбрано несколько конфликтующих обновлений. Оставьте одно.".into());
    }
    if let (Some(base), Some(update)) = (bases.first(), updates.first()) {
        if base.content_id != update.content_id || base.title_id != update.title_id {
            issues.push("Обновление и основная игра имеют разные Content ID / Title ID.".into());
        }
        if let (Some(b), Some(u)) = (&base.version, &update.version) {
            if version_number(u) <= version_number(b) {
                issues.push("Версия обновления должна быть выше версии основной игры.".into());
            }
        }
        if update.version.as_deref() != Some("01.09") {
            issues.push("Для этого профиля исследовано только обновление 1.09; другое обновление не подтверждено.".into());
        }
    }
    let metadata_compatible = issues.is_empty();
    let summary = if !metadata_compatible {
        "Выбор требует исправления. Исходные файлы сохранены."
    } else if updates.is_empty() {
        "Основная игра распознана. Обновление необязательно: upstream описывает версии без 1.09 при 30 FPS, без community patches. Метаданные не доказывают готовность игровых файлов."
    } else {
        "Основная игра и обновление 1.09 согласованы по метаданным. Это не подтверждает доступность содержимого или успешное применение патча."
    }.into();
    Selection {
        items,
        metadata_compatible,
        installable: false,
        issues,
        summary,
    }
}
pub(crate) fn inspect_file(path: &str) -> Result<Inspection, String> {
    let p = Path::new(path);
    regular_file(p)?;
    let mut file = File::open(p).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    inspect(&mut file, size)
}
#[tauri::command]
pub async fn inspect_packages(paths: Vec<String>) -> Result<Selection, String> {
    if paths.is_empty() || paths.len() > 8 {
        return Err("Выберите от одного до восьми PKG.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut seen = std::collections::HashSet::new();
        let mut items = Vec::new();
        for path in paths {
            let p = Path::new(&path);
            let name = p
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let result = if !seen.insert(path.to_lowercase()) {
                Err("Этот файл выбран повторно".into())
            } else {
                inspect_file(&path)
            };
            let (inspection, error) = match result {
                Ok(p) => (Some(p), None),
                Err(e) => (None, Some(e)),
            };
            items.push(PackageItem {
                file_name: name,
                inspection,
                error,
            });
        }
        assess(items)
    })
    .await
    .map_err(|e| e.to_string())
}
pub fn regular_file(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("Нужен абсолютный локальный путь".into());
    }
    for p in path.ancestors() {
        let m = std::fs::symlink_metadata(p).map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if m.file_attributes() & 0x400 != 0 {
                return Err("Reparse points не разрешены".into());
            }
        }
        if m.file_type().is_symlink() {
            return Err("Символические ссылки не разрешены".into());
        }
    }
    if !path.is_file() {
        return Err("Выберите обычный файл".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn inspect_package(path: String) -> Result<Inspection, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_file(&path))
        .await
        .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    fn pkg() -> Vec<u8> {
        let mut b = vec![0; 0x600];
        b[..4].copy_from_slice(b"\x7fCNT");
        b[0x10..0x14].copy_from_slice(&1u32.to_be_bytes());
        b[0x18..0x1c].copy_from_slice(&0x5a0u32.to_be_bytes());
        let id = b"EP9000-CUSA03173_00-BLOODBORNE000000";
        b[0x40..0x40 + id.len()].copy_from_slice(id);
        b[0x74..0x78].copy_from_slice(&0x1au32.to_be_bytes());
        b[0x430..0x438].copy_from_slice(&0x600u64.to_be_bytes());
        b
    }
    fn component(category: &str, version: &str, flags: u32, title: &str) -> Vec<u8> {
        let content = format!("EP9000-{title}_00-BLOODBORNE0000EU");
        let fields = [
            ("APP_VER", version),
            ("TITLE_ID", title),
            ("CATEGORY", category),
            ("CONTENT_ID", &content),
        ];
        let mut keys = Vec::new();
        let mut values = Vec::new();
        let mut sfo = vec![0u8; 20 + fields.len() * 16];
        sfo[..4].copy_from_slice(b"\0PSF");
        let key_start = sfo.len() as u32;
        sfo[8..12].copy_from_slice(&key_start.to_le_bytes());
        sfo[16..20].copy_from_slice(&(fields.len() as u32).to_le_bytes());
        for (i, (key, value)) in fields.iter().enumerate() {
            let p = 20 + i * 16;
            sfo[p..p + 2].copy_from_slice(&(keys.len() as u16).to_le_bytes());
            sfo[p + 2..p + 4].copy_from_slice(&0x204u16.to_le_bytes());
            sfo[p + 4..p + 8].copy_from_slice(&(value.len() as u32 + 1).to_le_bytes());
            sfo[p + 12..p + 16].copy_from_slice(&(values.len() as u32).to_le_bytes());
            keys.extend(key.as_bytes());
            keys.push(0);
            values.extend(value.as_bytes());
            values.push(0);
        }
        sfo[12..16].copy_from_slice(&(key_start + keys.len() as u32).to_le_bytes());
        sfo.extend(keys);
        sfo.extend(values);
        let mut b = pkg();
        b[0x40..0x70].fill(0);
        b[0x40..0x40 + content.len()].copy_from_slice(content.as_bytes());
        b[0x78..0x7c].copy_from_slice(&flags.to_be_bytes());
        b[0x5a0..0x5a4].copy_from_slice(&0x1000u32.to_be_bytes());
        let sfo_offset = b.len() as u32;
        b[0x5b0..0x5b4].copy_from_slice(&sfo_offset.to_be_bytes());
        b[0x5b4..0x5b8].copy_from_slice(&(sfo.len() as u32).to_be_bytes());
        b.extend(sfo);
        let offset = b.len() as u64;
        b[0x410..0x418].copy_from_slice(&offset.to_be_bytes());
        b[0x418..0x420].copy_from_slice(&0x400u64.to_be_bytes());
        let mut pfs = vec![0u8; 0x400];
        pfs[..8].copy_from_slice(&1u64.to_le_bytes());
        pfs[8..16].copy_from_slice(&20130315u64.to_le_bytes());
        pfs[0x1c..0x1e].copy_from_slice(&0xdu16.to_le_bytes());
        b.extend(pfs);
        let size = b.len() as u64;
        b[0x430..0x438].copy_from_slice(&size.to_be_bytes());
        b
    }
    fn item(bytes: &[u8]) -> PackageItem {
        PackageItem {
            file_name: "misleading-name.pkg".into(),
            inspection: Some(inspect(&mut Cursor::new(bytes), bytes.len() as u64).unwrap()),
            error: None,
        }
    }
    #[test]
    fn one_base_does_not_require_update_and_encryption_is_reported() {
        let b = component("gd", "01.00", 0x0a000000, "CUSA03173");
        let result = assess(vec![item(&b)]);
        assert!(result.metadata_compatible);
        assert!(!result.installable);
        assert!(result.summary.contains("30 FPS"));
        assert_eq!(
            result.items[0].inspection.as_ref().unwrap().pfs_encrypted,
            Some(true)
        );
    }
    #[test]
    fn identifies_base_and_update_in_either_order_without_filename_heuristics() {
        let base = component("gd", "01.00", 0x0a000000, "CUSA03173");
        let update = component("gp", "01.09", 0x62100000, "CUSA03173");
        for items in [
            vec![item(&base), item(&update)],
            vec![item(&update), item(&base)],
        ] {
            let result = assess(items);
            assert!(result.metadata_compatible);
            assert!(!result.installable);
            assert!(result.issues.is_empty());
        }
    }
    #[test]
    fn conflicts_foreign_updates_missing_base_and_unknown_types_are_blocked() {
        let base = component("gd", "01.00", 0x0a000000, "CUSA03173");
        let update = component("gp", "01.09", 0x62100000, "CUSA03173");
        let foreign = component("gp", "01.09", 0x62100000, "CUSA03174");
        let delta = component("gp", "01.09", 0x41000000, "CUSA03173");
        let older = component("gp", "01.00", 0x62100000, "CUSA03173");
        for items in [
            vec![item(&base), item(&foreign)],
            vec![item(&base), item(&update), item(&update)],
            vec![item(&base), item(&base)],
            vec![item(&update)],
            vec![item(&pkg())],
            vec![item(&base), item(&delta)],
            vec![item(&base), item(&older)],
        ] {
            let result = assess(items);
            assert!(!result.metadata_compatible);
            assert!(!result.installable);
            assert!(!result.issues.is_empty());
        }
        let mut mismatched = item(&update);
        mismatched.inspection.as_mut().unwrap().content_id.push('X');
        assert!(!assess(vec![item(&base), mismatched]).metadata_compatible);
        let bad = PackageItem {
            file_name: "broken.pkg".into(),
            inspection: None,
            error: Some("Повреждён".into()),
        };
        assert!(!assess(vec![item(&base), bad]).metadata_compatible);
    }
    #[test]
    fn inconsistent_type_invalid_version_and_pfs_header_are_rejected() {
        for (category, version, flags) in [
            ("gp", "01.09", 0),
            ("gd", "01.00", 0x62100000),
            ("gd", "1.0", 0),
        ] {
            let b = component(category, version, flags, "CUSA03173");
            assert!(inspect(&mut Cursor::new(&b), b.len() as u64).is_err());
        }
        let mut b = component("gd", "01.00", 0, "CUSA03173");
        let offset = be64(&b, 0x410) as usize;
        b[offset] = 0;
        assert!(inspect(&mut Cursor::new(&b), b.len() as u64).is_err());
    }
    #[test]
    fn recognizes_candidate_without_claiming_extractability() {
        let b = pkg();
        let info = inspect(&mut Cursor::new(&b), b.len() as u64).unwrap();
        assert_eq!(info.title_id, "CUSA03173");
        assert!(!info.compatible);
        assert!(info.version.is_none());
    }
    #[test]
    fn rejects_truncated_wrong_magic_and_out_of_bounds() {
        assert!(inspect(&mut Cursor::new([0; 4]), 4).is_err());
        let mut b = pkg();
        b[0] = 0;
        assert!(inspect(&mut Cursor::new(&b), b.len() as u64).is_err());
        let mut b = pkg();
        b[0x18..0x1c].copy_from_slice(&u32::MAX.to_be_bytes());
        assert!(inspect(&mut Cursor::new(&b), b.len() as u64).is_err());
        let mut b = pkg();
        b[0x430..0x438].copy_from_slice(&u64::MAX.to_be_bytes());
        assert!(inspect(&mut Cursor::new(&b), b.len() as u64).is_err());
    }
    #[test]
    fn bounded_sfo_rejects_counts_and_offsets() {
        let mut b = vec![0; 24];
        b[..4].copy_from_slice(b"\0PSF");
        b[16..20].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(sfo(&b).is_err());
    }
    #[test]
    fn reads_available_version_and_rejects_conflicting_title() {
        let keys = b"APP_VER\0TITLE_ID\0";
        let values = b"01.09\0CUSA03173\0";
        let mut b = vec![0; 52];
        b[..4].copy_from_slice(b"\0PSF");
        b[8..12].copy_from_slice(&52u32.to_le_bytes());
        b[12..16].copy_from_slice(&(52u32 + keys.len() as u32).to_le_bytes());
        b[16..20].copy_from_slice(&2u32.to_le_bytes());
        for (p, key_offset, len, value_offset) in [(20, 0u16, 6u32, 0u32), (36, 8, 10, 6)] {
            b[p..p + 2].copy_from_slice(&key_offset.to_le_bytes());
            b[p + 2..p + 4].copy_from_slice(&0x204u16.to_le_bytes());
            b[p + 4..p + 8].copy_from_slice(&len.to_le_bytes());
            b[p + 8..p + 12].copy_from_slice(&len.to_le_bytes());
            b[p + 12..p + 16].copy_from_slice(&value_offset.to_le_bytes());
        }
        b.extend(keys);
        b.extend(values);
        let meta = sfo(&b).unwrap();
        assert_eq!(meta["APP_VER"], "01.09");
        assert_eq!(meta["TITLE_ID"], "CUSA03173");
        let mut pkg = pkg();
        let length = b.len() as u32;
        let offset = pkg.len() as u32;
        pkg.extend(b);
        let total = pkg.len() as u64;
        pkg[0x430..0x438].copy_from_slice(&total.to_be_bytes());
        pkg[0x5a0..0x5a4].copy_from_slice(&0x1000u32.to_be_bytes());
        pkg[0x5b0..0x5b4].copy_from_slice(&offset.to_be_bytes());
        pkg[0x5b4..0x5b8].copy_from_slice(&length.to_be_bytes());
        assert_eq!(
            inspect(&mut Cursor::new(&pkg), total)
                .unwrap()
                .version
                .as_deref(),
            Some("01.09")
        );
        let mut duplicate = pkg.clone();
        duplicate[0x10..0x14].copy_from_slice(&2u32.to_be_bytes());
        duplicate.copy_within(0x5a0..0x5c0, 0x5c0);
        assert!(inspect(&mut Cursor::new(&duplicate), total).is_err());
        *pkg.last_mut().unwrap() = 0;
        let i = pkg.len() - 2;
        pkg[i] = b'4';
        assert!(inspect(&mut Cursor::new(&pkg), total).is_err());
    }
    #[test]
    fn malformed_inputs_never_panic() {
        for size in [0, 1, 19, 20, 100, 0x5a0, 0x600] {
            for byte in [0, 1, 127, 255] {
                let b = vec![byte; size];
                let _ = sfo(&b);
                let _ = inspect(&mut Cursor::new(&b), size as u64);
            }
        }
    }
}
