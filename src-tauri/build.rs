fn main() {
    assert!(
        std::env::var("PORT_BETA_BUILD").as_deref() != Ok("1")
            || std::env::var_os("CARGO_FEATURE_DOWNLOAD_E2E_QA").is_none(),
        "production beta builds must not include download-e2e-qa"
    );
    println!("cargo:rerun-if-env-changed=PORT_UPDATER_CHANNEL_FILE");
    let channel = std::env::var("PORT_UPDATER_CHANNEL_FILE")
        .unwrap_or_else(|_| "updater-channel.json".into());
    println!("cargo:rerun-if-changed={channel}");
    std::fs::copy(
        &channel,
        std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("updater-channel.json"),
    )
    .expect("copy compiled public updater channel");
    use sha2::{Digest, Sha256};
    println!("cargo:rustc-check-cfg=cfg(port_pkg_worker)");
    println!("cargo:rerun-if-env-changed=PORT_BETA_BUILD");
    let worker = std::path::Path::new("../.local/pkg-worker/port-pkg-worker.exe");
    println!("cargo:rerun-if-changed={}", worker.display());
    // Distribution candidates omit the optional local LGPL worker and private inputs.
    if worker.exists() && std::env::var("PORT_BETA_BUILD").as_deref() != Ok("1") {
        let bytes = std::fs::read(worker).expect("read locally built PKG worker");
        assert!(bytes.len() < 128 * 1024 * 1024 && bytes.starts_with(b"MZ"));
        let hash = format!("{:x}", Sha256::digest(&bytes));
        std::fs::write(
            std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("port-pkg-worker.exe"),
            bytes,
        )
        .expect("embed worker");
        println!("cargo:rustc-cfg=port_pkg_worker");
        println!("cargo:rustc-env=PORT_PKG_WORKER_SHA256={hash}");
    }
    tauri_build::build()
}
