//! Fixed loopback HTTPS transport for the dedicated debug QA identity only.
use reqwest::{blocking::Client, redirect::Policy, Url};
use std::{io::Read, path::PathBuf, time::Duration};

pub const ID: &str = "app.port.cms-qa";
pub fn enabled(identifier: &str) -> bool {
    cfg!(all(debug_assertions, feature = "local-cms-qa")) && identifier == ID
}
pub fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(".local/cms-qa")
}
fn allowed(path: &str) -> bool {
    let Ok(u) = Url::parse(&format!("https://localhost:8787{path}")) else {
        return false;
    };
    if path.len() > 2048
        || !path.starts_with('/')
        || path.contains(['\\', '#', '%'])
        || path.chars().any(char::is_whitespace)
        || u.origin().ascii_serialization() != "https://localhost:8787"
        || u.fragment().is_some()
    {
        return false;
    }
    let p = u.path();
    if let Some(hash) = p
        .strip_prefix("/media/")
        .and_then(|s| s.strip_suffix(".webp"))
    {
        return u.query().is_none()
            && hash.len() == 64
            && hash
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    }
    let parts: Vec<_> = p.split('/').collect();
    (p == "/v2/projects"
        || p == "/v2/games"
        || (parts.len() >= 4
            && parts.len() <= 5
            && parts[1] == "v2"
            && parts[2] == "projects"
            && !parts[3].is_empty()
            && parts[3].len() <= 80
            && parts[3]
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            && (parts.len() == 4 || matches!(parts[4], "builds" | "requirements" | "install"))))
        && u.query_pairs().all(|(k, v)| {
            matches!(
                k.as_ref(),
                "limit"
                    | "cursor"
                    | "sort"
                    | "channel"
                    | "platform"
                    | "q"
                    | "kind"
                    | "lifecycle"
                    | "game"
            ) && v.len() <= 100
        })
}
pub fn fetch(identifier: &str, path: &str) -> Result<Vec<u8>, String> {
    if !enabled(identifier) || !allowed(path) {
        return Err(
            "Local CMS QA requires the dedicated debug identity and an allowed read-only path"
                .into(),
        );
    }
    let pem = std::fs::read(root().join("localhost.pem")).map_err(|e| e.to_string())?;
    let cert = reqwest::Certificate::from_pem(&pem).map_err(|e| e.to_string())?;
    let builder = Client::builder();
    #[cfg(feature = "local-cms-qa")]
    let builder = builder.use_native_tls();
    let client = builder
        .no_proxy()
        .https_only(true)
        .redirect(Policy::none())
        .tls_built_in_root_certs(false)
        .add_root_certificate(cert)
        .resolve("localhost", "127.0.0.1:8787".parse().unwrap())
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut r = client
        .get(format!("https://localhost:8787{path}"))
        .send()
        .map_err(|e| format!("Local CMS TLS/network: {e:?}"))?;
    let mime = if path.starts_with("/media/") {
        "image/webp"
    } else {
        "application/json"
    };
    if r.status() != reqwest::StatusCode::OK
        || r.content_length().is_some_and(|n| n > 1024 * 1024)
        || r.headers()
            .get("content-type")
            .and_then(|h| h.to_str().ok())
            .is_none_or(|s| s.split(';').next().unwrap_or("").trim() != mime)
    {
        return Err(format!(
            "Local CMS: HTTP {}, unexpected MIME or size",
            r.status()
        ));
    }
    let mut bytes = Vec::new();
    r.by_ref()
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("Local CMS response exceeds 1 MiB".into());
    }
    Ok(bytes)
}
#[tauri::command]
pub async fn local_cms_qa_fetch(app: tauri::AppHandle, path: String) -> Result<Vec<u8>, String> {
    let identifier = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || fetch(&identifier, &path))
        .await
        .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn isolated_read_only_scope() {
        assert_eq!(
            enabled(ID),
            cfg!(all(debug_assertions, feature = "local-cms-qa"))
        );
        assert!(!enabled("app.port.launcher"));
        assert!(fetch("app.port.launcher", "/v2/projects").is_err());
        for path in [
            "/v2/projects?limit=100&sort=name",
            "/v2/games",
            "/v2/projects/zelda64-recompiled/builds?channel=all",
        ] {
            assert!(allowed(path), "{path}");
        }
        for path in [
            "//evil.com/v2/projects",
            "/admin",
            "/v1/catalog.json",
            "/v2/projects/../admin",
            "/v2/projects#x",
            "/v2/projects?token=secret",
            "/media/not-a-hash.webp",
        ] {
            assert!(!allowed(path), "{path}");
        }
    }
}
