// SPEC-035: barcode-scanner plugin is mobile-only.
//
// iOS: `NSCameraUsageDescription` is provided via
// `src-tauri/Info.ios.plist`, which Tauri merges into the generated
// `gen/apple/<app>_iOS/Info.plist` on each `pnpm tauri ios init` /
// `tauri ios build`. Edit that source file, never the generated one
// (`src-tauri/gen/` is .gitignored and regenerated).
// Android: `<uses-permission android:name="android.permission.CAMERA"/>`
// is auto-merged by the plugin's manifest at build time when
// `pnpm tauri android init` has been run.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            // Placeholder hash — SPEC-009 replaces with Argon2/scrypt.
            password.as_bytes().to_vec()
        }).build());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
