//! Opt-in installed E2E fixture transport. Never included in the beta candidate.
use reqwest::{redirect::Policy, Url};
use std::{io::Read, time::Duration};

pub const ID: &str = "app.port.stage19b-qa";
const ORIGIN: &str = "http://127.0.0.1:19219";

pub fn assert_isolated(identifier: &str) {
    assert_eq!(
        identifier, ID,
        "download-e2e-qa requires its isolated identity"
    );
}

pub fn fetch(path: &str) -> Result<Vec<u8>, String> {
    let mut response = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .get(format!("{ORIGIN}{path}"))
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mut body = Vec::new();
    response
        .by_ref()
        .take(1024 * 1024 + 1)
        .read_to_end(&mut body)
        .map_err(|e| e.to_string())?;
    if body.len() > 1024 * 1024 {
        return Err("QA response too large".into());
    }
    Ok(body)
}

fn asset_path(url: &Url) -> Result<&str, String> {
    // Still validated by the real approval/filename parser before transport mapping.
    let path = url.path();
    if url.host_str() != Some("github.com")
        || !path.starts_with("/port-fixture/fiction/releases/download/v1/")
    {
        return Err("QA accepts only fictional fixture assets".into());
    }
    Ok(path)
}

pub async fn response(url: &Url) -> Result<reqwest::Response, String> {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(4))
        .read_timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?
        .get(format!("{ORIGIN}{}", asset_path(url)?))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn isolation() {
        assert!(std::panic::catch_unwind(|| assert_isolated("app.port.launcher")).is_err());
        assert_isolated(ID);
        assert!(asset_path(
            &Url::parse("https://github.com/real/game/releases/download/v1/a.zip").unwrap()
        )
        .is_err());
    }
}
