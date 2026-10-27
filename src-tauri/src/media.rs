use crate::Database;
use serde::{Deserialize, Serialize};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Media {
    hero: String,
    cover: String,
    banner: String,
    gallery: Vec<String>,
}
impl Media {
    fn validate(&self) -> Result<(), String> {
        if self.gallery.len() > 10 {
            return Err("Не более 10 изображений".into());
        }
        for s in [&self.hero, &self.cover, &self.banner]
            .into_iter()
            .chain(self.gallery.iter())
        {
            if s.len() > 900_000
                || (!s.is_empty()
                    && (s.len() <= 23
                        || !s.starts_with("data:image/webp;base64,")
                        || !s[23..]
                            .bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"+/=".contains(&b))))
            {
                return Err("Некорректное локальное изображение".into());
            }
        }
        Ok(())
    }
}
#[tauri::command]
pub fn load_media(db: tauri::State<Database>) -> Result<Media, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let raw: Option<String> = conn
        .query_row("SELECT value FROM media WHERE id=1", [], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    let media: Media = match raw {
        Some(s) => serde_json::from_str(&s).map_err(|e| e.to_string())?,
        None => Media::default(),
    };
    media.validate()?;
    Ok(media)
}
use rusqlite::OptionalExtension;
#[tauri::command]
pub fn save_media(media: Media, db: tauri::State<Database>) -> Result<(), String> {
    media.validate()?;
    db.0.lock().map_err(|e| e.to_string())?.execute("INSERT INTO media(id,value) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value", [serde_json::to_string(&media).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
    Ok(())
}
