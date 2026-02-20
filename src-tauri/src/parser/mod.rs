pub mod facebook;
pub mod messenger;
pub mod mojibake;

use std::path::{Path, PathBuf};
use facebook::{FacebookExport, Message};
use mojibake::fix_mojibake;

/// A parsed media item ready for database insertion.
#[derive(Debug, Clone)]
pub struct ParsedMedia {
    pub file_path: String,
    pub relative_uri: String,
    pub file_type: String, // "image", "video", "gif"
    pub timestamp_ms: i64,
    pub creation_timestamp: Option<i64>,
    pub sender_name: String,
    pub message_content: Option<String>,
    pub context_before: Vec<ContextMsg>,
    pub context_after: Vec<ContextMsg>,
}

/// A context message surrounding a media item.
#[derive(Debug, Clone)]
pub struct ContextMsg {
    pub sender_name: String,
    pub content: String,
    pub timestamp_ms: i64,
}

/// A parsed conversation with all its media items.
#[derive(Debug)]
pub struct ParsedConversation {
    pub folder_name: String,
    pub title: String,
    pub thread_path: String,
    pub chat_type: String, // "group" or "dm"
    pub participants: Vec<String>,
    pub media: Vec<ParsedMedia>,
    pub source_type: String,
    pub source_path: String,
}

/// Result of parsing the entire export.
#[derive(Debug)]
pub struct ParseResult {
    pub conversations: Vec<ParsedConversation>,
}

/// Detected data format.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DataFormat {
    Facebook,
    Messenger,
}

/// Detect whether a folder contains a Facebook or Messenger export.
pub fn detect_format(path: &Path) -> Result<DataFormat, String> {
    // Facebook: has your_facebook_activity/messages/inbox/
    if path
        .join("your_facebook_activity")
        .join("messages")
        .join("inbox")
        .exists()
    {
        return Ok(DataFormat::Facebook);
    }

    // Messenger: has *.json files at root + media/ directory
    if path.join("media").is_dir() {
        let has_json = std::fs::read_dir(path)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .any(|e| e.path().extension().map_or(false, |ext| ext == "json"))
            })
            .unwrap_or(false);
        if has_json {
            return Ok(DataFormat::Messenger);
        }
    }

    Err("Unrecognized export format. Expected Facebook or Messenger data.".into())
}

/// Parse an export, auto-detecting the format.
pub fn parse_export(export_root: &Path, context_window: usize) -> Result<ParseResult, String> {
    let format = detect_format(export_root)?;
    match format {
        DataFormat::Facebook => parse_facebook_export(export_root, context_window),
        DataFormat::Messenger => parse_messenger_export(export_root, context_window),
    }
}

/// Parse a Facebook data export.
fn parse_facebook_export(export_root: &Path, context_window: usize) -> Result<ParseResult, String> {
    let inbox_path = export_root
        .join("your_facebook_activity")
        .join("messages")
        .join("inbox");

    if !inbox_path.exists() {
        return Err(format!(
            "Inbox directory not found at: {}",
            inbox_path.display()
        ));
    }

    let source_path = export_root.to_string_lossy().to_string();
    let mut conversations = Vec::new();

    let entries = std::fs::read_dir(&inbox_path)
        .map_err(|e| format!("Failed to read inbox directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        match parse_facebook_conversation(export_root, &path, context_window, &source_path) {
            Ok(conv) => {
                if !conv.media.is_empty() {
                    conversations.push(conv);
                }
            }
            Err(e) => {
                log::warn!(
                    "Skipping conversation {}: {}",
                    path.display(),
                    e
                );
            }
        }
    }

    Ok(ParseResult { conversations })
}

