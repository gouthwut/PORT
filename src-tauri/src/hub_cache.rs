//! Bounded public v2 metadata only; independent of installation schema and files.
use rusqlite::{Connection, OptionalExtension};
const LIMIT: usize = 8 * 1024 * 1024;
const SOURCE: &str = "https://port-catalog-cms.port-catalog-cms.workers.dev";

pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS hub_catalog_cache(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);")
}
fn validate(value: &str) -> Result<(), String> {
    if value.len() > LIMIT {
        return Err("Каталог превышает лимит локального кэша".into());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(value).map_err(|_| "Некорректный локальный каталог")?;
    if parsed["format"] != 1 || parsed["source"] != SOURCE || !parsed["snapshot"].is_object() {
        return Err("Некорректный локальный каталог".into());
    }
    Ok(())
}
fn load(conn: &Connection) -> Result<Option<String>, String> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM hub_catalog_cache WHERE id=1 AND length(CAST(value AS BLOB))<=?1",
            [LIMIT as i64],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Не удалось прочитать сохранённый каталог")?;
    if let Some(ref v) = value {
        validate(v)?;
    }
    Ok(value)
}
fn save(conn: &Connection, value: &str) -> Result<(), String> {
    validate(value)?;
    conn.execute("INSERT INTO hub_catalog_cache VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value", [value])
        .map_err(|_| "Не удалось сохранить каталог")?;
    Ok(())
}
#[tauri::command]
pub fn load_hub_catalog_cache(db: tauri::State<crate::Database>) -> Result<Option<String>, String> {
    load(&*db.0.lock().map_err(|_| "Локальные данные недоступны")?)
}
#[tauri::command]
pub fn save_hub_catalog_cache(
    value: String,
    db: tauri::State<crate::Database>,
) -> Result<(), String> {
    save(
        &*db.0.lock().map_err(|_| "Локальные данные недоступны")?,
        &value,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cache_survives_restart_without_changing_installations_or_schema_version() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("cache.sqlite");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA user_version=4; CREATE TABLE installations(id TEXT PRIMARY KEY, value TEXT); INSERT INTO installations VALUES('retained','exact existing data');").unwrap();
        init(&conn).unwrap();
        let value = format!(
            r#"{{"format":1,"source":"{SOURCE}","savedAt":1,"snapshot":{{"projects":[],"games":[]}}}}"#
        );
        save(&conn, &value).unwrap();
        assert!(save(&conn, &value.replace(SOURCE, "https://foreign.invalid")).is_err());
        assert!(save(&conn, &"x".repeat(LIMIT + 1)).is_err());
        drop(conn);
        let conn = Connection::open(&path).unwrap();
        init(&conn).unwrap();
        assert_eq!(load(&conn).unwrap(), Some(value));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            4
        );
        assert_eq!(
            conn.query_row(
                "SELECT value FROM installations WHERE id='retained'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "exact existing data"
        );
        conn.execute("UPDATE hub_catalog_cache SET value='{'", [])
            .unwrap();
        assert!(load(&conn).is_err());
    }
}
