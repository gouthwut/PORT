//! Published metadata only. No catalog field reaches an installer, shell or runtime.
use crate::Database;
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{blocking::Client, redirect::Policy, Url};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const JSON_LIMIT: usize = 1024 * 1024;
const IMAGE_LIMIT: usize = 1024 * 1024;
const CACHE_LIMIT: usize = 36 * 1024 * 1024;
const TOTAL_IMAGES: usize = 24 * 1024 * 1024;
const SCHEMA: &str = include_str!("../../docs/catalog.schema.json");
#[cfg(test)]
const DEMO: &str = include_str!("../../fixtures/catalog/published-v1.json");
const DEFAULT_ENDPOINT_JSON: &str = include_str!("../../src/catalog-endpoint.json");
fn default_endpoint() -> String {
    serde_json::from_str(DEFAULT_ENDPOINT_JSON).expect("compiled catalog endpoint")
}
#[derive(Default, Clone)]
pub struct SyncLock(Arc<Mutex<()>>);
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    endpoint: String,
    catalog: Value,
    images: HashMap<String, String>,
    known: Vec<Value>,
    synced_at: Option<u64>,
    source: String,
    warning: String,
}
pub fn init(c: &Connection) -> rusqlite::Result<()> {
    // Independent cache/config: installation schema and records remain untouched.
    c.execute_batch("CREATE TABLE IF NOT EXISTS catalog_config(id INTEGER PRIMARY KEY CHECK(id=1),endpoint TEXT NOT NULL); CREATE TABLE IF NOT EXISTS catalog_cache(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS catalog_known(id TEXT PRIMARY KEY,value TEXT NOT NULL);")
}
fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let [a, b, c, _] = v.octets();
            !(v.is_private()
                || v.is_loopback()
                || v.is_link_local()
                || v.is_multicast()
                || v.is_broadcast()
                || v.is_documentation()
                || a == 0
                || a >= 240
                || (a == 100 && (64..=127).contains(&b))
                || (a == 198 && (b == 18 || b == 19))
                || (a == 192 && b == 0 && c == 0))
        }
        // Only global unicast; exclude documentation, mapped IPv4 and special ranges.
        IpAddr::V6(v) => {
            (v.segments()[0] & 0xe000) == 0x2000
                && v.segments()[0] != 0x2001
                && v.segments()[0] != 0x2002
                && v.segments()[0] != 0x3fff
        }
    }
}
pub fn https(raw: &str) -> Result<Url, String> {
    let u = Url::parse(raw).map_err(|_| "Invalid HTTPS URL")?;
    if raw.len() > 2048
        || raw.chars().any(|c| c.is_control() || c.is_whitespace())
        || raw.contains('\\')
        || u.scheme() != "https"
        || !u.username().is_empty()
        || u.password().is_some()
        || u.fragment().is_some()
        || u.port_or_known_default() != Some(443)
    {
        return Err("Only public HTTPS URLs on port 443, without credentials or fragments".into());
    }
    let host = u.host_str().ok_or("Missing HTTPS host")?;
    if host.parse::<IpAddr>().is_ok() || host.contains(':') {
        return Err("Use a public DNS host, not an IP literal".into());
    }
    if !host.contains('.')
        || host.ends_with('.')
        || [
            "localhost",
            ".localhost",
            ".local",
            ".internal",
            ".test",
            ".invalid",
            ".example",
        ]
        .iter()
        .any(|s| host.ends_with(s))
    {
        return Err("Public DNS host required".into());
    }
    Ok(u)
}
fn format_valid(s: &str, format: &str) -> bool {
    match format {
        "id" => {
            !s.is_empty()
                && s.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                && s.as_bytes()[0].is_ascii_alphanumeric()
        }
        "sha256" => {
            s.len() == 64
                && s.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        }
        "https" => https(s).is_ok(),
        "github" => https(s).is_ok_and(|u| {
            u.host_str() == Some("github.com")
                && u.query().is_none()
                && u.path_segments().is_some_and(|p| {
                    let p: Vec<_> = p.collect();
                    p.len() == 2
                        && p.iter().all(|s| {
                            !s.is_empty()
                                && s.bytes()
                                    .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
                        })
                })
        }),
        "timestamp" => {
            s.len() == 20
                && s.ends_with('Z')
                && s.bytes().enumerate().all(|(i, b)| match i {
                    4 | 7 => b == b'-',
                    10 => b == b'T',
                    13 | 16 => b == b':',
                    19 => b == b'Z',
                    _ => b.is_ascii_digit(),
                })
        }
        _ => false,
    }
}
// Small, fail-closed interpreter for the deliberately restricted shared JSON schema.
fn validate_node(v: &Value, s: &Value) -> Result<(), String> {
    let bad = || "Catalog schema validation failed".to_string();
    if s.get("const").is_some_and(|c| c != v)
        || s.get("enum")
            .is_some_and(|e| !e.as_array().is_some_and(|e| e.contains(v)))
    {
        return Err(bad());
    }
    match s["type"].as_str() {
        Some("object") => {
            let o = v.as_object().ok_or_else(bad)?;
            let p = s["properties"].as_object().ok_or_else(bad)?;
            if o.keys().any(|k| !p.contains_key(k))
                || s["required"]
                    .as_array()
                    .ok_or_else(bad)?
                    .iter()
                    .any(|k| !o.contains_key(k.as_str().unwrap_or("")))
            {
                return Err(bad());
            }
            for (k, v) in o {
                validate_node(v, &p[k])?;
            }
        }
        Some("array") => {
            let a = v.as_array().ok_or_else(bad)?;
            if a.len() > s["maxItems"].as_u64().ok_or_else(bad)? as usize {
                return Err(bad());
            }
            for v in a {
                validate_node(v, &s["items"])?;
            }
        }
        Some("string") => {
            let v = v.as_str().ok_or_else(bad)?;
            let n = v.chars().count();
            if n < s["minLength"].as_u64().unwrap_or(0) as usize
                || n > s["maxLength"].as_u64().ok_or_else(bad)? as usize
                || v.chars().any(|c| c.is_control() && c != '\n')
                || s["format"].as_str().is_some_and(|f| !format_valid(v, f))
            {
                return Err(bad());
            }
        }
        None if s.get("const").is_some() || s.get("enum").is_some() => {}
        _ => return Err(bad()),
    }
    Ok(())
}
fn validate_catalog(v: &Value, endpoint: Option<&str>) -> Result<(), String> {
    validate_node(
        v,
        &serde_json::from_str::<Value>(SCHEMA).map_err(|e| e.to_string())?,
    )?;
    let mut ids = HashSet::new();
    for game in v["games"].as_array().ok_or("Missing games")? {
        if !ids.insert(game["id"].as_str().unwrap()) {
            return Err("Duplicate catalog ID".into());
        }
        if let Some(endpoint) = endpoint {
            let origin = https(endpoint)?;
            for a in assets(game) {
                if https(a["url"].as_str().unwrap())?.origin() != origin.origin() {
                    return Err("Images must use the API origin".into());
                }
            }
        }
    }
    Ok(())
}
fn assets(game: &Value) -> Vec<&Value> {
    let m = &game["media"];
    ["cover", "banner", "hero"]
        .iter()
        .filter_map(|k| m.get(k))
        .chain(m["gallery"].as_array().into_iter().flatten())
        .collect()
}
fn parse(raw: &[u8], endpoint: Option<&str>) -> Result<Value, String> {
    if raw.len() > JSON_LIMIT {
        return Err("Catalog exceeds 1 MiB".into());
    }
    let v = serde_json::from_slice(raw).map_err(|e| format!("Invalid catalog JSON: {e}"))?;
    validate_catalog(&v, endpoint)?;
    Ok(v)
}
fn endpoint(c: &Connection) -> Result<String, String> {
    c.query_row("SELECT endpoint FROM catalog_config WHERE id=1", [], |r| {
        r.get(0)
    })
    .optional()
    .map(|v: Option<String>| v.filter(|s| !s.is_empty()).unwrap_or_else(default_endpoint))
    .map_err(|e| e.to_string())
}
fn known(c: &Connection) -> Result<Vec<Value>, String> {
    let mut s = c.prepare("SELECT k.value FROM catalog_known k JOIN installations i ON json_extract(i.value,'$.collectionId')=k.id ORDER BY k.id LIMIT 100").map_err(|e|e.to_string())?;
    let rows = s
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let schema: Value = serde_json::from_str(SCHEMA).map_err(|e| e.to_string())?;
    let rule = &schema["properties"]["games"]["items"];
    let mut result = Vec::new();
    for row in rows {
        let raw = row.map_err(|e| e.to_string())?;
        if raw.len() > JSON_LIMIT {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if validate_node(&v, rule).is_ok() {
                result.push(v);
            }
        }
    }
    Ok(result)
}
fn load(c: &Connection) -> Result<Snapshot, String> {
    let ep = endpoint(c)?;
    let k = known(c)?;
    let raw: Option<String> = c
        .query_row(
            "SELECT value FROM catalog_cache WHERE id=1 AND length(value)<=?1",
            [CACHE_LIMIT as i64],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(raw) = raw {
        if let Ok(mut snap) = serde_json::from_str::<Snapshot>(&raw) {
            if snap.endpoint == ep && validate_catalog(&snap.catalog, Some(&ep)).is_ok() {
                // Cache is revalidated too. Never render arbitrary cached data URLs.
                let mut total = 0;
                snap.images.retain(|hash, data| {
                    decode_image(data).is_ok_and(|b| {
                        if format!("{:x}", Sha256::digest(&b)) != *hash
                            || total + b.len() > TOTAL_IMAGES
                        {
                            return false;
                        }
                        total += b.len();
                        true
                    })
                });
                snap.source = "cache".into();
                snap.known = k;
                return Ok(snap);
            }
        }
    }
    Ok(Snapshot {
        endpoint: ep.clone(),
        catalog: json!({"schemaVersion":1,"revision":"empty","publishedAt":"2026-10-27T00:00:00Z","games":[]}),
        images: HashMap::new(),
        known: k,
        synced_at: None,
        source: "empty".into(),
        warning: String::new(),
    })
}
#[tauri::command]
pub fn load_catalog(db: tauri::State<Database>) -> Result<Snapshot, String> {
    let c = db.0.lock().map_err(|e| e.to_string())?;
    load(&c)
}
#[tauri::command]
pub fn configure_catalog(
    endpoint: String,
    db: tauri::State<Database>,
    sync: tauri::State<SyncLock>,
) -> Result<Snapshot, String> {
    if !cfg!(debug_assertions) {
        return Err("Catalog configuration requires a developer build".into());
    }
    let _guard = sync
        .0
        .try_lock()
        .map_err(|_| "Catalog synchronization is busy")?;
    if !endpoint.is_empty() {
        https(&endpoint)?;
    }
    let c = db.0.lock().map_err(|e| e.to_string())?;
    c.execute("INSERT INTO catalog_config VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint", [&endpoint]).map_err(|e|e.to_string())?;
    load(&c)
}
// Resolve and pin public addresses for EACH request. No redirects, proxy, credentials,
// cookies or OS shell; catalog responses and images never reach runtime downloads.
fn fetch(url: &str, limit: usize, deadline: Instant, mime: &str) -> Result<Vec<u8>, String> {
    let u = https(url)?;
    let host = u.host_str().ok_or("Missing host")?.to_string();
    let remaining = deadline
        .checked_duration_since(Instant::now())
        .ok_or("Catalog sync deadline exceeded")?;
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let dns_host = host.clone();
    std::thread::spawn(move || {
        let result = (dns_host.as_str(), 443)
            .to_socket_addrs()
            .map(|a| a.take(32).collect::<Vec<_>>())
            .map_err(|e| e.to_string());
        let _ = tx.send(result);
    });
    let addrs = rx
        .recv_timeout(remaining.min(Duration::from_secs(4)))
        .map_err(|_| "DNS timeout")??;
    if addrs.is_empty() || addrs.iter().any(|a| !public_ip(a.ip())) {
        return Err("DNS must resolve only to public addresses".into());
    }
    let timeout = deadline
        .checked_duration_since(Instant::now())
        .ok_or("Catalog sync deadline exceeded")?
        .min(Duration::from_secs(8));
    let client = Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(4))
        .timeout(timeout)
        .resolve_to_addrs(&host, &addrs)
        .user_agent("PORT-Catalog/1")
        .build()
        .map_err(|e| e.to_string())?;
    let mut r = client
        .get(u)
        .header("Accept", mime)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    if r.status() != reqwest::StatusCode::OK
        || r.content_length().is_some_and(|n| n > limit as u64)
        || r.headers()
            .get("content-type")
            .and_then(|h| h.to_str().ok())
            .is_none_or(|t| t.split(';').next().unwrap_or("").trim() != mime)
    {
        return Err("Unexpected catalog response, content type, redirect or size".into());
    }
    let mut b = Vec::new();
    r.by_ref()
        .take(limit as u64 + 1)
        .read_to_end(&mut b)
        .map_err(|e| e.to_string())?;
    if b.len() > limit {
        return Err("Response size limit exceeded".into());
    }
    Ok(b)
}
// WebP only. Check bitstream dimensions before WebView decoding (no SVG/HTML).
fn image(b: &[u8]) -> Result<(), String> {
    let bad = || "Invalid or oversized WebP".to_string();
    if b.len() < 30
        || b.len() > IMAGE_LIMIT
        || &b[..4] != b"RIFF"
        || &b[8..12] != b"WEBP"
        || u32::from_le_bytes(b[4..8].try_into().unwrap()) as usize + 8 != b.len()
    {
        return Err(bad());
    }
    let u24 = |i| u32::from_le_bytes([b[i], b[i + 1], b[i + 2], 0]);
    let (w, h) = match &b[12..16] {
        b"VP8X" if b[20] & 0x02 == 0 => (u24(24) + 1, u24(27) + 1), // no animation
        b"VP8L" if b[20] == 0x2f => {
            let bits = u32::from_le_bytes(b[21..25].try_into().unwrap());
            ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
        }
        b"VP8 " if b[23..26] == [0x9d, 0x01, 0x2a] => (
            (u16::from_le_bytes([b[26], b[27]]) & 0x3fff) as u32,
            (u16::from_le_bytes([b[28], b[29]]) & 0x3fff) as u32,
        ),
        _ => return Err(bad()),
    };
    if w == 0 || h == 0 || w > 4096 || h > 4096 || u64::from(w) * u64::from(h) > 8_388_608 {
        return Err(bad());
    }
    Ok(())
}
fn decode_image(data: &str) -> Result<Vec<u8>, String> {
    if data.len() > IMAGE_LIMIT * 4 / 3 + 64 {
        return Err("Image limit".into());
    }
    let b = STANDARD
        .decode(
            data.strip_prefix("data:image/webp;base64,")
                .ok_or("Invalid image prefix")?,
        )
        .map_err(|e| e.to_string())?;
    image(&b)?;
    Ok(b)
}
fn commit(c: &mut Connection, snap: &Snapshot) -> Result<(), String> {
    let raw = serde_json::to_string(snap).map_err(|e| e.to_string())?;
    if raw.len() > CACHE_LIMIT {
        return Err("Catalog cache limit".into());
    }
    let tx = c.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM catalog_known WHERE id NOT IN (SELECT json_extract(value,'$.collectionId') FROM installations)",[]).map_err(|e|e.to_string())?;
    tx.execute(
        "INSERT INTO catalog_cache VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
        [raw],
    )
    .map_err(|e| e.to_string())?;
    // Only installed collections need permanent metadata. Remote deletion never deletes installations.
    for g in snap.catalog["games"].as_array().ok_or("Missing games")? {
        tx.execute("INSERT INTO catalog_known(id,value) SELECT ?1,?2 WHERE EXISTS(SELECT 1 FROM installations WHERE json_extract(value,'$.collectionId')=?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value", rusqlite::params![g["collectionId"].as_str(),g.to_string()]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn sync_catalog(
    app: tauri::AppHandle,
    sync: tauri::State<'_, SyncLock>,
) -> Result<Snapshot, String> {
    use tauri::Manager;
    let lock = sync.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .0
            .try_lock()
            .map_err(|_| "Catalog synchronization is busy")?;
        let db = app.state::<Database>();
        let old = {
            let c = db.0.lock().map_err(|e| e.to_string())?;
            load(&c)?
        };
        if old.endpoint.is_empty() {
            return Ok(old);
        }
        let deadline = Instant::now() + Duration::from_secs(45);
        let catalog = parse(
            &fetch(&old.endpoint, JSON_LIMIT, deadline, "application/json")?,
            Some(&old.endpoint),
        )?;
        let mut images = HashMap::new();
        let mut total = 0;
        let mut missing = 0;
        let mut attempted = HashSet::new();
        let mut download_count = 0;
        let mut transfer_budget = TOTAL_IMAGES;
        for g in catalog["games"].as_array().ok_or("Missing games")? {
            for a in assets(g) {
                let hash = a["sha256"].as_str().unwrap();
                if !attempted.insert(hash.to_string()) {
                    continue;
                }
                if let Some(data) = old.images.get(hash) {
                    if total + data.len() * 3 / 4 <= TOTAL_IMAGES {
                        total += data.len() * 3 / 4;
                        images.insert(hash.to_string(), data.clone());
                        continue;
                    }
                }
                let result: Result<String, String> = (|| {
                    download_count += 1;
                    if download_count > 128 || transfer_budget < IMAGE_LIMIT {
                        return Err("Image request budget".into());
                    }
                    transfer_budget -= IMAGE_LIMIT;
                    let b = fetch(
                        a["url"].as_str().unwrap(),
                        IMAGE_LIMIT,
                        deadline,
                        "image/webp",
                    )?;
                    transfer_budget += IMAGE_LIMIT - b.len();
                    image(&b)?;
                    if format!("{:x}", Sha256::digest(&b)) != hash {
                        return Err("Image hash mismatch".into());
                    }
                    if total + b.len() > TOTAL_IMAGES {
                        return Err("Image budget".into());
                    }
                    total += b.len();
                    Ok(format!("data:image/webp;base64,{}", STANDARD.encode(b)))
                })();
                match result {
                    Ok(data) => {
                        images.insert(hash.to_string(), data);
                    }
                    Err(_) => missing += 1,
                }
            }
        }
        // Keep images referenced by retained installed metadata where the budget permits.
        for g in &old.known {
            for a in assets(g) {
                let hash = a["sha256"].as_str().unwrap();
                if !images.contains_key(hash) {
                    if let Some(data) = old.images.get(hash) {
                        if total + data.len() * 3 / 4 <= TOTAL_IMAGES {
                            total += data.len() * 3 / 4;
                            images.insert(hash.to_string(), data.clone());
                        }
                    }
                }
            }
        }
        let mut snap = Snapshot {
            endpoint: old.endpoint,
            catalog,
            images,
            known: old.known,
            synced_at: Some(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_secs(),
            ),
            source: "online".into(),
            warning: if missing > 0 {
                format!("Images unavailable: {missing}; cached images or placeholders shown")
            } else {
                String::new()
            },
        };
        let mut c = db.0.lock().map_err(|e| e.to_string())?;
        commit(&mut c, &snap)?;
        snap.known = known(&c)?;
        Ok(snap)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn production_default_preserves_configuration_and_installation_schema() {
        let c = Connection::open_in_memory().unwrap();
        crate::init(&c).unwrap();
        init(&c).unwrap();
        let version: i64 = c
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        https(&default_endpoint()).unwrap();
        assert_eq!(load(&c).unwrap().endpoint, default_endpoint());
        assert_eq!(load(&c).unwrap().catalog["games"], json!([]));
        c.execute("INSERT INTO catalog_config VALUES(1,'')", [])
            .unwrap();
        assert_eq!(load(&c).unwrap().endpoint, default_endpoint());
        c.execute(
            "UPDATE catalog_config SET endpoint='https://custom.port-qa.com/v1'",
            [],
        )
        .unwrap();
        assert_eq!(load(&c).unwrap().endpoint, "https://custom.port-qa.com/v1");
        assert_eq!(
            c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            version
        );
    }
    #[test]
    #[ignore = "real production HTTPS, read-only; run explicitly"]
    fn live_production_catalog_and_all_images() {
        let ep = default_endpoint();
        let deadline = Instant::now() + Duration::from_secs(45);
        let raw = fetch(&ep, JSON_LIMIT, deadline, "application/json").unwrap();
        let catalog = parse(&raw, Some(&ep)).unwrap();
        let games = catalog["games"].as_array().unwrap();
        assert!(games.iter().any(|g| g["id"] == "bloodborne"
            && g["collectionId"] == "bloodborne"
            && g["status"] == "published"));
        let mut checked = HashSet::new();
        let mut total = 0;
        for game in games {
            for asset in assets(game) {
                let url = asset["url"].as_str().unwrap();
                if !checked.insert(url.to_string()) {
                    continue;
                }
                let bytes = fetch(url, IMAGE_LIMIT, deadline, "image/webp").unwrap();
                image(&bytes).unwrap();
                assert_eq!(
                    format!("{:x}", Sha256::digest(&bytes)),
                    asset["sha256"].as_str().unwrap()
                );
                total += bytes.len();
            }
        }
        println!("Anonymous production GET 200/schema v1: revision={}, games={}, unique WebP={}, verified bytes={}", catalog["revision"], games.len(), checked.len(), total);
    }
    #[test]
    fn shared_schema_rejects_unpublished_unknown_commands_and_bad_urls() {
        let v = parse(DEMO.as_bytes(), None).unwrap();
        for (field, value) in [
            ("status", json!("draft")),
            ("adapterId", json!("../execute")),
            ("command", json!("calc.exe")),
            ("implementation", json!("official")),
        ] {
            let mut bad = v.clone();
            bad["games"][0][field] = value;
            assert!(validate_catalog(&bad, None).is_err());
        }
        for u in [
            "http://github.com/a/b",
            "https://localhost/api",
            "https://127.0.0.1/a",
            "https://[::1]/a",
            "https://user:pass@example.com/a",
            "https://example.com:444/a",
            "file:///C:/x",
            "javascript:alert(1)",
            "https://api.local/a",
            "https://example.com/a#x",
        ] {
            assert!(https(u).is_err(), "{u}");
        }
        assert!(parse(b"{", None).is_err());
        assert!(parse(&vec![b' '; JSON_LIMIT + 1], None).is_err());
        let mut bad = v.clone();
        bad["games"] = json!([v["games"][0], v["games"][0]]);
        assert!(validate_catalog(&bad, None).is_err());
        let mut bad = v;
        bad["games"][0]["media"]["cover"] =
            json!({"url":"https://other.com/a.webp","sha256":"a".repeat(64)});
        assert!(validate_catalog(&bad, Some("https://catalog.example.com/v1")).is_err());
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "169.254.169.254",
            "100.64.0.1",
            "198.18.0.1",
            "::1",
            "::ffff:127.0.0.1",
            "2001:db8::1",
        ] {
            assert!(!public_ip(ip.parse().unwrap()));
        }
    }
    #[test]
    fn cache_persists_scoped_snapshot_and_preserves_removed_installation() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache.db");
        let mut c = Connection::open(&path).unwrap();
        crate::init(&c).unwrap();
        init(&c).unwrap();
        let original =
            json!({"id":"local","collectionId":"bloodborne","version":"01.09"}).to_string();
        c.execute("INSERT INTO installations VALUES('local',?1)", [&original])
            .unwrap();
        c.execute(
            "INSERT INTO catalog_config VALUES(1,'https://catalog.example.com/v1')",
            [],
        )
        .unwrap();
        let mut snap = load(&c).unwrap();
        snap.catalog = parse(DEMO.as_bytes(), None).unwrap();
        snap.synced_at = Some(1);
        commit(&mut c, &snap).unwrap();
        // A later publication changes metadata without touching the installed identity.
        snap.catalog["revision"] = json!("qa-next");
        snap.catalog["games"][0]["title"] = json!("Bloodborne updated metadata");
        commit(&mut c, &snap).unwrap();
        assert_eq!(
            load(&c).unwrap().catalog["games"][0]["title"],
            "Bloodborne updated metadata"
        );
        // A failed fetch never commits; the validated cache remains available.
        assert!(fetch(
            "http://localhost/invalid",
            JSON_LIMIT,
            Instant::now() + Duration::from_secs(1),
            "application/json"
        )
        .is_err());
        assert_eq!(load(&c).unwrap().catalog["revision"], "qa-next");
        snap.catalog["games"] = json!([]);
        commit(&mut c, &snap).unwrap();
        drop(c);
        let c = Connection::open(path).unwrap();
        let loaded = load(&c).unwrap();
        assert_eq!(loaded.source, "cache");
        assert_eq!(loaded.catalog["games"], json!([]));
        assert_eq!(loaded.known[0]["title"], "Bloodborne updated metadata");
        assert_eq!(
            c.query_row("SELECT value FROM installations", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            original
        );
        c.execute(
            "UPDATE catalog_config SET endpoint='https://different.example.com/v1'",
            [],
        )
        .unwrap();
        assert_eq!(load(&c).unwrap().source, "empty");
        c.execute("UPDATE catalog_cache SET value='{'", []).unwrap();
        assert_eq!(load(&c).unwrap().source, "empty");
    }
    #[test]
    fn webp_rejects_html_animation_and_bomb_dimensions() {
        assert!(image(b"<svg onload='x'>").is_err());
        let mut b = vec![0; 30];
        b[..4].copy_from_slice(b"RIFF");
        b[4..8].copy_from_slice(&22u32.to_le_bytes());
        b[8..12].copy_from_slice(b"WEBP");
        b[12..16].copy_from_slice(b"VP8X");
        assert!(image(&b).is_ok());
        b[24..27].fill(255);
        assert!(image(&b).is_err());
        b[24..27].fill(0);
        b[20] = 2;
        assert!(image(&b).is_err());
    }
}
