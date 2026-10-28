use super::*;
use std::io::Cursor;
pub(super) fn status() -> Arc<Mutex<Status>> {
    Arc::default()
}
pub(super) fn metadata(version: Option<&str>) -> Vec<u8> {
    let mut pairs = vec![("TITLE_ID", "CUSA03173"), ("CATEGORY", "gd")];
    if let Some(v) = version {
        pairs.push(("APP_VER", v));
    }
    let keys = 20 + pairs.len() * 16;
    let values = keys + pairs.iter().map(|(k, _)| k.len() + 1).sum::<usize>();
    let mut b = vec![0u8; values + pairs.iter().map(|(_, v)| v.len() + 1).sum::<usize>()];
    b[..4].copy_from_slice(b"\0PSF");
    b[8..12].copy_from_slice(&(keys as u32).to_le_bytes());
    b[12..16].copy_from_slice(&(values as u32).to_le_bytes());
    b[16..20].copy_from_slice(&(pairs.len() as u32).to_le_bytes());
    let (mut k, mut v) = (0, 0);
    for (i, (key, value)) in pairs.into_iter().enumerate() {
        let p = 20 + i * 16;
        b[p..p + 2].copy_from_slice(&(k as u16).to_le_bytes());
        b[p + 2..p + 4].copy_from_slice(&0x204u16.to_le_bytes());
        b[p + 4..p + 8].copy_from_slice(&((value.len() + 1) as u32).to_le_bytes());
        b[p + 12..p + 16].copy_from_slice(&(v as u32).to_le_bytes());
        b[keys + k..keys + k + key.len()].copy_from_slice(key.as_bytes());
        b[values + v..values + v + value.len()].copy_from_slice(value.as_bytes());
        k += key.len() + 1;
        v += value.len() + 1;
    }
    b
}
pub(super) fn fixture(root: &Path, version: Option<&str>) {
    for dir in ["sce_sys", "sce_module", "dvdroot_ps4/shader"] {
        fs::create_dir_all(root.join(dir)).unwrap();
    }
    fs::write(root.join("eboot.bin"), [0x4f, 0x15, 0x3d, 0x1d, 0, 0, 0, 0]).unwrap();
    fs::write(root.join("sce_sys/param.sfo"), metadata(version)).unwrap();
    fs::write(root.join("sce_module/module.sprx"), b"fixture").unwrap();
    fs::write(
        root.join("dvdroot_ps4/shader/gxshader.shaderbnd.dcx"),
        b"fixture",
    )
    .unwrap();
}
#[test]
fn folder_metadata_never_invents_version_and_rejects_update_only() {
    let temp = tempfile::tempdir().unwrap();
    fixture(temp.path(), Some("01.09"));
    assert_eq!(
        inspect(temp.path(), &status(), false)
            .unwrap()
            .0
            .version
            .as_deref(),
        Some("01.09")
    );
    assert!(inspect(temp.path(), &status(), true)
        .unwrap_err()
        .contains("20000"));
    fs::write(temp.path().join("sce_sys/param.sfo"), metadata(None)).unwrap();
    assert_eq!(
        inspect(temp.path(), &status(), false).unwrap().0.version,
        None
    );
    fs::remove_file(temp.path().join("eboot.bin")).unwrap();
    assert!(inspect(temp.path(), &status(), false)
        .unwrap_err()
        .contains("eboot.bin"));
}
#[test]
fn stream_fits_small_windows_worker_stack() {
    const CHILD: &str = "PORT_STREAM_STACK_CHILD";
    if std::env::var_os(CHILD).is_none() {
        let result = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "install::tests::stream_fits_small_windows_worker_stack",
                "--nocapture",
            ])
            .env(CHILD, "1")
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "small-stack child failed: {:?} {}",
            result.status,
            String::from_utf8_lossy(&result.stderr)
        );
        return;
    }
    std::thread::Builder::new()
        .stack_size(512 * 1024)
        .spawn(|| {
            let mut file = tempfile::tempfile().unwrap();
            file.write_all(b"abc").unwrap();
            file.seek(std::io::SeekFrom::Start(0)).unwrap();
            assert_eq!(
                stream(file, None, 3, &status()).unwrap(),
                format!("{:x}", Sha256::digest(b"abc"))
            );
        })
        .unwrap()
        .join()
        .unwrap();
}
#[test]
fn stream_exact_length_hash_and_cancellation() {
    let temp = tempfile::tempdir().unwrap();
    let p = temp.path().join("copy");
    let s = status();
    assert_eq!(
        stream(Cursor::new(b"abc"), Some(&p), 3, &s).unwrap(),
        format!("{:x}", Sha256::digest(b"abc"))
    );
    assert_eq!(fs::read(&p).unwrap(), b"abc");
    assert!(stream(Cursor::new(b"other"), Some(&p), 5, &s).is_err());
    assert!(stream(Cursor::new(b"abc"), None, 2, &s).is_err());
    assert!(stream(Cursor::new(b"abc"), None, 4, &s).is_err());
    s.lock().unwrap().cancel = true;
    assert!(stream(Cursor::new(b"abc"), None, 3, &s).is_err());
}
#[test]
fn paths_space_and_exclusive_operation() {
    for p in ["../bad", "a/CON.txt", "a/b:stream", "C:/bad", "a/../b"] {
        assert!(relative(p).is_err());
    }
    let temp = tempfile::tempdir().unwrap();
    assert!(space(temp.path(), u64::MAX).is_err());
    let state = Installer::default();
    let guard = operation(&state, "verifying").unwrap();
    assert!(operation(&state, "removing").is_err());
    drop(guard);
    assert!(operation(&state, "launching").is_ok());
}
#[test]
#[cfg(windows)]
fn running_process_is_detected_without_a_saved_child_handle() {
    let exe = std::env::current_exe().unwrap();
    assert!(in_use(exe.parent().unwrap()).unwrap());
}
#[test]
fn recovery_removes_owned_incomplete_stage_preserves_settings() {
    let temp = tempfile::tempdir().unwrap();
    let id = "123";
    let stage = temp.path().join(".port-stage-123");
    let root = temp.path().join("PORT-Bloodborne-123");
    fs::create_dir(&stage).unwrap();
    fs::write(stage.join("port-owner"), id).unwrap();
    fs::write(stage.join("partial"), b"partial").unwrap();
    let db = Connection::open_in_memory().unwrap();
    crate::init(&db).unwrap();
    db.execute(
        "INSERT INTO settings VALUES(1,?1)",
        [serde_json::to_string(&crate::Settings::default()).unwrap()],
    )
    .unwrap();
    db.execute(
        "INSERT INTO installation_jobs VALUES(?1,?2,?3)",
        params![id, stage.display().to_string(), root.display().to_string()],
    )
    .unwrap();
    recover(&db).unwrap();
    assert!(!stage.exists());
    assert_eq!(crate::read(&db).unwrap(), crate::Settings::default());
    assert!(records(&db).unwrap().is_empty());
}
#[test]
fn sqlite_manifest_tampering_and_runtime_injection_are_blocked() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("PORT-Bloodborne-123");
    fs::create_dir(&root).unwrap();
    fs::create_dir(root.join(RUNTIME)).unwrap();
    let p = root.join(RUNTIME).join("Bloodborne.exe");
    fs::write(&p, b"MZ-fixture").unwrap();
    let file = Entry {
        path: format!("{RUNTIME}/Bloodborne.exe"),
        size: 10,
        sha256: format!("{:x}", Sha256::digest(b"MZ-fixture")),
    };
    let m = Manifest {
        schema: 1,
        id: "123".into(),
        version: None,
        files: vec![file],
    };
    let bytes = serde_json::to_vec(&m).unwrap();
    fs::write(root.join("port-manifest.json"), &bytes).unwrap();
    let r = Installation {
        id: "123".into(),
        collection_id: "bloodborne".into(),
        root: root.display().to_string(),
        data_path: root.join("CUSA03173").display().to_string(),
        runtime_path: root.join(RUNTIME).display().to_string(),
        version: None,
        manifest_sha256: format!("{:x}", Sha256::digest(&bytes)),
    };
    let db = Connection::open_in_memory().unwrap();
    crate::init(&db).unwrap();
    register(&db, &r).unwrap();
    assert_eq!(records(&db).unwrap()[0].id, "123");
    // Fixture is 10 bytes? Set expected to actual to exercise content validation separately.
    let mut m = m;
    m.files[0].size = fs::metadata(&p).unwrap().len();
    let bytes = serde_json::to_vec(&m).unwrap();
    fs::write(root.join("port-manifest.json"), &bytes).unwrap();
    let mut r = r;
    r.manifest_sha256 = format!("{:x}", Sha256::digest(&bytes));
    verify(&r, false, &status()).unwrap();
    fs::write(root.join(RUNTIME).join("injected.dll"), b"x").unwrap();
    assert!(verify(&r, false, &status())
        .unwrap_err()
        .contains("посторонние"));
    fs::remove_file(root.join(RUNTIME).join("injected.dll")).unwrap();
    fs::write(&p, b"modified").unwrap();
    assert!(verify(&r, false, &status()).is_err());
    fs::write(root.join("port-manifest.json"), b"{}").unwrap();
    assert!(load_manifest(&r).is_err());
}
