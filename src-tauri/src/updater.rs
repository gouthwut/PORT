//! Only compiled channels and Tauri-verified NSIS packages. No client-supplied URLs/arguments.
use crate::{download, Database};
use reqwest::{redirect::Policy, Url};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::Manager;
use tauri_plugin_updater::{Update, UpdaterExt};

type Result<T> = std::result::Result<T, String>;
const MAX_PACKAGE: u64 = 256 * 1024 * 1024;
const RESERVE: u64 = 512 * 1024 * 1024;
const NETWORK_ERROR: &str =
    "Не удалось получить обновление. Проверьте подключение и повторите попытку.";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Channel {
    channel: String,
    endpoint: String,
    public_key: String,
    hosts: Vec<String>,
    #[serde(default)]
    test_ca_pem: Option<String>,
}
impl Channel {
    fn compiled(app: &tauri::AppHandle) -> Result<Self> {
        let config: Self = serde_json::from_str(include_str!(concat!(
            env!("OUT_DIR"),
            "/updater-channel.json"
        )))
        .map_err(|_| "Ошибка конфигурации обновлений")?;
        config.validate(&app.config().identifier)?;
        Ok(config)
    }
    fn validate(&self, identifier: &str) -> Result<()> {
        if self.channel == "unconfigured"
            && self.endpoint.is_empty()
            && self.public_key.is_empty()
            && self.hosts.is_empty()
            && self.test_ca_pem.is_none()
        {
            return Ok(());
        }
        if !matches!(self.channel.as_str(), "production" | "isolated-test")
            || self.public_key.is_empty()
            || (self.channel == "isolated-test" && identifier == "app.port.launcher")
            || (self.test_ca_pem.is_some() && self.channel != "isolated-test")
        {
            return Err("Недопустимая конфигурация канала обновлений".into());
        }
        let endpoint = Url::parse(&self.endpoint).map_err(|_| "Некорректный адрес обновлений")?;
        if !self.trusted(&endpoint) {
            return Err("Небезопасный адрес обновлений".into());
        }
        Ok(())
    }
    fn trusted(&self, url: &Url) -> bool {
        url.scheme() == "https"
            && url.username().is_empty()
            && url.password().is_none()
            && url.fragment().is_none()
            && url.port_or_known_default() == Some(443)
            && url
                .host_str()
                .is_some_and(|host| self.hosts.iter().any(|h| h == host))
    }
    fn client(&self) -> Result<reqwest::Client> {
        let hosts = self.hosts.clone();
        let mut client = reqwest::Client::builder()
            .https_only(true)
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(180))
            .user_agent(concat!("PORT/", env!("CARGO_PKG_VERSION")))
            .redirect(Policy::custom(move |attempt| {
                let url = attempt.url();
                if attempt.previous().len() < 5
                    && url.scheme() == "https"
                    && url.port_or_known_default() == Some(443)
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url
                        .host_str()
                        .is_some_and(|h| hosts.iter().any(|host| h == host))
                {
                    attempt.follow()
                } else {
                    attempt.error("Update redirect rejected")
                }
            }));
        if let Some(pem) = &self.test_ca_pem {
            client = client.add_root_certificate(
                reqwest::Certificate::from_pem(pem.as_bytes())
                    .map_err(|_| "Некорректный тестовый CA")?,
            );
        }
        client.build().map_err(|_| NETWORK_ERROR.into())
    }
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    downloaded: bool,
    phase: String,
    current_version: String,
    channel: String,
    version: Option<String>,
    notes: String,
    completed: u64,
    total: Option<u64>,
    message: String,
}
#[derive(Default)]
struct Inner {
    status: Status,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}
#[derive(Default)]
pub struct State {
    inner: Mutex<Inner>,
    busy: AtomicBool,
    cancel: Mutex<Option<Arc<tokio::sync::Notify>>>,
}
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl State {
    fn begin(&self) -> Result<Busy<'_>> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "Операция обновления уже выполняется")?;
        Ok(Busy(&self.busy))
    }
    fn edit(&self, f: impl FnOnce(&mut Inner)) {
        if let Ok(mut i) = self.inner.lock() {
            f(&mut i);
        }
    }
    fn error(&self, message: &str) {
        self.edit(|i| {
            i.status.phase = "error".into();
            i.status.message = message.into();
        });
    }
}
#[tauri::command]
pub fn updater_status(app: tauri::AppHandle, state: tauri::State<State>) -> Result<Status> {
    let inner = state.inner.lock().map_err(|_| "Обновления недоступны")?;
    let mut status = inner.status.clone();
    status.downloaded = inner.bytes.is_some();
    status.current_version = app.package_info().version.to_string();
    Ok(status)
}

