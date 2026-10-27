#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    theme: String,
    install_dir: String,
    reduced_motion: bool,
    compact_cards: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            install_dir: String::new(),
            reduced_motion: false,
            compact_cards: false,
        }
    }
}
impl Settings {
    fn validate(&self) -> Result<(), String> {
        if !["dark", "system"].contains(&self.theme.as_str()) {
            return Err("Недопустимая тема".into());
        }
        if self.install_dir.len() > 2048 || self.install_dir.chars().any(char::is_control) {
            return Err("Недопустимый путь".into());
        }
        if !self.install_dir.is_empty() && !std::path::Path::new(&self.install_dir).is_absolute() {
            return Err("Нужен абсолютный путь".into());
        }
        Ok(())
    }
}
struct Database(Mutex<Connection>);
fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); PRAGMA user_version=1;")
}
fn read(conn: &Connection) -> Result<Settings, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE id=1")
        .map_err(|e| e.to_string())?;
    let value = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .next();
    match value {
        Some(v) => {
            let settings: Settings =
                serde_json::from_str(&v.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            settings.validate()?;
            Ok(settings)
        }
        None => Ok(Settings::default()),
    }
}
#[tauri::command]
fn load_settings(db: tauri::State<Database>) -> Result<Settings, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    read(&conn)
}
#[tauri::command]
fn save_settings(settings: Settings, db: tauri::State<Database>) -> Result<(), String> {
    settings.validate()?;
    let json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    db.0.lock().map_err(|e|e.to_string())?.execute("INSERT INTO settings(id,value) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value", params![json]).map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
fn reset_settings(db: tauri::State<Database>) -> Result<Settings, String> {
    db.0.lock()
        .map_err(|e| e.to_string())?
        .execute("DELETE FROM settings WHERE id=1", [])
        .map_err(|e| e.to_string())?;
    Ok(Settings::default())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("port.db"))?;
            init(&conn)?;
            app.manage(Database(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            reset_settings
        ])
        .run(tauri::generate_context!())
        .expect("PORT failed to start");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_roundtrip_and_reset() {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        assert_eq!(read(&conn).unwrap(), Settings::default());
        let s = Settings {
            reduced_motion: true,
            ..Settings::default()
        };
        conn.execute(
            "INSERT INTO settings VALUES(1,?1)",
            [serde_json::to_string(&s).unwrap()],
        )
        .unwrap();
        assert_eq!(read(&conn).unwrap(), s);
        conn.execute("DELETE FROM settings", []).unwrap();
        assert_eq!(read(&conn).unwrap(), Settings::default());
    }
    #[test]
    fn rejects_invalid_settings() {
        let mut s = Settings::default();
        s.theme = "invalid".into();
        assert!(s.validate().is_err());
        s.theme = "dark".into();
        s.install_dir = "relative/path".into();
        assert!(s.validate().is_err());
    }
}
