#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            // Placeholder hash — SPEC-009 replaces with Argon2/scrypt.
            password.as_bytes().to_vec()
        }).build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
