use rusqlite::Connection;
use crate::parser::{ParseResult, ParsedConversation, ParsedMedia, ContextMsg};

/// Insert all parsed data into the database.
/// Caller is responsible for transaction management.
pub fn insert_all(conn: &Connection, result: &ParseResult) -> Result<ImportStats, String> {
    let mut stats = ImportStats::default();

    for conv in &result.conversations {
        let conv_id = insert_conversation(conn, conv)?;
        stats.conversations += 1;

        // Insert participants
        for participant_name in &conv.participants {
            let sender_id = get_or_create_sender(conn, participant_name)?;
            conn.execute(
                "INSERT OR IGNORE INTO conversation_participants (conversation_id, sender_id) VALUES (?1, ?2)",
                rusqlite::params![conv_id, sender_id],
            ).map_err(|e| e.to_string())?;
        }

        // Insert media
        for media in &conv.media {
            let sender_id = get_or_create_sender(conn, &media.sender_name)?;
            let media_id = insert_media(conn, conv_id, sender_id, media)?;
            stats.media += 1;

            // Insert context messages
            for (i, ctx) in media.context_before.iter().enumerate() {
                let position = -(media.context_before.len() as i32) + i as i32;
                insert_context_message(conn, media_id, ctx, position)?;
            }
            for (i, ctx) in media.context_after.iter().enumerate() {
                let position = (i + 1) as i32;
                insert_context_message(conn, media_id, ctx, position)?;
            }
        }
    }

    // Count unique senders
    stats.senders = conn
        .query_row("SELECT COUNT(*) FROM senders", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(stats)
}

fn insert_conversation(
    conn: &Connection,
    conv: &ParsedConversation,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO conversations (folder_name, title, chat_type, participant_count, thread_path, source_type, source_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            conv.folder_name,
            conv.title,
            conv.chat_type,
            conv.participants.len() as i64,
            conv.thread_path,
            conv.source_type,
            conv.source_path,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn get_or_create_sender(conn: &Connection, name: &str) -> Result<i64, String> {
    // Try to find existing sender
    let result: Result<i64, _> = conn.query_row(
        "SELECT id FROM senders WHERE name = ?1",
        rusqlite::params![name],
        |row| row.get(0),
    );

    match result {
        Ok(id) => Ok(id),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            conn.execute(
                "INSERT INTO senders (name) VALUES (?1)",
                rusqlite::params![name],
            ).map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
        Err(e) => Err(e.to_string()),
    }
}

fn insert_media(
    conn: &Connection,
    conversation_id: i64,
    sender_id: i64,
    media: &ParsedMedia,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO media (conversation_id, sender_id, file_path, relative_uri, file_type, timestamp_ms, creation_timestamp, message_content)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            conversation_id,
            sender_id,
            media.file_path,
            media.relative_uri,
            media.file_type,
            media.timestamp_ms,
            media.creation_timestamp,
            media.message_content,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn insert_context_message(
    conn: &Connection,
    media_id: i64,
    ctx: &ContextMsg,
    position: i32,
) -> Result<(), String> {
    let sender_id = get_or_create_sender(conn, &ctx.sender_name)?;
    conn.execute(
        "INSERT INTO context_messages (media_id, sender_id, content, timestamp_ms, position)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            media_id,
            sender_id,
            ctx.content,
            ctx.timestamp_ms,
            position,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Default, serde::Serialize)]
pub struct ImportStats {
    pub conversations: usize,
    pub media: usize,
    pub senders: usize,
}