/// Parse a single Facebook conversation folder.
fn parse_facebook_conversation(
    export_root: &Path,
    conv_dir: &Path,
    context_window: usize,
    source_path: &str,
) -> Result<ParsedConversation, String> {
    let folder_name = conv_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Find all message_*.json files and sort them
    let mut json_files: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(conv_dir)
        .map_err(|e| format!("Failed to read {}: {}", conv_dir.display(), e))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with("message_") && name_str.ends_with(".json") {
            json_files.push(entry.path());
        }
    }
    json_files.sort();

    if json_files.is_empty() {
        return Err("No message JSON files found".to_string());
    }

    // Parse all JSON files and merge messages
    let mut all_messages: Vec<Message> = Vec::new();
    let mut title = String::new();
    let mut thread_path = String::new();
    let mut participants: Vec<String> = Vec::new();

    for json_file in &json_files {
        let content = std::fs::read_to_string(json_file)
            .map_err(|e| format!("Failed to read {}: {}", json_file.display(), e))?;

        let export: FacebookExport = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {}", json_file.display(), e))?;

        // Use metadata from the first file
        if title.is_empty() {
            title = fix_mojibake(&export.title);
            thread_path = export.thread_path.clone();
            participants = export
                .participants
                .iter()
                .map(|p| fix_mojibake(&p.name))
                .collect();
        }

        all_messages.extend(export.messages);
    }

    // Messages come newest-first; reverse to chronological order
    all_messages.reverse();

    // Fix mojibake on all message fields
    for msg in &mut all_messages {
        msg.sender_name = fix_mojibake(&msg.sender_name);
        if let Some(ref content) = msg.content {
            msg.content = Some(fix_mojibake(content));
        }
    }

    // Determine chat type
    let chat_type = if participants.len() <= 2 {
        "dm".to_string()
    } else {
        "group".to_string()
    };

    // Extract media items with context
    let media = extract_media(export_root, &all_messages, context_window);

    Ok(ParsedConversation {
        folder_name,
        title,
        thread_path,
        chat_type,
        participants,
        media,
        source_type: "facebook".to_string(),
        source_path: source_path.to_string(),
    })
}

/// Parse a Messenger data export (flat JSON files + media/ folder).
fn parse_messenger_export(export_root: &Path, context_window: usize) -> Result<ParseResult, String> {
    let source_path = export_root.to_string_lossy().to_string();
    let mut conversations = Vec::new();

    // Read all *.json files in the root directory
    let entries = std::fs::read_dir(export_root)
        .map_err(|e| format!("Failed to read export directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().map_or(true, |ext| ext != "json") {
            continue;
        }

        match parse_messenger_conversation(export_root, &path, context_window, &source_path) {
            Ok(conv) => {
                if !conv.media.is_empty() {
                    conversations.push(conv);
                }
            }
            Err(e) => {
                log::warn!(
                    "Skipping Messenger conversation {}: {}",
                    path.display(),
                    e
                );
            }
        }
    }

    Ok(ParseResult { conversations })
}

/// Parse a single Messenger JSON file into a conversation.
fn parse_messenger_conversation(
    export_root: &Path,
    json_path: &Path,
    context_window: usize,
    source_path: &str,
) -> Result<ParsedConversation, String> {
    let content = std::fs::read_to_string(json_path)
        .map_err(|e| format!("Failed to read {}: {}", json_path.display(), e))?;

    let export: messenger::MessengerExport = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse {}: {}", json_path.display(), e))?;

    let folder_name = json_path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Participants are already plain strings
    let participants = export.participants.clone();

    // Determine chat type
    let chat_type = if participants.len() <= 2 {
        "dm".to_string()
    } else {
        "group".to_string()
    };

    // Build a human-readable title from thread name
    // Thread names look like "Name_id" — strip the trailing _<digits>
    let title = export
        .thread_name
        .rsplit_once('_')
        .map(|(name, _)| name.to_string())
        .unwrap_or_else(|| export.thread_name.clone());

    // Convert Messenger messages to Facebook Message format for reuse
    let mut all_messages: Vec<Message> = export
        .messages
        .iter()
        .map(messenger::to_facebook_message)
        .collect();

    // Messenger messages are already chronological (oldest first based on sample data)
    // But let's sort by timestamp to be safe
    all_messages.sort_by_key(|m| m.timestamp_ms);

    // Extract media items with context, resolving ./media/ URIs against export root
    let media = extract_media(export_root, &all_messages, context_window);

    Ok(ParsedConversation {
        folder_name,
        title,
        thread_path: export.thread_name,
        chat_type,
        participants,
        media,
        source_type: "messenger".to_string(),
        source_path: source_path.to_string(),
    })
}

