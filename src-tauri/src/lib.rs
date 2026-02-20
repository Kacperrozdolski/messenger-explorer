mod db;
mod parser;

use std::path::PathBuf;
use std::sync::Mutex;
use rusqlite::Connection;
use tauri::Manager;

use db::queries::{
    self, ConversationInfo, ImportStatus, MediaContext, MediaFilters, MediaItem, SenderInfo,
    TimelineEntry,
};
use db::writer::ImportStats;

/// Managed state: holds the path to the SQLite database.
struct DbState {
    db_path: PathBuf,
    conn: Mutex<Connection>,
}

#[tauri::command]
fn cmd_get_import_status(state: tauri::State<'_, DbState>) -> Result<ImportStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_import_status(&conn)
}

#[tauri::command]
fn cmd_import_export(
    state: tauri::State<'_, DbState>,
    export_path: String,
    context_window: Option<usize>,
) -> Result<ImportStats, String> {
    let window_size = context_window.unwrap_or(5);
    let export_root = PathBuf::from(&export_path);

    if !export_root.exists() {
        return Err(format!("Export path does not exist: {}", export_path));
    }

    // Parse the export
    let parse_result = parser::parse_export(&export_root, window_size)?;

    // Clear existing data and insert new
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::schema::clear_all(&conn).map_err(|e| e.to_string())?;
    let stats = db::writer::insert_all(&mut conn, &parse_result)?;

    log::info!(
        "Import complete: {} conversations, {} media, {} senders",
        stats.conversations,
        stats.media,
        stats.senders
    );

    Ok(stats)
}

#[tauri::command]
fn cmd_get_conversations(state: tauri::State<'_, DbState>) -> Result<Vec<ConversationInfo>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_conversations(&conn)
}

#[tauri::command]
fn cmd_get_senders(state: tauri::State<'_, DbState>) -> Result<Vec<SenderInfo>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_senders(&conn)
}

#[tauri::command]
fn cmd_get_media(state: tauri::State<'_, DbState>, filters: MediaFilters) -> Result<Vec<MediaItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_media(&conn, &filters)
}

#[tauri::command]
fn cmd_get_context(state: tauri::State<'_, DbState>, media_id: i64) -> Result<MediaContext, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_context(&conn, media_id)
}

#[tauri::command]
fn cmd_get_timeline(state: tauri::State<'_, DbState>) -> Result<Vec<TimelineEntry>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_timeline(&conn)
}

#[derive(serde::Serialize)]
struct StorageInfo {
    db_size_bytes: u64,
}

#[tauri::command]
fn cmd_get_storage_info(state: tauri::State<'_, DbState>) -> Result<StorageInfo, String> {
    let size = std::fs::metadata(&state.db_path)
        .map(|m| m.len())
        .unwrap_or(0);
    Ok(StorageInfo { db_size_bytes: size })
}

#[tauri::command]
fn cmd_clear_database(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::schema::clear_all(&conn).map_err(|e| e.to_string())?;
    // Reclaim disk space
    conn.execute_batch("VACUUM;").map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let app_data = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&app_data).ok();
            let db_path = app_data.join("explorer.db");

            let conn = Connection::open(&db_path)
                .expect("Failed to open database");
            db::schema::initialize(&conn)
                .expect("Failed to initialize database schema");

            app.manage(DbState {
                db_path,
                conn: Mutex::new(conn),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_get_import_status,
            cmd_import_export,
            cmd_get_conversations,
            cmd_get_senders,
            cmd_get_media,
            cmd_get_context,
            cmd_get_timeline,
            cmd_get_storage_info,
            cmd_clear_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