// A single bounded HTTPS fetch. Tauri parses/selects the platform and verifies signed versions.
async fn manifest(channel: &Channel) -> Result<Option<serde_json::Value>> {
    let mut response = channel
        .client()?
        .get(&channel.endpoint)
        .send()
        .await
        .map_err(|_| NETWORK_ERROR)?;
    if response.status() == 204 {
        return Ok(None);
    }
    if response.status() != 200 {
        return Err(NETWORK_ERROR.into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| NETWORK_ERROR)? {
        if bytes.len() + chunk.len() > 64 * 1024 {
            return Err("Manifest обновления слишком большой".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "Некорректный manifest обновления".into())
}
pub async fn check(app: &tauri::AppHandle) -> Result<()> {
    let state = app.state::<State>();
    let _busy = state.begin()?;
    // Do not discard a verified pending download during another manual check.
    if state
        .inner
        .lock()
        .map_err(|_| "Обновления недоступны")?
        .bytes
        .is_some()
    {
        return Ok(());
    }
    state.edit(|i| {
        i.status.phase = "checking".into();
        i.status.message.clear();
        i.update = None;
        i.status.version = None;
        i.status.notes.clear();
    });
    let result: Result<()> = async {
        let channel = Channel::compiled(app)?;
        state.edit(|i| i.status.channel.clone_from(&channel.channel));
        if channel.channel == "unconfigured" {
            state.edit(|i| {
                i.status.phase = "unconfigured".into();
                i.status.message = "Официальный канал обновлений ещё не подключён.".into();
            });
            return Ok(());
        }
        let update = match manifest(&channel).await? {
            None => None,
            Some(raw) => {
                app.updater_builder()
                    .pubkey(&channel.public_key)
                    .endpoints(vec![Url::parse(&channel.endpoint)
                        .map_err(|_| "Некорректный адрес обновлений")?])
                    .map_err(|_| "Небезопасный адрес обновлений")?
                    .build()
                    .map_err(|_| "Обновления недоступны")?
                    .restore_update(raw)
                    .map_err(|_| "Manifest не подходит для этой версии Windows или архитектуры")?
            }
        };
        if let Some(update) = &update {
            validate_update(update, &channel)?;
        }
        state.edit(|i| {
            i.status.phase = if update.is_some() {
                "available"
            } else {
                "current"
            }
            .into();
            i.status.version = update.as_ref().map(|u| u.version.clone());
            i.status.notes = update
                .as_ref()
                .and_then(|u| u.body.clone())
                .unwrap_or_default()
                .chars()
                .take(8000)
                .collect();
            i.update = update;
        });
        Ok(())
    }
    .await;
    if let Err(e) = &result {
        state.error(e);
    }
    result
}
fn validate_update(update: &Update, channel: &Channel) -> Result<()> {
    let current = semver::Version::parse(&update.current_version)
        .map_err(|_| "Некорректная версия приложения")?;
    let next =
        semver::Version::parse(&update.version).map_err(|_| "Некорректная версия обновления")?;
    if next <= current
        || !channel.trusted(&update.download_url)
        || !update.download_url.path().ends_with(".exe")
        || update.signature.is_empty()
    {
        return Err("Отклонён неподходящий пакет обновления".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn check_app_update(app: tauri::AppHandle) -> Result<()> {
    check(&app).await
}

fn space_check(available: u64, needed: u64) -> Result<()> {
    if available < needed.saturating_add(RESERVE) {
        Err(
            "Недостаточно места. Освободите место на дисках TEMP и PORT, затем повторите попытку."
                .into(),
        )
    } else {
        Ok(())
    }
}
fn disk_space(app: &tauri::AppHandle, needed: u64) -> Result<()> {
    let executable = std::env::current_exe().map_err(|_| "Не найдено приложение")?;
    let _ = app;
    for path in [
        std::env::temp_dir(),
        executable.parent().unwrap_or(Path::new(".")).to_path_buf(),
    ] {
        space_check(
            fs2::available_space(path).map_err(|_| "Не удалось проверить свободное место")?,
            needed,
        )?;
    }
    Ok(())
}
#[tauri::command]
pub async fn download_app_update(app: tauri::AppHandle) -> Result<()> {
    let state = app.state::<State>();
    let _busy = state.begin()?;
    let update = state
        .inner
        .lock()
        .map_err(|_| "Обновления недоступны")?
        .update
        .clone()
        .ok_or("Сначала проверьте обновления")?;
    let cancel = Arc::new(tokio::sync::Notify::new());
    *state.cancel.lock().map_err(|_| "Обновления недоступны")? = Some(cancel.clone());
    state.edit(|i| {
        i.bytes = None;
        i.status.phase = "downloading".into();
        i.status.completed = 0;
        i.status.total = None;
        i.status.message.clear();
    });
    let result: Result<Vec<u8>> = async {
        let channel = Channel::compiled(&app)?;
        validate_update(&update, &channel)?;
        disk_space(&app, MAX_PACKAGE)?;
        let transfer = async {
            let mut response = channel
                .client()?
                .get(update.download_url.clone())
                .header("Accept-Encoding", "identity")
                .send()
                .await
                .map_err(|_| NETWORK_ERROR)?;
            if response.status() != 200 {
                return Err(NETWORK_ERROR.into());
            }
            let total = response.content_length();
            if total.is_some_and(|n| n == 0 || n > MAX_PACKAGE) {
                return Err("Недопустимый размер обновления".into());
            }
            state.edit(|i| i.status.total = total);
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|_| NETWORK_ERROR)? {
                if bytes.len() as u64 + chunk.len() as u64 > MAX_PACKAGE {
                    return Err("Пакет обновления слишком большой".into());
                }
                bytes.extend_from_slice(&chunk);
                state.edit(|i| i.status.completed = bytes.len() as u64);
            }
            if total.is_some_and(|n| n != bytes.len() as u64) {
                return Err("Загрузка оборвалась. Повторите попытку.".into());
            }
            // Official Tauri verification binds both bytes and the advertised version.
            update.verify(&bytes).map_err(|_| {
                "Подпись или версия пакета не прошла проверку. Установка запрещена."
            })?;
            if !bytes.starts_with(b"MZ") {
                return Err("Ожидался Windows-установщик NSIS".into());
            }
            Ok(bytes)
        };
        tokio::select! {
            _ = cancel.notified() => Err("Загрузка отменена. Можно повторить попытку.".into()),
            result = transfer => result,
        }
    }
    .await;
    *state.cancel.lock().map_err(|_| "Обновления недоступны")? = None;
    match result {
        Ok(bytes) => {
            state.edit(|i| {
                i.bytes = Some(bytes);
                i.status.phase = "ready".into();
            });
            Ok(())
        }
        Err(e) => {
            state.error(&e);
            Err(e)
        }
    }
}
#[tauri::command]
pub fn cancel_app_update(state: tauri::State<State>) -> Result<()> {
    if let Some(cancel) = state
        .cancel
        .lock()
        .map_err(|_| "Обновления недоступны")?
        .as_ref()
    {
        cancel.notify_one();
    }
    Ok(())
}
#[tauri::command]
pub async fn install_app_update(app: tauri::AppHandle, confirmed: bool) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || install(&app, confirmed))
        .await
        .map_err(|_| "Установщик не завершил операцию; перезапустите PORT".to_string())?
}
fn install(app: &tauri::AppHandle, confirmed: bool) -> Result<()> {
    if !confirmed {
        return Err("Установка требует подтверждения перезапуска".into());
    }
    let state = app.state::<State>();
    let _busy = state.begin()?;
    let result: Result<()> = (|| -> Result<()> {
        let hub = app.state::<crate::hub_download::Downloads>();
        let _hub_download = hub.reserve_for_update()?;
        let db = app.state::<Database>();
        let conn = db.0.lock().map_err(|_| "База данных занята")?;
        conn.execute_batch("PRAGMA wal_checkpoint(FULL)")
            .map_err(|_| "Не удалось сохранить базу данных")?;
        let mut inner = state.inner.lock().map_err(|_| "Обновления недоступны")?;
        let update = inner
            .update
            .as_ref()
            .ok_or("Сначала проверьте обновления")?
            .clone();
        let bytes = inner.bytes.as_ref().ok_or("Сначала загрузите обновление")?;
        disk_space(app, bytes.len() as u64 * 3)?;
        update
            .verify(bytes)
            .map_err(|_| "Подпись пакета не прошла проверку")?;
        inner.status.phase = "installing".into();
        let bytes = inner.bytes.take().expect("verified bytes");
        drop(inner);
        write_attempt(app, &update.version)?;
        // On Windows success exits PORT; NSIS /R restarts it. Errors before handoff return here.
        update.install(bytes).map_err(|_| {
            "Не удалось запустить установщик. Загрузите пакет повторно; библиотека сохранена."
                .to_string()
        })
    })();
    if let Err(e) = &result {
        state.error(e);
    }
    result
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Attempt {
    version: String,
}
fn write_attempt(app: &tauri::AppHandle, version: &str) -> Result<()> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|_| "Не найден каталог настроек")?
        .join("launcher-update-attempt.json");
    download::safe_existing(&path)?;
    std::fs::write(
        path,
        serde_json::to_vec(&Attempt {
            version: version.into(),
        })
        .map_err(|_| "Не удалось сохранить состояние обновления")?,
    )
    .map_err(|_| "Не удалось сохранить состояние обновления".into())
}
pub fn previous_attempt(app: &tauri::AppHandle) -> Result<()> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|_| "Не найден каталог настроек")?
        .join("launcher-update-attempt.json");
    if !path.exists() {
        return Ok(());
    }
    download::safe_existing(&path)?;
    if std::fs::metadata(&path)
        .map_err(|_| "Не удалось прочитать результат обновления")?
        .len()
        > 1024
    {
        return Err("Некорректная запись об обновлении".into());
    }
    let attempt: Attempt = serde_json::from_slice(
        &std::fs::read(&path).map_err(|_| "Не удалось прочитать результат обновления")?,
    )
    .map_err(|_| "Некорректная запись об обновлении")?;
    let expected =
        semver::Version::parse(&attempt.version).map_err(|_| "Некорректная версия обновления")?;
    let message = if app.package_info().version >= expected {
        "PORT обновлён. Библиотека доступна."
    } else {
        "Предыдущая установка обновления не завершилась. PORT продолжает работать; проверьте обновления и повторите попытку."
    };
    app.state::<State>()
        .edit(|i| i.status.message = message.into());
    std::fs::remove_file(path).map_err(|_| "Не удалось завершить запись об обновлении".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires the isolated local TLS fixture; never contacts a production host"]
    fn isolated_https_fixture_probe() {
        let raw = std::fs::read_to_string("../.local/stage08/channel.json").unwrap();
        let channel: Channel = serde_json::from_str(&raw).unwrap();
        assert_eq!(channel.channel, "isolated-test");
        assert_eq!(channel.endpoint, "https://localhost/latest.json");
        channel.validate("app.port.updater-stage08-qa").unwrap();
        tauri::async_runtime::block_on(async {
            channel
                .client()
                .unwrap()
                .get(&channel.endpoint)
                .send()
                .await
                .unwrap();
        });
    }
    #[test]
    fn channel_is_compiled_and_https_only() {
        let mut c: Channel = serde_json::from_str(r#"{"channel":"production","endpoint":"https://updates.example/latest.json","publicKey":"public","hosts":["updates.example"]}"#).unwrap();
        assert!(c.validate("app.port.launcher").is_ok());
        for url in [
            "http://updates.example/a.exe",
            "https://evil.example/a.exe",
            "https://user@updates.example/a.exe",
            "https://updates.example:444/a.exe",
        ] {
            assert!(!c.trusted(&Url::parse(url).unwrap()));
        }
        c.test_ca_pem = Some("test".into());
        assert!(c.validate("app.port.launcher").is_err());
        c.channel = "isolated-test".into();
        assert!(c.validate("app.port.launcher").is_err());
        assert!(c.validate("app.port.updater-qa").is_ok());
    }
    #[test]
    fn exclusive_checks_and_space_fail_closed() {
        let s = State::default();
        let guard = s.begin().unwrap();
        assert!(s.begin().is_err());
        drop(guard);
        assert!(s.begin().is_ok());
        assert!(space_check(RESERVE, 1).is_err());
        assert!(space_check(RESERVE + 10, 10).is_ok());
        assert!(space_check(u64::MAX - 1, u64::MAX).is_err());
    }
}