/// Extract all media items from messages with surrounding context.
fn extract_media(
    export_root: &Path,
    messages: &[Message],
    context_window: usize,
) -> Vec<ParsedMedia> {
    let mut media_items = Vec::new();

    for (i, msg) in messages.iter().enumerate() {
        if !msg.has_media() {
            continue;
        }

        // Build context before and after
        let context_before = build_context(messages, i, context_window, true);
        let context_after = build_context(messages, i, context_window, false);

        // Process photos
        if let Some(ref photos) = msg.photos {
            for photo in photos {
                let abs_path = resolve_uri(export_root, &photo.uri);
                if !abs_path.exists() {
                    log::warn!("Photo file not found: {}", abs_path.display());
                    continue;
                }
                media_items.push(ParsedMedia {
                    file_path: abs_path.to_string_lossy().to_string(),
                    relative_uri: photo.uri.clone(),
                    file_type: "image".to_string(),
                    timestamp_ms: msg.timestamp_ms,
                    creation_timestamp: photo.creation_timestamp,
                    sender_name: msg.sender_name.clone(),
                    message_content: msg.content.clone(),
                    context_before: context_before.clone(),
                    context_after: context_after.clone(),
                });
            }
        }

        // Process videos
        if let Some(ref videos) = msg.videos {
            for video in videos {
                let abs_path = resolve_uri(export_root, &video.uri);
                if !abs_path.exists() {
                    log::warn!("Video file not found: {}", abs_path.display());
                    continue;
                }
                media_items.push(ParsedMedia {
                    file_path: abs_path.to_string_lossy().to_string(),
                    relative_uri: video.uri.clone(),
                    file_type: "video".to_string(),
                    timestamp_ms: msg.timestamp_ms,
                    creation_timestamp: video.creation_timestamp,
                    sender_name: msg.sender_name.clone(),
                    message_content: msg.content.clone(),
                    context_before: context_before.clone(),
                    context_after: context_after.clone(),
                });
            }
        }

        // Process gifs
        if let Some(ref gifs) = msg.gifs {
            for gif in gifs {
                let abs_path = resolve_uri(export_root, &gif.uri);
                if !abs_path.exists() {
                    log::warn!("GIF file not found: {}", abs_path.display());
                    continue;
                }
                media_items.push(ParsedMedia {
                    file_path: abs_path.to_string_lossy().to_string(),
                    relative_uri: gif.uri.clone(),
                    file_type: "gif".to_string(),
                    timestamp_ms: msg.timestamp_ms,
                    creation_timestamp: None,
                    sender_name: msg.sender_name.clone(),
                    message_content: msg.content.clone(),
                    context_before: context_before.clone(),
                    context_after: context_after.clone(),
                });
            }
        }
    }

    media_items
}

/// Build context messages before or after a given message index.
fn build_context(
    messages: &[Message],
    index: usize,
    window: usize,
    before: bool,
) -> Vec<ContextMsg> {
    let mut context = Vec::new();

    if before {
        let start = index.saturating_sub(window);
        for j in start..index {
            let text = get_display_text(&messages[j]);
            context.push(ContextMsg {
                sender_name: messages[j].sender_name.clone(),
                content: text,
                timestamp_ms: messages[j].timestamp_ms,
            });
        }
    } else {
        let end = (index + 1 + window).min(messages.len());
        for j in (index + 1)..end {
            let text = get_display_text(&messages[j]);
            context.push(ContextMsg {
                sender_name: messages[j].sender_name.clone(),
                content: text,
                timestamp_ms: messages[j].timestamp_ms,
            });
        }
    }

    context
}

/// Get display text for a message, using placeholders for media-only messages.
fn get_display_text(msg: &Message) -> String {
    if let Some(ref content) = msg.content {
        if !content.is_empty() {
            return content.clone();
        }
    }
    if msg.photos.as_ref().map_or(false, |p| !p.is_empty()) {
        return "[Photo]".to_string();
    }
    if msg.videos.as_ref().map_or(false, |v| !v.is_empty()) {
        return "[Video]".to_string();
    }
    if msg.gifs.as_ref().map_or(false, |g| !g.is_empty()) {
        return "[GIF]".to_string();
    }
    "[Message]".to_string()
}

/// Resolve a relative URI from the JSON to an absolute filesystem path.
fn resolve_uri(export_root: &Path, uri: &str) -> PathBuf {
    // Handle ./media/ prefix from Messenger exports
    let cleaned = uri.strip_prefix("./").unwrap_or(uri);
    export_root.join(cleaned)
}
