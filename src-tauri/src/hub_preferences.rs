//! Local project IDs only; independent of installation registration and CMS.
use serde::{Deserialize, Serialize};
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    favorites: Vec<String>,
    recent: Vec<String>,
}
impl Preferences {
    fn validate(&self) -> Result<(), String> {
        for ids in [&self.favorites, &self.recent] {
            if ids.len() > 1000
                || ids.iter().any(|id| {
                    id.is_empty()
                        || id.len() > 80
                        || !id
                            .bytes()
                            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
                })
                || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
            {
                return Err("Некорректные локальные проекты".into());
            }
        }
        Ok(())
    }
}
pub fn init(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS hub_preferences(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);")
}
#[tauri::command]
pub fn load_hub_preferences(db: tauri::State<crate::Database>) -> Result<Preferences, String> {
    use rusqlite::OptionalExtension;
    let value: Option<String> =
        db.0.lock()
            .map_err(|_| "Локальные данные недоступны")?
            .query_row("SELECT value FROM hub_preferences WHERE id=1", [], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|_| "Не удалось прочитать локальные проекты")?;
    let p: Preferences = match value {
        Some(v) => serde_json::from_str(&v).map_err(|_| "Некорректные локальные проекты")?,
        None => Preferences::default(),
    };
    p.validate()?;
    Ok(p)
}
#[tauri::command]
pub fn save_hub_preferences(
    preferences: Preferences,
    db: tauri::State<crate::Database>,
) -> Result<(), String> {
    preferences.validate()?;
    let value = serde_json::to_string(&preferences)
        .map_err(|_| "Не удалось сохранить локальные проекты")?;
    db.0.lock().map_err(|_| "Локальные данные недоступны")?.execute("INSERT INTO hub_preferences(id,value) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value", [value]).map_err(|_| "Не удалось сохранить локальные проекты")?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ids_are_bounded_unique_and_never_paths() {
        assert!(Preferences {
            favorites: vec!["project-a".into()],
            recent: vec!["project-a".into()]
        }
        .validate()
        .is_ok());
        for ids in [vec!["a".into(), "a".into()], vec!["../game".into()]] {
            assert!(Preferences {
                favorites: ids,
                recent: vec![]
            }
            .validate()
            .is_err());
        }
    }
}
