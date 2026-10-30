fn main() {
    assert!(
        std::env::var("PORT_BETA_BUILD").as_deref() != Ok("1")
            || std::env::var_os("CARGO_FEATURE_DOWNLOAD_E2E_QA").is_none(),
        "production beta builds must not include download-e2e-qa"
    );
    println!("cargo:rustc-check-cfg=cfg(port_pkg_worker)");
    println!("cargo:rerun-if-env-changed=PORT_UPDATER_CHANNEL_FILE");
    let channel = std::env::var("PORT_UPDATER_CHANNEL_FILE")
        .unwrap_or_else(|_| "updater-channel.json".into());
    println!("cargo:rerun-if-changed={channel}");
    std::fs::copy(
        &channel,
        std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("updater-channel.json"),
    )
    .expect("copy compiled public updater channel");
    tauri_build::build()
}
