#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adapters;
mod catalog;
mod download;
mod install;
mod media;
mod package;
mod pkg_worker;
mod shortcuts;
mod updater;
#[cfg(windows)]
mod windows_identity;
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
struct InstanceLock {
    _lock: std::fs::File,
}
fn init(conn: &Connection) -> rusqlite::Result<()> {
    let version: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version > 4 {
        return Err(rusqlite::Error::InvalidQuery);
    }
    conn.execute_batch("PRAGMA journal_mode=WAL; BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS installations(id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS installation_jobs(id TEXT PRIMARY KEY, staging TEXT NOT NULL, root TEXT NOT NULL); CREATE TABLE IF NOT EXISTS update_jobs(id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS removal_jobs(id TEXT PRIMARY KEY); PRAGMA user_version=4; COMMIT;")
}
// Corrupt databases are quarantined intact; no destructive reset or game scan.
fn open_database(path: &std::path::Path) -> Result<Connection, Box<dyn std::error::Error>> {
    let conn = Connection::open(path)?;
    let check = conn.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0));
    let corrupt = match &check {
        Ok(result) => result != "ok",
        Err(rusqlite::Error::SqliteFailure(code, _)) => matches!(
            code.code,
            rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase
        ),
        Err(_) => false,
    };
    if !corrupt {
        check?;
        return Ok(conn);
    }
    drop(conn);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_nanos();
    for suffix in ["", "-wal", "-shm"] {
        let file = std::path::PathBuf::from(format!("{}{suffix}", path.display()));
        if file.exists() {
            let backup =
                std::path::PathBuf::from(format!("{}.corrupt-{stamp}{suffix}", path.display()));
            download::safe_existing(&file).map_err(std::io::Error::other)?;
            if backup.exists() {
                return Err("Database backup collision".into());
            }
            std::fs::rename(file, backup)?;
        }
    }
    Ok(Connection::open(path)?)
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
    let context = tauri::generate_context!();
    #[cfg(windows)]
    windows_identity::set(&context.config().identifier).expect("PORT taskbar identity");
    tauri::Builder::default()
        .manage(shortcuts::LaunchRequest::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            shortcuts::queue(app, &args);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(download::Download::default())
        .manage(install::Installer::default())
        .manage(catalog::SyncLock::default())
        .manage(updater::State::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            download::safe_existing(&dir).map_err(std::io::Error::other)?;
            download::safe_existing(&dir.join("port-session.lock"))
                .map_err(std::io::Error::other)?;
            download::safe_existing(&dir.join("port.db")).map_err(std::io::Error::other)?;
            let lock = std::fs::OpenOptions::new()
                .create(true)
                .truncate(false)
                .read(true)
                .write(true)
                .open(dir.join("port-session.lock"))?;
            fs2::FileExt::try_lock_exclusive(&lock)?;
            app.manage(InstanceLock { _lock: lock });
            let conn = open_database(&dir.join("port.db"))?;
            init(&conn)?;
            catalog::init(&conn)?;
            if let Err(error) = install::recover(&conn) {
                app.state::<install::Installer>().recovery_error(&error);
            }
            app.manage(Database(Mutex::new(conn)));
            shortcuts::queue(app.handle(), &std::env::args().collect::<Vec<_>>());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = updater::check(&handle).await;
                let _ = updater::previous_attempt(&handle);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            reset_settings,
            updater::updater_status,
            updater::check_app_update,
            updater::download_app_update,
            updater::cancel_app_update,
            updater::install_app_update,
            shortcuts::take_launch_request,
            install::experience::default_install_parent,
            install::experience::check_install_destination,
            install::experience::open_installation_folder,
            catalog::load_catalog,
            catalog::configure_catalog,
            catalog::sync_catalog,
            media::load_media,
            media::save_media,
            package::inspect_package,
            package::inspect_packages,
            download::download_status,
            download::start_download,
            download::control_download,
            install::inspect_game_folder,
            install::skate3::inspect_skate3_iso,
            install::skate3::install_skate3,
            install::install_status,
            install::cancel_install,
            install::import_game_folder,
            install::prepare_runtime,
            install::install_packages,
            install::update::update_installation,
            pkg_worker::pkg_install_available,
            install::list_installations,
            install::management::restore_installation,
            install::running_installations,
            install::verify_installation,
            install::launch_installation,
            install::launch_status,
            install::remove_installation
        ])
        .run(context)
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
        // Schema v1 -> v2 migration must preserve the user's settings.
        init(&conn).unwrap();
        assert_eq!(read(&conn).unwrap(), s);
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            4
        );
        conn.execute("DELETE FROM settings", []).unwrap();
        assert_eq!(read(&conn).unwrap(), Settings::default());
    }
    #[test]
    fn database_migration_future_guard_and_corruption_preservation() {
        let t = tempfile::tempdir().unwrap();
        let path = t.path().join("port.db");
        std::fs::write(&path, b"corrupt original bytes").unwrap();
        let c = open_database(&path).unwrap();
        init(&c).unwrap();
        drop(c);
        assert!(std::fs::read_dir(t.path()).unwrap().any(
            |e| std::fs::read(e.unwrap().path()).is_ok_and(|b| b == b"corrupt original bytes")
        ));
        let c = open_database(&path).unwrap();
        c.execute("INSERT INTO installations VALUES('old','unchanged')", [])
            .unwrap();
        c.execute_batch("PRAGMA user_version=3").unwrap();
        init(&c).unwrap();
        assert_eq!(
            c.query_row("SELECT value FROM installations", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "unchanged"
        );
        c.execute_batch("PRAGMA user_version=99").unwrap();
        assert!(init(&c).is_err());
        assert_eq!(
            c.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            99
        );
    }
    #[test]
    fn rejects_invalid_settings() {
        let mut s = Settings {
            theme: "invalid".into(),
            ..Settings::default()
        };
        assert!(s.validate().is_err());
        s.theme = "dark".into();
        s.install_dir = "relative/path".into();
        assert!(s.validate().is_err());
    }
}
