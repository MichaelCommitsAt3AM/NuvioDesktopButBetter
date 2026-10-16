fn main() {
    println!("cargo:rerun-if-env-changed=NUVIO_PACKAGE_FORMAT");
    println!(
        "cargo:rustc-env=NUVIO_PACKAGE_FORMAT={}",
        std::env::var("NUVIO_PACKAGE_FORMAT").unwrap_or_default()
    );
    tauri_build::build()
}
