mod clip;
mod db;
mod parser;
mod pdf_export;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use rusqlite::Connection;
use tauri::{Emitter, Manager};

use db::queries::{
    self, AlbumInfo, ConversationInfo, FilterFacets, ImportStatus, MediaContext, MediaFilters,
    MediaItem, MediaPage, MonthPageFilters, SenderInfo, SourceInfo, TimelineEntry,
    UnindexedCounts,
};
use db::writer::{self as db_writer, ImportStats};

/// Managed state: holds the path to the SQLite database.
struct DbState {
    db_path: PathBuf,
    conn: Mutex<Connection>,
}

/// Managed state for CLIP AI search.
struct ClipState {
    models_dir: PathBuf,
    model: Mutex<Option<clip::ClipModel>>,
    indexing: AtomicBool,
    cancel_flag: AtomicBool,
    /// Live progress counters updated by the indexing thread.
    progress_indexed: AtomicU64,
    progress_total: AtomicU64,
    /// Which sender/conversation IDs are being indexed (empty = all).
    /// Stored so the frontend can restore the selection after navigating away.
    indexing_scope: Mutex<IndexingScope>,
}

#[derive(Clone, Default, serde::Serialize)]
struct IndexingScope {
    sender_ids: Vec<i64>,
    conversation_ids: Vec<i64>,
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

/// Parse an HTTP Range header value like "bytes=0-1023" or "bytes=500-".
/// Returns (start, end) inclusive byte range, capped to file_size.
fn parse_range(range_str: &str, file_size: u64) -> Option<(u64, u64)> {
    let range_str = range_str.strip_prefix("bytes=")?;
    let mut parts = range_str.splitn(2, '-');
    let start_str = parts.next()?.trim();
    let end_str = parts.next()?.trim();

    let start: u64 = if start_str.is_empty() {
        let suffix: u64 = end_str.parse().ok()?;
        file_size.saturating_sub(suffix)
    } else {
        start_str.parse().ok()?
    };

    let end: u64 = if end_str.is_empty() {
        // Cap open-ended ranges to 2MB chunks
        (start + 2 * 1024 * 1024 - 1).min(file_size - 1)
    } else {
        end_str.parse::<u64>().ok()?.min(file_size - 1)
    };

    if start <= end && start < file_size {
        Some((start, end))
    } else {
        None
    }
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
async fn cmd_import_export(
    state: tauri::State<'_, DbState>,
    export_paths: Vec<String>,
    context_window: Option<usize>,
) -> Result<ImportStats, String> {
    let window_size = context_window.unwrap_or(5);

    // Parse all paths on a blocking thread (heavy I/O, no DB needed)
    let paths = export_paths.clone();
    let parsed = tauri::async_runtime::spawn_blocking(move || {
        let mut all_conversations = Vec::new();
        let mut normalized_paths = Vec::new();
        for path_str in &paths {
            let export_root = PathBuf::from(path_str);
            if !export_root.exists() {
                return Err(format!("Export path does not exist: {}", path_str));
            }

            let parse_result = parser::parse_export(&export_root, window_size)
                .map_err(|e| format!("Error parsing {}: {}", path_str, e))?;
            all_conversations.extend(parse_result.conversations);
            normalized_paths.push(export_root.to_string_lossy().to_string());
        }
        Ok((all_conversations, normalized_paths))
    })
    .await
    .map_err(|e| e.to_string())??;

    let (all_conversations, normalized_paths) = parsed;
    let combined = parser::ParseResult {
        conversations: all_conversations,
    };

    // DB write phase — hold the lock only for the actual transaction
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for norm_path in &normalized_paths {
        db::schema::clear_source(&tx, norm_path).map_err(|e| e.to_string())?;
    }

    let stats = db::writer::insert_all(&tx, &combined)?;
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);

    log::info!(
        "Import complete: {} conversations, {} media, {} senders",
        stats.conversations,
        stats.media,
        stats.senders
    );

    Ok(stats)
}

#[tauri::command]
async fn cmd_add_source(
    state: tauri::State<'_, DbState>,
    export_path: String,
    context_window: Option<usize>,
) -> Result<ImportStats, String> {
    let window_size = context_window.unwrap_or(5);
    let path = export_path.clone();

    // Parse on a blocking thread (heavy I/O, no DB needed)
    let parse_result = tauri::async_runtime::spawn_blocking(move || {
        let export_root = PathBuf::from(&path);
        if !export_root.exists() {
            return Err(format!("Export path does not exist: {}", path));
        }
        let result = parser::parse_export(&export_root, window_size)?;
        let normalized_path = export_root.to_string_lossy().to_string();
        Ok((result, normalized_path))
    })
    .await
    .map_err(|e| e.to_string())??;

    let (parse_result, normalized_path) = parse_result;

    // DB write phase — hold the lock only for the actual transaction
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    db::schema::clear_source(&tx, &normalized_path).map_err(|e| e.to_string())?;

    let stats = db::writer::insert_all(&tx, &parse_result)?;
    tx.commit().map_err(|e| e.to_string())?;
    drop(conn);

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

    // If the source was extracted from a zip, clean up the extracted directory
    if source_path.contains("zip_extracts") {
        let mut dir = PathBuf::from(&source_path);
        loop {
            if let Some(parent) = dir.parent() {
                if parent.file_name().map_or(false, |n| n == "zip_extracts") {
                    let _ = std::fs::remove_dir_all(&dir);
                    break;
                }
                dir = parent.to_path_buf();
            } else {
                break;
            }
        }
    }

    Ok(())
}

#[derive(serde::Serialize, Clone)]
struct DetectFormatResult {
    format: String,
    #[serde(rename = "resolvedPath")]
    resolved_path: String,
}

#[tauri::command]
fn cmd_detect_format(
    export_path: String,
) -> Result<Vec<DetectFormatResult>, String> {
    let path = PathBuf::from(&export_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", export_path));
    }

    // Handle zip files by peeking inside
    if path.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("zip")) {
        let (format, _prefix) = parser::detect_format_zip(&path)?;
        let fmt_str = match format {
            parser::DataFormat::Facebook => "facebook",
            parser::DataFormat::Messenger => "messenger",
        };
        return Ok(vec![DetectFormatResult {
            format: fmt_str.to_string(),
            resolved_path: export_path,
        }]);
    }

