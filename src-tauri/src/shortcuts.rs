//! Local .lnk files. Only compiled script text executes; values travel as environment data.
use crate::install::experience::valid_id;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

#[derive(Default)]
pub struct LaunchRequest(pub Mutex<Option<Result<String, String>>>);
pub fn parse(args: &[String]) -> Result<Option<String>, String> {
    match args {
        [_] => Ok(None),
        [_, flag, id] if flag == "--launch-installation" && valid_id(id) => Ok(Some(id.clone())),
        _ => Err("Ярлык содержит недопустимые параметры. Откройте игру из библиотеки PORT".into()),
    }
}
pub fn queue(app: &tauri::AppHandle, args: &[String]) {
    let request = match parse(args) {
        Ok(None) => return,
        Ok(Some(id)) => Ok(id),
        Err(e) => Err(e),
    };
    if let Ok(mut pending) = app.state::<LaunchRequest>().0.lock() {
        *pending = Some(request);
    }
}
#[tauri::command]
pub fn take_launch_request(state: tauri::State<LaunchRequest>) -> Result<Option<String>, String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .transpose()
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    id: String,
    path: PathBuf,
    sha256: String,
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn write_exclusive(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut f = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    if let Err(e) = f.write_all(bytes).and_then(|_| f.sync_all()) {
        drop(f);
        let _ = fs::remove_file(path);
        return Err(e.to_string());
    }
    Ok(())
}
fn publish(
    temp: &Path,
    desktop: &Path,
    receipts: &Path,
    id: &str,
    name: &str,
) -> Result<(), String> {
    let path = desktop.join(format!("PORT - {name} ({id}).lnk"));
    crate::download::safe_existing(&path)?;
    crate::download::safe_existing(receipts)?;
    let bytes = fs::read(temp).map_err(|e| e.to_string())?;
    if bytes.is_empty() || bytes.len() > 64 * 1024 {
        return Err("Некорректный ярлык".into());
    }
    let receipt = Receipt {
        id: id.into(),
        path: path.clone(),
        sha256: hash(&bytes),
    };
    // create_new is atomic even if somebody creates a same-name shortcut during generation.
    write_exclusive(&path, &bytes)?;
    if let Err(e) = write_exclusive(
        &receipts.join(format!("{id}.json")),
        &serde_json::to_vec(&receipt).map_err(|e| e.to_string())?,
    ) {
        if fs::read(&path).is_ok_and(|b| hash(&b) == receipt.sha256) {
            let _ = fs::remove_file(path);
        }
        return Err(e);
    }
    Ok(())
}
pub fn create(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    create_named(app, id, "Bloodborne")
}
pub fn create_named(app: &tauri::AppHandle, id: &str, name: &str) -> Result<(), String> {
    if !valid_id(id) || !["Bloodborne", "Skate 3"].contains(&name) {
        return Err("Недопустимый ярлык".into());
    }
    #[cfg(windows)]
    {
        let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
        let receipts = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("shortcuts");
        create_at(
            &desktop,
            &receipts,
            &std::env::current_exe().map_err(|e| e.to_string())?,
            id,
            name,
        )
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("Ярлыки доступны только в Windows".into())
    }
}
#[cfg(windows)]
fn create_at(
    desktop: &Path,
    receipts: &Path,
    exe: &Path,
    id: &str,
    name: &str,
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    if !valid_id(id) {
        return Err("Недопустимый ID установки".into());
    }
    crate::download::safe_existing(receipts)?;
    fs::create_dir_all(receipts).map_err(|e| e.to_string())?;
    let temp = receipts.join(format!("{id}.tmp.lnk"));
    crate::download::safe_existing(&temp)?;
    if fs::symlink_metadata(&temp).is_ok() {
        return Err("Временный ярлык уже существует".into());
    }
    let ps = PathBuf::from(std::env::var_os("SystemRoot").ok_or("Windows directory unavailable")?)
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let result = (|| {
        let mut child=std::process::Command::new(ps).args(["-NoLogo","-NoProfile","-NonInteractive","-Command", r#"$ErrorActionPreference='Stop'; $s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut($env:PORT_LINK); $l.TargetPath=$env:PORT_EXE; $l.Arguments='--launch-installation '+$env:PORT_ID; $l.WorkingDirectory=[IO.Path]::GetDirectoryName($env:PORT_EXE); $l.IconLocation=$env:PORT_EXE+',0'; $l.Description='Play through PORT//'; $l.Save()"#])
                .env("PORT_LINK",&temp).env("PORT_EXE",exe).env("PORT_ID",id)
                .creation_flags(0x08000000).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().map_err(|e|e.to_string())?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        let status = loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                break status;
            }
            if std::time::Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Windows не ответил при создании ярлыка".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        };
        if !status.success() {
            return Err("Windows не смог создать ярлык".into());
        }
        publish(&temp, desktop, receipts, id, name)
    })();
    let _ = fs::remove_file(&temp);
    result
}
fn remove_owned(desktop: &Path, receipts: &Path, id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("Недопустимый ID".into());
    }
    let file = receipts.join(format!("{id}.json"));
    crate::download::safe_existing(&file)?;
    if !file.exists() {
        return Ok(());
    }
    if fs::metadata(&file).map_err(|e| e.to_string())?.len() > 16 * 1024 {
        return Err("Некорректная квитанция ярлыка".into());
    }
    let r: Receipt = serde_json::from_slice(&fs::read(&file).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let expected = r.path.clone();
    if !["Bloodborne", "Skate 3"]
        .iter()
        .any(|name| expected == desktop.join(format!("PORT - {name} ({id}).lnk")))
    {
        return Err("Некорректный путь ярлыка".into());
    }
    if r.id != id || r.path != expected {
        return Err("Ярлык изменён; он оставлен на рабочем столе".into());
    }
    crate::download::safe_existing(&expected)?;
    if expected.exists() {
        if fs::metadata(&expected).map_err(|e| e.to_string())?.len() > 64 * 1024
            || hash(&fs::read(&expected).map_err(|e| e.to_string())?) != r.sha256
        {
            return Err("Ярлык изменён; он оставлен на рабочем столе".into());
        }
        fs::remove_file(expected).map_err(|e| e.to_string())?;
    }
    fs::remove_file(file).map_err(|e| e.to_string())
}
pub fn remove(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    remove_owned(
        &app.path().desktop_dir().map_err(|e| e.to_string())?,
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("shortcuts"),
        id,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[cfg(windows)]
    fn actual_windows_link_roundtrips_target_id_icon_and_owned_removal() {
        use std::os::windows::process::CommandExt;
        let t = tempfile::tempdir().unwrap();
        let desktop = t.path().join("desktop");
        fs::create_dir(&desktop).unwrap();
        let receipts = t.path().join("receipts");
        let exe = std::env::current_exe().unwrap();
        create_at(&desktop, &receipts, &exe, "123-45", "Bloodborne").unwrap();
        let link = desktop.join("PORT - Bloodborne (123-45).lnk");
        let ps = PathBuf::from(std::env::var_os("SystemRoot").unwrap())
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let output=std::process::Command::new(ps).args(["-NoLogo","-NoProfile","-NonInteractive","-Command",r#"$l=(New-Object -ComObject WScript.Shell).CreateShortcut($env:PORT_LINK); @{target=$l.TargetPath;args=$l.Arguments;icon=$l.IconLocation} | ConvertTo-Json -Compress"#]).env("PORT_LINK",&link).creation_flags(0x08000000).output().unwrap();
        assert!(output.status.success());
        let r: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(
            r["target"].as_str().unwrap().to_lowercase(),
            exe.display().to_string().to_lowercase()
        );
        assert_eq!(r["args"], "--launch-installation 123-45");
        assert!(r["icon"]
            .as_str()
            .unwrap()
            .to_lowercase()
            .starts_with(&exe.display().to_string().to_lowercase()));
        assert!(create_at(&desktop, &receipts, &exe, "123-45", "Bloodborne").is_err());
        remove_owned(&desktop, &receipts, "123-45").unwrap();
        assert!(!link.exists());
        assert!(create_at(
            &t.path().join("missing"),
            &receipts,
            &exe,
            "5-6",
            "Bloodborne"
        )
        .is_err());
    }
    #[test]
    fn strict_launch_contract() {
        assert_eq!(
            parse(&[
                "port".into(),
                "--launch-installation".into(),
                "123-45".into()
            ])
            .unwrap(),
            Some("123-45".into())
        );
        for args in [
            vec!["port", "--launch-installation", "../game"],
            vec!["port", "--launch-installation", "123-45", "--evil"],
            vec!["port", "--command", "calc.exe"],
        ] {
            assert!(parse(&args.into_iter().map(String::from).collect::<Vec<_>>()).is_err());
        }
    }
    #[test]
    fn foreign_or_modified_shortcut_survives_and_errors_do_not_mutate_library() {
        let t = tempfile::tempdir().unwrap();
        let desktop = t.path().join("desktop");
        let receipts = t.path().join("receipts");
        fs::create_dir(&desktop).unwrap();
        fs::create_dir(&receipts).unwrap();
        let temp = t.path().join("qa.lnk");
        fs::write(&temp, b"fixture shortcut").unwrap();
        publish(&temp, &desktop, &receipts, "1-2", "Bloodborne").unwrap();
        let link = desktop.join("PORT - Bloodborne (1-2).lnk");
        assert!(publish(&temp, &desktop, &receipts, "1-2", "Bloodborne").is_err());
        fs::write(&link, b"foreign modified").unwrap();
        assert!(remove_owned(&desktop, &receipts, "1-2").is_err());
        assert_eq!(fs::read(&link).unwrap(), b"foreign modified");
        publish(&temp, &desktop, &receipts, "3-4", "Bloodborne").unwrap();
        remove_owned(&desktop, &receipts, "3-4").unwrap();
        assert!(!desktop.join("PORT - Bloodborne (3-4).lnk").exists());
        assert!(publish(
            &temp,
            &desktop,
            &t.path().join("absent"),
            "5-6",
            "Bloodborne"
        )
        .is_err());
        assert!(!desktop.join("PORT - Bloodborne (5-6).lnk").exists());
    }
}
