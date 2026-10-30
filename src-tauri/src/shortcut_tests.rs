use super::*;
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
fn ownership_repair_collision_legacy_and_no_library_writes() {
    let t = tempfile::tempdir().unwrap();
    let desktop = t.path().join("desktop");
    let receipts = t.path().join("receipts");
    fs::create_dir(&desktop).unwrap();
    fs::create_dir(&receipts).unwrap();
    let temp = t.path().join("test.lnk");
    fs::write(&temp, b"first").unwrap();
    publish(&temp, &desktop, &receipts, "1-2", "Bloodborne").unwrap();
    let link = desktop.join("Bloodborne.lnk");
    fs::write(&temp, b"repaired").unwrap();
    publish(&temp, &desktop, &receipts, "1-2", "Bloodborne").unwrap();
    assert_eq!(fs::read(&link).unwrap(), b"repaired");
    // Multiple installations of the same game may not steal one another's link.
    assert!(publish(&temp, &desktop, &receipts, "3-4", "Bloodborne")
        .unwrap_err()
        .contains("чужой"));
    assert!(!receipt_path(&receipts, "3-4").exists());
    fs::write(&link, b"manual modification").unwrap();
    assert!(publish(&temp, &desktop, &receipts, "1-2", "Bloodborne")
        .unwrap_err()
        .contains("изменён"));
    assert!(remove_owned(&desktop, &receipts, "1-2").is_err());
    assert_eq!(fs::read(&link).unwrap(), b"manual modification");
    // User removes the link: stale receipt must not prevent recreation.
    fs::remove_file(&link).unwrap();
    publish(&temp, &desktop, &receipts, "1-2", "Bloodborne").unwrap();
    remove_owned(&desktop, &receipts, "1-2").unwrap();
    assert!(!link.exists());
    // Unreceipted manual links stay byte-identical.
    fs::write(&link, b"foreign").unwrap();
    assert!(publish(&temp, &desktop, &receipts, "1-2", "Bloodborne").is_err());
    assert_eq!(fs::read(&link).unwrap(), b"foreign");
    fs::remove_file(&link).unwrap();
    // Legacy ID name migrates, only when the receipt matches.
    let old = desktop.join("PORT - Bloodborne (1-2).lnk");
    fs::write(&old, b"legacy").unwrap();
    fs::write(
        receipt_path(&receipts, "1-2"),
        serde_json::to_vec(&Receipt {
            id: "1-2".into(),
            path: old.clone(),
            sha256: hash(b"legacy"),
        })
        .unwrap(),
    )
    .unwrap();
    publish(&temp, &desktop, &receipts, "1-2", "Bloodborne").unwrap();
    assert!(!old.exists());
    assert!(link.exists());
    remove_owned(&desktop, &receipts, "1-2").unwrap();
    // Receipt publication fails: no untracked new shortcut remains.
    fs::create_dir(receipt_path(&receipts, "9-8")).unwrap();
    assert!(publish(&temp, &desktop, &receipts, "9-8", "Skate 3").is_err());
    assert!(!desktop.join("Skate 3.lnk").exists());
    // No DB file is created by any shortcut path.
    assert!(!t.path().join("port.db").exists());
}
pub(super) fn webp() -> Vec<u8> {
    use image::ImageEncoder;
    let mut out = Vec::new();
    let pixels = image::RgbaImage::from_pixel(40, 60, image::Rgba([160, 40, 90, 255]));
    image::codecs::webp::WebPEncoder::new_lossless(&mut out)
        .write_image(pixels.as_raw(), 40, 60, image::ExtendedColorType::Rgba8)
        .unwrap();
    out
}
#[test]
fn safe_icon_conversion_and_offline_content_addressed_cache() {
    let t = tempfile::tempdir().unwrap();
    let source = webp();
    let p = cache_icon(t.path(), &source).unwrap();
    assert_eq!(cache_icon(t.path(), &source).unwrap(), p);
    let bytes = fs::read(&p).unwrap();
    assert_eq!(&bytes[..6], &[0, 0, 1, 0, 4, 0]);
    assert_eq!(p.file_stem().unwrap().to_str().unwrap(), hash(&bytes));
    for (i, size) in [16, 32, 48, 256].into_iter().enumerate() {
        let at = 6 + i * 16;
        let len = u32::from_le_bytes(bytes[at + 8..at + 12].try_into().unwrap()) as usize;
        let offset = u32::from_le_bytes(bytes[at + 12..at + 16].try_into().unwrap()) as usize;
        let image = image::load_from_memory_with_format(
            &bytes[offset..offset + len],
            image::ImageFormat::Png,
        )
        .unwrap();
        assert_eq!((image.width(), image.height()), (size, size));
    }
    assert!(make_ico(b"<svg onload='bad'>").is_err());
    fs::write(&p, b"tampered").unwrap();
    assert!(cache_icon(t.path(), &source)
        .unwrap_err()
        .contains("изменён"));
}
#[test]
#[cfg(windows)]
fn actual_windows_create_read_execute_repair_delete_and_desktop_failures() {
    use std::os::windows::process::CommandExt;
    let t = tempfile::tempdir().unwrap();
    let desktop = t.path().join("Desktop space Юникод");
    fs::create_dir(&desktop).unwrap();
    let receipts = t.path().join("receipts");
    fs::create_dir(&receipts).unwrap();
    let exe = t.path().join("port shortcut probe.exe");
    let code = t.path().join("probe.rs");
    // A real isolated executable records the exact argv delivered by Windows Shell.
    // No real PORT DB, game, runtime or save is ever opened.
    fs::write(
        &code,
        r##"#![windows_subsystem="windows"]
fn main() {
 let args:Vec<String>=std::env::args().skip(1).collect();
 if let Some(out)=std::env::var_os("PORT_SHORTCUT_PROBE_OUTPUT") {
  std::fs::write(out,args.join("\n")).unwrap();
 }
}"##,
    )
    .unwrap();
    let compile = std::process::Command::new("rustc")
        .arg("--crate-name")
        .arg("shortcut_probe")
        .arg(&code)
        .arg("-o")
        .arg(&exe)
        .creation_flags(0x08000000)
        .output()
        .unwrap();
    assert!(
        compile.status.success(),
        "{}",
        String::from_utf8_lossy(&compile.stderr)
    );
    let icon = cache_icon(&receipts, &webp()).unwrap();
    let marker = t.path().join("argv.txt");
    for (id, name) in [("123-45", "Skate 3"), ("67-89", "Bloodborne")] {
        // Stale legacy temp no longer blocks the post-install call.
        fs::write(receipts.join(format!("{id}.tmp.lnk")), b"crash residue").unwrap();
        create_at(&desktop, &receipts, &exe, &icon, id, name).unwrap();
        let link = desktop.join(format!("{name}.lnk"));
        let output=std::process::Command::new(powershell().unwrap())
            .args(["-NoLogo","-NoProfile","-NonInteractive","-Command",r#"[Console]::OutputEncoding=[Text.UTF8Encoding]::new();$ErrorActionPreference='Stop';$p=$env:PORT_LINK;try{$p=(New-Object -ComObject Scripting.FileSystemObject).GetFile($p).ShortPath}catch{};$l=(New-Object -ComObject WScript.Shell).CreateShortcut($p);@{target=$l.TargetPath;args=$l.Arguments;icon=$l.IconLocation;cwd=$l.WorkingDirectory}|ConvertTo-Json -Compress;Start-Process -FilePath $env:PORT_LINK -WindowStyle Hidden"#])
            .env("PORT_LINK",&link).env("PORT_SHORTCUT_PROBE_OUTPUT",&marker).creation_flags(0x08000000).output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let r: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(
            r["target"].as_str().unwrap().to_lowercase(),
            exe.display().to_string().to_lowercase()
        );
        assert_eq!(r["args"], format!("--launch-installation {id}"));
        assert_eq!(
            r["icon"].as_str().unwrap().to_lowercase(),
            format!("{},0", icon.display()).to_lowercase()
        );
        assert_eq!(
            r["cwd"].as_str().unwrap().to_lowercase(),
            t.path().display().to_string().to_lowercase()
        );
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        while !marker.exists() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        assert_eq!(
            fs::read_to_string(&marker).unwrap(),
            format!("--launch-installation\n{id}")
        );
        fs::remove_file(&marker).unwrap();
        create_at(&desktop, &receipts, &exe, &icon, id, name).unwrap();
        fs::remove_file(&link).unwrap();
        create_at(&desktop, &receipts, &exe, &icon, id, name).unwrap();
        remove_owned(&desktop, &receipts, id).unwrap();
        assert!(!link.exists());
    }
    let error = create_at(
        &t.path().join("missing Desktop"),
        &receipts,
        &exe,
        &icon,
        "1-2",
        "Skate 3",
    )
    .unwrap_err();
    assert!(error.contains("missing Desktop"), "{error}");
    // An actual locked Windows file produces a concrete OS error and stays unchanged.
    let foreign = desktop.join("Skate 3.lnk");
    fs::write(&foreign, b"manual").unwrap();
    assert!(create_at(&desktop, &receipts, &exe, &exe, "1-2", "Skate 3")
        .unwrap_err()
        .contains("чужой"));
    assert_eq!(fs::read(&foreign).unwrap(), b"manual");
    // Fallback also roundtrips a real EXE IconLocation.
    fs::remove_file(&foreign).unwrap();
    create_at(&desktop, &receipts, &exe, &exe, "1-2", "Skate 3").unwrap();
    use std::os::windows::fs::OpenOptionsExt;
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&foreign)
        .unwrap();
    let error = create_at(&desktop, &receipts, &exe, &exe, "1-2", "Skate 3").unwrap_err();
    assert!(
        error.contains("32") || error.contains("другим процессом"),
        "{error}"
    );
    drop(held);
    remove_owned(&desktop, &receipts, "1-2").unwrap();
}
