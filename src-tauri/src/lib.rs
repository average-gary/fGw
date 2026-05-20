// SPEC-035: barcode-scanner plugin is mobile-only.
//
// iOS additionally requires `NSCameraUsageDescription` in the generated
// `gen/apple/<app>/Info.plist` (added by `pnpm tauri ios init`; not configurable
// from this file). Android receives `<uses-permission android:name=
// "android.permission.CAMERA"/>` automatically via the plugin's manifest merger
// when `pnpm tauri android init` is run.
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
