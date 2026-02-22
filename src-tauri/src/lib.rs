mod db;
mod parser;

use std::path::PathBuf;
use std::sync::Mutex;
use rusqlite::Connection;
use tauri::Manager;

use db::queries::{
    self, ConversationInfo, ImportStatus, MediaContext, MediaFilters, MediaItem, SenderInfo,
    SourceInfo, TimelineEntry,
};
use db::writer::ImportStats;

/// Managed state: holds the path to the SQLite database.
struct DbState {
    db_path: PathBuf,
    conn: Mutex<Connection>,
}

/// Decode percent-encoded URL path back to a filesystem path.
fn percent_decode(input: &str) -> String {
    let mut result = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}

fn guess_mime(path: &PathBuf) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("avi") => "video/x-msvideo",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn cmd_get_import_status(state: tauri::State<'_, DbState>) -> Result<ImportStatus, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_import_status(&conn)
}

#[tauri::command]
fn cmd_import_export(
    state: tauri::State<'_, DbState>,
    export_paths: Vec<String>,
    context_window: Option<usize>,
) -> Result<ImportStats, String> {
    let window_size = context_window.unwrap_or(5);

    // Parse all paths first (before touching the database)
    let mut all_conversations = Vec::new();
    let mut normalized_paths = Vec::new();
    for path_str in &export_paths {
        let export_root = PathBuf::from(path_str);
        if !export_root.exists() {
            return Err(format!("Export path does not exist: {}", path_str));
        }

        let parse_result = parser::parse_export(&export_root, window_size)
            .map_err(|e| format!("Error parsing {}: {}", path_str, e))?;
        all_conversations.extend(parse_result.conversations);
        normalized_paths.push(export_root.to_string_lossy().to_string());
    }

    let combined = parser::ParseResult {
        conversations: all_conversations,
    };

    // Clear and insert within a single transaction
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for norm_path in &normalized_paths {
        db::schema::clear_source(&tx, norm_path).map_err(|e| e.to_string())?;
    }

    let stats = db::writer::insert_all(&tx, &combined)?;
    tx.commit().map_err(|e| e.to_string())?;

    log::info!(
        "Import complete: {} conversations, {} media, {} senders",
        stats.conversations,
        stats.media,
        stats.senders
    );

    Ok(stats)
}

#[tauri::command]
fn cmd_add_source(
    state: tauri::State<'_, DbState>,
    export_path: String,
    context_window: Option<usize>,
) -> Result<ImportStats, String> {
    let window_size = context_window.unwrap_or(5);
    let export_root = PathBuf::from(&export_path);

    if !export_root.exists() {
        return Err(format!("Export path does not exist: {}", export_path));
    }

    // Parse first (before touching the database)
    let parse_result = parser::parse_export(&export_root, window_size)?;

    // Use normalized path to match what the parser stores in source_path
    let normalized_path = export_root.to_string_lossy().to_string();

    // Clear and insert within a single transaction
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Clear any existing data from this source path (handles re-import of same folder)
    db::schema::clear_source(&tx, &normalized_path).map_err(|e| e.to_string())?;

    // Insert additively (no global clear)
    let stats = db::writer::insert_all(&tx, &parse_result)?;
    tx.commit().map_err(|e| e.to_string())?;

    log::info!(
        "Added source {}: {} conversations, {} media, {} senders",
        normalized_path,
        stats.conversations,
        stats.media,
        stats.senders
    );

    Ok(stats)
}

#[tauri::command]
fn cmd_get_sources(state: tauri::State<'_, DbState>) -> Result<Vec<SourceInfo>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_sources(&conn)
}

#[tauri::command]
fn cmd_remove_source(
    state: tauri::State<'_, DbState>,
    source_path: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::schema::clear_source(&conn, &source_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn cmd_detect_format(
    export_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(&export_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", export_path));
    }
    let format = parser::detect_format(&path)?;
    Ok(match format {
        parser::DataFormat::Facebook => "facebook".to_string(),
        parser::DataFormat::Messenger => "messenger".to_string(),
    })
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
        .plugin(tauri_plugin_shell::init())
        .register_uri_scheme_protocol("media", |_ctx, request| {
            // Extract the file path from the URI path component and percent-decode it.
            // convertFileSrc produces: http://media.localhost/<encodeURIComponent(path)> on Windows
            // The URI path() gives: /<encoded_path>
            let uri_path = request.uri().path();
            let raw_path = uri_path.strip_prefix('/').unwrap_or(uri_path);
            // Also strip query string if present
            let raw_path = raw_path.split('?').next().unwrap_or(raw_path);
            let decoded = percent_decode(raw_path);
            let file_path = PathBuf::from(&decoded);

            if !file_path.exists() {
                return tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap();
            }

            match std::fs::read(&file_path) {
                Ok(bytes) => {
                    let mime = guess_mime(&file_path);
                    tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .body(bytes)
                        .unwrap()
                }
                Err(_) => tauri::http::Response::builder()
                    .status(500)
                    .body(Vec::new())
                    .unwrap(),
            }
        })
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
            // Disable FK enforcement — we manage cascading deletes manually in clear_source
            conn.execute_batch("PRAGMA foreign_keys = OFF;")
                .expect("Failed to set pragmas");
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
            cmd_add_source,
            cmd_get_sources,
            cmd_remove_source,
            cmd_detect_format,
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
