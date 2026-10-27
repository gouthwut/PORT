fn main() {
    use sha2::{Digest, Sha256};
    println!("cargo:rustc-check-cfg=cfg(port_pkg_worker)");
    let worker = std::path::Path::new("../.local/pkg-worker/port-pkg-worker.exe");
    println!("cargo:rerun-if-changed={}", worker.display());
    if worker.exists() {
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
