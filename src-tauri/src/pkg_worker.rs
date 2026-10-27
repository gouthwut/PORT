#[cfg(port_pkg_worker)]
use crate::download;
use crate::package;
#[cfg(port_pkg_worker)]
use sha2::{Digest, Sha256};
use std::path::Path;
#[cfg(port_pkg_worker)]
use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    process::{Command, Stdio},
    time::{Duration, Instant},
};
type Result<T> = std::result::Result<T, String>;

pub fn base(paths: &[String]) -> Result<&str> {
    if paths.is_empty() || paths.len() > 2 {
        return Err("Выберите основной PKG и не более одного обновления".into());
    }
    let inspections = paths
        .iter()
        .map(|p| package::inspect_file(p))
        .collect::<Result<Vec<_>>>()?;
    let bases: Vec<_> = inspections
        .iter()
        .enumerate()
        .filter(|(_, p)| p.role == "base")
        .collect();
    if bases.len() != 1 {
        return Err("Нужен один основной PKG".into());
    }
    let (index, b) = bases[0];
    if b.title_id != "CUSA03173" {
        return Err("Нужен CUSA03173".into());
    }
    for p in &inspections {
        if p.content_id != b.content_id || !matches!(p.role.as_str(), "base" | "update") {
            return Err("PKG не согласованы по Content ID / типу".into());
        }
        if p.role == "update"
            && (p.version.as_deref() != Some("01.09")
                || b.version.as_deref().is_some_and(|v| v >= "01.09"))
        {
            return Err("Версия обновления не согласована с выбранной основной игрой".into());
        }
    }
    Ok(&paths[index])
}
#[cfg(port_pkg_worker)]
const BYTES: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/port-pkg-worker.exe"));
#[tauri::command]
pub fn pkg_install_available() -> bool {
    cfg!(port_pkg_worker)
}
pub fn extract(
    source: &str,
    target: &Path,
    cache: &Path,
    mut status: impl FnMut(u64, u64),
    cancel: impl Fn() -> bool,
) -> Result<()> {
    extract_kind(source, target, cache, &mut status, cancel, false)
}
pub fn extract_update(
    source: &str,
    target: &Path,
    cache: &Path,
    status: impl FnMut(u64, u64),
    cancel: impl Fn() -> bool,
) -> Result<()> {
    extract_kind(source, target, cache, status, cancel, true)
}
fn extract_kind(
    source: &str,
    target: &Path,
    cache: &Path,
    mut status: impl FnMut(u64, u64),
    cancel: impl Fn() -> bool,
    update: bool,
) -> Result<()> {
    #[cfg(not(port_pkg_worker))]
    {
        let _ = (source, target, cache, &mut status, cancel, update);
        Err("В этой сборке нет проверенного PKG worker. Соберите его по scripts/build-pkg-worker.ps1 либо импортируйте папку.".into())
    }
    #[cfg(port_pkg_worker)]
    {
        let root = cache
            .join("pkg-worker")
            .join(env!("PORT_PKG_WORKER_SHA256"));
        download::safe_existing(&root)?;
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let exe = root.join("port-pkg-worker.exe");
        download::safe_existing(&exe)?;
        if !exe.exists() {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&exe)
                .map_err(|e| e.to_string())?;
            file.write_all(BYTES).map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }
        let mut file = File::open(&exe).map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut buf = [0; 65536];
        loop {
            let n = file.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hash.update(&buf[..n]);
        }
        if format!("{:x}", hash.finalize()) != env!("PORT_PKG_WORKER_SHA256") {
            return Err("Хэш PKG worker изменён; запуск запрещён".into());
        }
        let mut command = Command::new(&exe);
        command
            .args([
                if update {
                    "--extract-confirmed-update"
                } else {
                    "--extract-base"
                },
                source,
            ])
            .arg(target)
            .current_dir(&root)
            .env("DOTNET_GCHeapHardLimit", "40000000")
            .env("DOTNET_EnableDiagnostics", "0")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        #[cfg(windows)]
        let _job = match ProcessJob::attach(&child) {
            Ok(job) => job,
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(e);
            }
        };
        let out = child.stdout.take().ok_or("Нет stdout worker")?;
        let error = child.stderr.take().ok_or("Нет stderr worker")?;
        let (sender, receiver) = std::sync::mpsc::sync_channel(16);
        let reader = std::thread::spawn(move || {
            let mut r = BufReader::new(out);
            loop {
                let mut bytes = Vec::new();
                match r.by_ref().take(4097).read_until(b'\n', &mut bytes) {
                    Ok(0) | Err(_) => break,
                    Ok(_) if bytes.len() > 4096 => break,
                    Ok(_) => {
                        if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                            if sender.send(value).is_err() {
                                break;
                            }
                        }
                    }
                }
            }
        });
        let errors = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = error.take(8192).read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).to_string()
        });
        let started = Instant::now();
        let mut stopped = None;
        let code = loop {
            while let Ok(value) = receiver.try_recv() {
                if let (Some(done), Some(total)) =
                    (value["completed"].as_u64(), value["total"].as_u64())
                {
                    status(done, total);
                }
            }
            if (cancel() || started.elapsed() > Duration::from_secs(45 * 60)) && stopped.is_none() {
                if let Some(input) = child.stdin.as_mut() {
                    let _ = input.write_all(b"cancel\n");
                }
                stopped = Some(Instant::now());
            }
            if stopped.is_some_and(|i| i.elapsed() > Duration::from_secs(5)) {
                let _ = child.kill();
            }
            match child.try_wait().map_err(|e| e.to_string())? {
                Some(code) => break code,
                None => std::thread::sleep(Duration::from_millis(100)),
            }
        };
        drop(receiver);
        let _ = reader.join();
        let error = errors.join().unwrap_or_default();
        if stopped.is_some() {
            return Err("Извлечение отменено или превышен лимит времени".into());
        }
        if !code.success() {
            return Err(format!("PKG worker завершился ({code}): {error}"));
        }
        Ok(())
    }
}

#[cfg(all(windows, port_pkg_worker))]
struct ProcessJob(windows_sys::Win32::Foundation::HANDLE);
#[cfg(all(windows, port_pkg_worker))]
impl ProcessJob {
    fn attach(child: &std::process::Child) -> Result<Self> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let job = Self(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_PROCESS_MEMORY
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
            limits.BasicLimitInformation.ActiveProcessLimit = 1;
            limits.ProcessMemoryLimit = 1536 * 1024 * 1024;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle()) == 0
            {
                return Err(format!(
                    "Не удалось ограничить процесс PKG worker: {}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(job)
        }
    }
}
#[cfg(all(windows, port_pkg_worker))]
impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