    let matches = parser::detect_format_flexible(&path)?;
    let results: Vec<DetectFormatResult> = matches
        .into_iter()
        .map(|(format, resolved)| {
            let fmt_str = match format {
                parser::DataFormat::Facebook => "facebook",
                parser::DataFormat::Messenger => "messenger",
            };
            DetectFormatResult {
                format: fmt_str.to_string(),
                resolved_path: resolved.to_string_lossy().to_string(),
            }
        })
        .collect();
    Ok(results)
}

#[tauri::command]
async fn cmd_extract_zip(
    app_handle: tauri::AppHandle,
    zip_path: String,
) -> Result<String, String> {
    cmd_extract_zips(app_handle, vec![zip_path]).await
}

#[tauri::command]
async fn cmd_extract_zips(
    app_handle: tauri::AppHandle,
    zip_paths: Vec<String>,
) -> Result<String, String> {
    if zip_paths.is_empty() {
        return Err("No zip files provided".into());
    }

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let extracts_dir = app_data.join("zip_extracts");
    std::fs::create_dir_all(&extracts_dir)
        .map_err(|e| format!("Failed to create extracts directory: {}", e))?;

    // Use a single shared directory for all zips (so multi-part exports merge)
    let first_zip = PathBuf::from(&zip_paths[0]);
    let stem = first_zip
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("export");
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let dest_dir = extracts_dir.join(format!("{}_{}", stem, ts));
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Failed to create extraction directory: {}", e))?;

    // Run extraction on a blocking thread so the async runtime stays free
    let paths = zip_paths.clone();
    let dest = dest_dir.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut export_root = dest.clone();
        for zip_path_str in &paths {
            let zip = PathBuf::from(zip_path_str);
            if !zip.exists() {
                return Err(format!("Zip file does not exist: {}", zip_path_str));
            }
            export_root = parser::extract_zip(&zip, &dest)?;
        }
        Ok(export_root.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?;

    result
}

#[tauri::command]
fn cmd_cleanup_zip_extract(extracted_path: String) -> Result<(), String> {
    let path = PathBuf::from(&extracted_path);
    // Safety: only allow deleting paths under zip_extracts
    let path_str = path.to_string_lossy();
    if !path_str.contains("zip_extracts") {
        return Err("Cannot cleanup path outside of zip_extracts directory".into());
    }
    // Walk up to find the zip_extracts/<name_timestamp> directory to remove
    let mut dir = path.clone();
    loop {
        if let Some(parent) = dir.parent() {
            if parent.file_name().map_or(false, |n| n == "zip_extracts") {
                // `dir` is the extraction root (e.g. zip_extracts/export_123456)
                std::fs::remove_dir_all(&dir)
                    .map_err(|e| format!("Failed to cleanup: {}", e))?;
                return Ok(());
            }
            dir = parent.to_path_buf();
        } else {
            break;
        }
    }
    Err("Could not determine extraction root to cleanup".into())
}

#[tauri::command]
fn cmd_remove_sender(
    state: tauri::State<'_, DbState>,
    sender_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::schema::clear_sender(&conn, sender_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn cmd_remove_conversation(
    state: tauri::State<'_, DbState>,
    conversation_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::schema::clear_conversation(&conn, conversation_id).map_err(|e| e.to_string())?;
    Ok(())
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
fn cmd_get_media_page(state: tauri::State<'_, DbState>, filters: MonthPageFilters) -> Result<MediaPage, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_media_month_page(&conn, &filters)
}

#[tauri::command]
fn cmd_get_media_count(state: tauri::State<'_, DbState>, filters: MediaFilters) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_media_count(&conn, &filters)
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

#[tauri::command]
fn cmd_get_filter_facets(state: tauri::State<'_, DbState>, filters: MediaFilters) -> Result<FilterFacets, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_filter_facets(&conn, &filters)
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

#[tauri::command]
fn cmd_get_albums(state: tauri::State<'_, DbState>) -> Result<Vec<AlbumInfo>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_albums(&conn)
}

#[tauri::command]
fn cmd_create_album(state: tauri::State<'_, DbState>, name: String, color: String) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db_writer::create_album(&conn, &name, &color)
}

#[tauri::command]
fn cmd_rename_album(state: tauri::State<'_, DbState>, album_id: i64, name: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db_writer::rename_album(&conn, album_id, &name)
}

#[tauri::command]
fn cmd_delete_album(state: tauri::State<'_, DbState>, album_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db_writer::delete_album(&conn, album_id)
}

#[tauri::command]
fn cmd_update_album_color(state: tauri::State<'_, DbState>, album_id: i64, color: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db_writer::update_album_color(&conn, album_id, &color)
}

#[tauri::command]
fn cmd_add_media_to_album(state: tauri::State<'_, DbState>, album_id: i64, media_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db_writer::add_media_to_album(&conn, album_id, media_id)
}

#[tauri::command]
fn cmd_remove_media_from_album(state: tauri::State<'_, DbState>, album_id: i64, media_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db_writer::remove_media_from_album(&conn, album_id, media_id)
}

#[tauri::command]
fn cmd_get_media_by_ids(state: tauri::State<'_, DbState>, ids: Vec<i64>) -> Result<Vec<MediaItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_media_by_ids(&conn, &ids)
}

#[tauri::command]
fn cmd_get_media_albums(state: tauri::State<'_, DbState>, media_id: i64) -> Result<Vec<i64>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_media_albums(&conn, media_id)
}

#[derive(serde::Serialize)]
struct ExportPdfResult {
    exported_count: usize,
    skipped_count: usize,
}

// --- AI Search commands ---

#[derive(Clone, serde::Serialize)]
struct IndexingProgress {
    indexed: u64,
    total: u64,
    is_running: bool,
}

#[tauri::command]
fn cmd_get_indexing_status(
    db_state: tauri::State<'_, DbState>,
    clip_state: tauri::State<'_, ClipState>,
) -> Result<IndexingProgress, String> {
    let is_running = clip_state.indexing.load(Ordering::Relaxed);

    // While indexing is running, return the live progress from the indexing thread
    // instead of querying the DB (which would show the full unfiltered counts).
    if is_running {
        return Ok(IndexingProgress {
            indexed: clip_state.progress_indexed.load(Ordering::Relaxed),
            total: clip_state.progress_total.load(Ordering::Relaxed),
            is_running: true,
        });
    }

    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    let indexed: u64 = conn
        .query_row("SELECT COUNT(*) FROM media_embeddings", [], |row| row.get(0))
        .unwrap_or(0);
    let total: u64 = conn
        .query_row(
            "SELECT COUNT(*) FROM media WHERE file_type = 'image'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(IndexingProgress {
        indexed,
        total,
        is_running: false,
    })
}

#[tauri::command]
fn cmd_has_clip_models(clip_state: tauri::State<'_, ClipState>) -> Result<bool, String> {
    let dir = &clip_state.models_dir;
    let found = dir.join("clip-visual.onnx").exists()
        && dir.join("clip-textual.onnx").exists()
        && dir.join("tokenizer.json").exists()
        && dir.join("onnxruntime.dll").exists();
    Ok(found)
}

#[tauri::command]
fn cmd_start_indexing(
    app_handle: tauri::AppHandle,
    db_state: tauri::State<'_, DbState>,
    clip_state: tauri::State<'_, ClipState>,
) -> Result<(), String> {
    if clip_state.indexing.load(Ordering::Relaxed) {
        return Err("Indexing is already running".to_string());
    }

    // Pre-initialize ORT on the calling thread
    clip::init_ort(&clip_state.models_dir)?;

    clip_state.indexing.store(true, Ordering::Relaxed);
    clip_state.cancel_flag.store(false, Ordering::Relaxed);
    clip_state.progress_indexed.store(0, Ordering::Relaxed);
    clip_state.progress_total.store(0, Ordering::Relaxed);
    {
        let mut scope = clip_state.indexing_scope.lock().map_err(|e| e.to_string())?;
        *scope = IndexingScope::default(); // empty = index all
    }

    let db_path = db_state.db_path.clone();
    let models_dir = clip_state.models_dir.clone();
    let app = app_handle.clone();

    std::thread::spawn(move || {
        let result = (|| -> Result<u64, String> {
            // Open a separate DB connection for the indexing thread
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            conn.execute_batch("PRAGMA foreign_keys = OFF;")
                .map_err(|e| e.to_string())?;

            // Load model in this thread (ORT already initialized)
            let mut model = clip::ClipModel::load(&models_dir)?;
            log::info!("CLIP model loaded in indexing thread");

            let clip_state = app.state::<ClipState>();
            let cancel_flag = &clip_state.cancel_flag;

            let app_for_progress = app.clone();
            let count = clip::run_indexing(&mut model, &conn, cancel_flag, |indexed, total| {
                let cs = app_for_progress.state::<ClipState>();
                cs.progress_indexed.store(indexed, Ordering::Relaxed);
                cs.progress_total.store(total, Ordering::Relaxed);
                let _ = app_for_progress.emit(
                    "indexing-progress",
                    IndexingProgress {
                        indexed,
                        total,
                        is_running: true,
                    },
                );
            }, &[], &[])?;

            Ok(count)
        })();

        let clip_state = app.state::<ClipState>();
        clip_state.indexing.store(false, Ordering::Relaxed);

        match result {
            Ok(count) => {
                log::info!("Indexing complete: {} images processed", count);
                let _ = app.emit(
                    "indexing-progress",
                    IndexingProgress {
                        indexed: count,
                        total: count,
                        is_running: false,
                    },
                );
            }
            Err(e) => {
                log::error!("Indexing failed: {}", e);
                let _ = app.emit(
                    "indexing-progress",
                    IndexingProgress {
                        indexed: 0,
                        total: 0,
                        is_running: false,
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn cmd_cancel_indexing(clip_state: tauri::State<'_, ClipState>) -> Result<(), String> {
    clip_state.cancel_flag.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn cmd_get_unindexed_counts(db_state: tauri::State<'_, DbState>) -> Result<UnindexedCounts, String> {
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    queries::get_unindexed_counts(&conn)
}

#[tauri::command]
fn cmd_get_indexing_scope(clip_state: tauri::State<'_, ClipState>) -> Result<IndexingScope, String> {
    let scope = clip_state.indexing_scope.lock().map_err(|e| e.to_string())?;
    Ok(scope.clone())
}

#[tauri::command]
fn cmd_start_indexing_filtered(
    app_handle: tauri::AppHandle,
    db_state: tauri::State<'_, DbState>,
    clip_state: tauri::State<'_, ClipState>,
    sender_ids: Vec<i64>,
    conversation_ids: Vec<i64>,
) -> Result<(), String> {
    if clip_state.indexing.load(Ordering::Relaxed) {
        return Err("Indexing is already running".to_string());
    }

    clip::init_ort(&clip_state.models_dir)?;

    clip_state.indexing.store(true, Ordering::Relaxed);
    clip_state.cancel_flag.store(false, Ordering::Relaxed);
    clip_state.progress_indexed.store(0, Ordering::Relaxed);
    clip_state.progress_total.store(0, Ordering::Relaxed);
    {
        let mut scope = clip_state.indexing_scope.lock().map_err(|e| e.to_string())?;
        *scope = IndexingScope {
            sender_ids: sender_ids.clone(),
            conversation_ids: conversation_ids.clone(),
        };
    }

    let db_path = db_state.db_path.clone();
    let models_dir = clip_state.models_dir.clone();
    let app = app_handle.clone();

    std::thread::spawn(move || {
        let result = (|| -> Result<u64, String> {
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            conn.execute_batch("PRAGMA foreign_keys = OFF;")
                .map_err(|e| e.to_string())?;

            let mut model = clip::ClipModel::load(&models_dir)?;
            log::info!(
                "CLIP model loaded for filtered indexing ({} senders, {} conversations)",
                sender_ids.len(),
                conversation_ids.len()
            );

            let clip_state = app.state::<ClipState>();
            let cancel_flag = &clip_state.cancel_flag;

            let app_for_progress = app.clone();
            let count = clip::run_indexing(
                &mut model,
                &conn,
                cancel_flag,
                |indexed, total| {
                    let cs = app_for_progress.state::<ClipState>();
                    cs.progress_indexed.store(indexed, Ordering::Relaxed);
                    cs.progress_total.store(total, Ordering::Relaxed);
                    let _ = app_for_progress.emit(
                        "indexing-progress",
                        IndexingProgress {
                            indexed,
                            total,
                            is_running: true,
                        },
                    );
                },
                &sender_ids,
                &conversation_ids,
            )?;

            Ok(count)
        })();

        let clip_state = app.state::<ClipState>();
        clip_state.indexing.store(false, Ordering::Relaxed);

        match result {
            Ok(count) => {
                log::info!("Filtered indexing complete: {} images processed", count);
                let _ = app.emit(
                    "indexing-progress",
                    IndexingProgress {
                        indexed: count,
                        total: count,
                        is_running: false,
                    },
                );
            }
            Err(e) => {
                log::error!("Filtered indexing failed: {}", e);
                let _ = app.emit(
                    "indexing-progress",
                    IndexingProgress {
                        indexed: 0,
                        total: 0,
                        is_running: false,
                    },
                );
            }
        }
    });

    Ok(())
}

#[derive(serde::Serialize)]
struct AiSearchResult {
    media_id: i64,
    score: f32,
}

#[tauri::command]
fn cmd_ai_search(
    db_state: tauri::State<'_, DbState>,
    clip_state: tauri::State<'_, ClipState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<AiSearchResult>, String> {
    let limit = limit.unwrap_or(100);

    // Load model if not loaded yet
    {
        let mut model_guard = clip_state.model.lock().map_err(|e| e.to_string())?;
        if model_guard.is_none() {
            let m = clip::ClipModel::load(&clip_state.models_dir)?;
            *model_guard = Some(m);
        }
    }

    let mut model_guard = clip_state.model.lock().map_err(|e| e.to_string())?;
    let model = model_guard.as_mut().ok_or("CLIP model not loaded")?;

    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    let results = clip::search_by_text(model, &conn, &query, limit)?;

    Ok(results
        .into_iter()
        .map(|(media_id, score)| AiSearchResult { media_id, score })
        .collect())
}

#[tauri::command]
fn cmd_clear_embeddings(db_state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute_batch("DELETE FROM media_embeddings;")
        .map_err(|e| e.to_string())?;
    conn.execute_batch("VACUUM;").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn cmd_show_in_folder(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        let path_str = file_path.to_string_lossy().replace('/', "\\");
        std::process::Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", path_str))
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&file_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = file_path.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn cmd_export_album_pdf(
    state: tauri::State<'_, DbState>,
    album_id: i64,
    output_path: String,
) -> Result<ExportPdfResult, String> {
    // Query all images in album
    let image_paths: Vec<String> = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let filters = MediaFilters {
            conversation_id: None,
            sender_id: None,
            file_type: Some("image".to_string()),
            month: None,
            search: None,
            album_id: Some(album_id),
            sort: "date-asc".to_string(),
            limit: Some(1_000_000),
            offset: None,
        };
        let items = queries::get_media(&conn, &filters)?;
        items.into_iter().map(|m| m.file_path).collect()
    };
    // DB mutex released here

    let (exported_count, skipped_count) =
        pdf_export::generate_album_pdf(image_paths, &output_path)?;

    Ok(ExportPdfResult {
        exported_count,
        skipped_count,
    })
}

#[tauri::command]
fn cmd_export_album_folder(
    state: tauri::State<'_, DbState>,
    album_id: i64,
    output_path: String,
) -> Result<ExportPdfResult, String> {
    let media_paths: Vec<String> = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let filters = MediaFilters {
            conversation_id: None,
            sender_id: None,
            file_type: None,
            month: None,
            search: None,
            album_id: Some(album_id),
            sort: "date-asc".to_string(),
            limit: Some(1_000_000),
            offset: None,
        };
        let items = queries::get_media(&conn, &filters)?;
        items.into_iter().map(|m| m.file_path).collect()
    };

    let dest = std::path::Path::new(&output_path);
    if !dest.is_dir() {
        return Err("Destination folder does not exist".to_string());
    }

    let mut exported_count = 0usize;
    let mut skipped_count = 0usize;

    for src_path_str in &media_paths {
        let src_path = std::path::Path::new(src_path_str);
        if !src_path.exists() {
            skipped_count += 1;
            continue;
        }

        let file_stem = src_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let extension = src_path.extension().map(|e| e.to_string_lossy().to_string());

        let mut dest_file = dest.join(src_path.file_name().unwrap_or_default());
        let mut suffix = 1u32;
        while dest_file.exists() {
            let new_name = match &extension {
                Some(ext) => format!("{}_{}.{}", file_stem, suffix, ext),
                None => format!("{}_{}", file_stem, suffix),
            };
            dest_file = dest.join(new_name);
            suffix += 1;
        }

        match std::fs::copy(src_path, &dest_file) {
            Ok(_) => exported_count += 1,
            Err(_) => skipped_count += 1,
        }
    }

    Ok(ExportPdfResult {
        exported_count,
        skipped_count,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .register_uri_scheme_protocol("media", |_ctx, request| {
            let uri_path = request.uri().path();
            let raw_path = uri_path.strip_prefix('/').unwrap_or(uri_path);
            let raw_path = raw_path.split('?').next().unwrap_or(raw_path);
            let decoded = percent_decode(raw_path);
            let file_path = PathBuf::from(&decoded);

            if !file_path.exists() {
                return tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap();
            }

            let mime = guess_mime(&file_path);
            let file_size = match std::fs::metadata(&file_path) {
                Ok(m) => m.len(),
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(500)
                        .body(Vec::new())
                        .unwrap();
                }
            };

            // Check for Range header (enables video seeking without loading entire file)
            let range_header = request.headers().get("range").and_then(|v| v.to_str().ok());

            if let Some(range_str) = range_header {
                if let Some((start, end)) = parse_range(range_str, file_size) {
                    let length = end - start + 1;

                    use std::io::{Read, Seek, SeekFrom};
                    let mut file = match std::fs::File::open(&file_path) {
                        Ok(f) => f,
                        Err(_) => {
                            return tauri::http::Response::builder()
                                .status(500)
                                .body(Vec::new())
                                .unwrap();
                        }
                    };
                    let _ = file.seek(SeekFrom::Start(start));
                    let mut buf = vec![0u8; length as usize];
                    let _ = file.read_exact(&mut buf);

                    return tauri::http::Response::builder()
                        .status(206)
                        .header("Content-Type", mime)
                        .header("Content-Length", length.to_string())
                        .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size))
                        .header("Accept-Ranges", "bytes")
                        .body(buf)
                        .unwrap();
                }
            }

            // Full read for non-range requests (images, gifs — typically small)
            match std::fs::read(&file_path) {
                Ok(bytes) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", mime)
                    .header("Content-Length", file_size.to_string())
                    .header("Accept-Ranges", "bytes")
                    .body(bytes)
                    .unwrap(),
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
            // Performance pragmas
            conn.execute_batch("
                PRAGMA foreign_keys = OFF;
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous = NORMAL;
                PRAGMA cache_size = -16000;
                PRAGMA mmap_size = 268435456;
                PRAGMA temp_store = MEMORY;
            ").expect("Failed to set pragmas");
            db::schema::initialize(&conn)
                .expect("Failed to initialize database schema");

            app.manage(DbState {
                db_path,
                conn: Mutex::new(conn),
            });

            // Initialize CLIP state
            let models_dir = {
                let resource = app
                    .path()
                    .resource_dir()
                    .unwrap_or_else(|_| app_data.clone())
                    .join("models");
                // Check all required files exist at resource path
                let has_all = resource.join("clip-visual.onnx").exists()
                    && resource.join("clip-textual.onnx").exists()
                    && resource.join("tokenizer.json").exists()
                    && resource.join("onnxruntime.dll").exists();
                if has_all {
                    resource
                } else {
                    // Dev mode fallback: models live next to src/
                    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("models")
                }
            };
            // Set ORT_DYLIB_PATH early so ort can find the DLL
            let ort_dll = models_dir.join("onnxruntime.dll");
            if ort_dll.exists() {
                std::env::set_var("ORT_DYLIB_PATH", &ort_dll);
                eprintln!("[SETUP] ORT_DYLIB_PATH set to {}", ort_dll.display());
            }

            app.manage(ClipState {
                models_dir,
                model: Mutex::new(None),
                indexing: AtomicBool::new(false),
                cancel_flag: AtomicBool::new(false),
                progress_indexed: AtomicU64::new(0),
                progress_total: AtomicU64::new(0),
                indexing_scope: Mutex::new(IndexingScope::default()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_get_import_status,
            cmd_import_export,
            cmd_add_source,
            cmd_get_sources,
            cmd_remove_source,
            cmd_remove_sender,
            cmd_remove_conversation,
            cmd_detect_format,
            cmd_extract_zip,
            cmd_extract_zips,
            cmd_cleanup_zip_extract,
            cmd_get_conversations,
            cmd_get_senders,
            cmd_get_media,
            cmd_get_media_page,
            cmd_get_media_count,
            cmd_get_context,
            cmd_get_timeline,
            cmd_get_filter_facets,
            cmd_get_storage_info,
            cmd_clear_database,
            cmd_get_albums,
            cmd_create_album,
            cmd_rename_album,
            cmd_delete_album,
            cmd_update_album_color,
            cmd_add_media_to_album,
            cmd_remove_media_from_album,
            cmd_get_media_by_ids,
            cmd_get_media_albums,
            cmd_export_album_pdf,
            cmd_export_album_folder,
            cmd_show_in_folder,
            cmd_get_indexing_status,
            cmd_has_clip_models,
            cmd_start_indexing,
            cmd_start_indexing_filtered,
            cmd_cancel_indexing,
            cmd_get_unindexed_counts,
            cmd_get_indexing_scope,
            cmd_ai_search,
            cmd_clear_embeddings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
