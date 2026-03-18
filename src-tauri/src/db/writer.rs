use std::collections::HashMap;
use rusqlite::Connection;
use crate::parser::{ParseResult, ParsedConversation, ParsedMedia, ContextMsg};

/// Insert all parsed data into the database.
/// Caller is responsible for transaction management.
/// Uses prepare_cached for fast bulk inserts.
pub fn insert_all(conn: &Connection, result: &ParseResult) -> Result<ImportStats, String> {
    let mut stats = ImportStats::default();
    let mut sender_cache: HashMap<String, i64> = HashMap::new();

    for conv in &result.conversations {
        let conv_id = insert_conversation(conn, conv)?;
        stats.conversations += 1;

        // Insert participants
        for participant_name in &conv.participants {
            let sender_id = get_or_create_sender_cached(conn, participant_name, &mut sender_cache)?;
            conn.prepare_cached(
                "INSERT OR IGNORE INTO conversation_participants (conversation_id, sender_id) VALUES (?1, ?2)",
            ).map_err(|e| e.to_string())?
            .execute(rusqlite::params![conv_id, sender_id])
            .map_err(|e| e.to_string())?;
        }

        // Insert media
        for media in &conv.media {
            let sender_id = get_or_create_sender_cached(conn, &media.sender_name, &mut sender_cache)?;
            let media_id = insert_media(conn, conv_id, sender_id, media)?;
            stats.media += 1;

            // Insert context messages
            for (i, ctx) in media.context_before.iter().enumerate() {
                let position = -(media.context_before.len() as i32) + i as i32;
                insert_context_message_cached(conn, media_id, ctx, position, &mut sender_cache)?;
            }
            for (i, ctx) in media.context_after.iter().enumerate() {
                let position = (i + 1) as i32;
                insert_context_message_cached(conn, media_id, ctx, position, &mut sender_cache)?;
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
    conn.prepare_cached(
        "INSERT INTO conversations (folder_name, title, chat_type, participant_count, thread_path, source_type, source_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    ).map_err(|e| e.to_string())?
    .execute(rusqlite::params![
        conv.folder_name,
        conv.title,
        conv.chat_type,
        conv.participants.len() as i64,
        conv.thread_path,
        conv.source_type,
        conv.source_path,
    ]).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn get_or_create_sender_cached(conn: &Connection, name: &str, cache: &mut HashMap<String, i64>) -> Result<i64, String> {
    if let Some(&id) = cache.get(name) {
        return Ok(id);
    }

    let id = match conn
        .prepare_cached("SELECT id FROM senders WHERE name = ?1")
        .map_err(|e| e.to_string())?
        .query_row(rusqlite::params![name], |row| row.get(0))
    {
        Ok(id) => id,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            conn.prepare_cached("INSERT INTO senders (name) VALUES (?1)")
                .map_err(|e| e.to_string())?
                .execute(rusqlite::params![name])
                .map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        }
        Err(e) => return Err(e.to_string()),
    };

    cache.insert(name.to_string(), id);
    Ok(id)
}


fn insert_media(
    conn: &Connection,
    conversation_id: i64,
    sender_id: i64,
    media: &ParsedMedia,
) -> Result<i64, String> {
    conn.prepare_cached(
        "INSERT INTO media (conversation_id, sender_id, file_path, relative_uri, file_type, timestamp_ms, creation_timestamp, message_content, year_month)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, strftime('%Y-%m', datetime(?6 / 1000, 'unixepoch')))",
    ).map_err(|e| e.to_string())?
    .execute(rusqlite::params![
        conversation_id,
        sender_id,
        media.file_path,
        media.relative_uri,
        media.file_type,
        media.timestamp_ms,
        media.creation_timestamp,
        media.message_content,
    ]).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn insert_context_message_cached(
    conn: &Connection,
    media_id: i64,
    ctx: &ContextMsg,
    position: i32,
    cache: &mut HashMap<String, i64>,
) -> Result<(), String> {
    let sender_id = get_or_create_sender_cached(conn, &ctx.sender_name, cache)?;
    conn.prepare_cached(
        "INSERT INTO context_messages (media_id, sender_id, content, timestamp_ms, position)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    ).map_err(|e| e.to_string())?
    .execute(rusqlite::params![
        media_id,
        sender_id,
        ctx.content,
        ctx.timestamp_ms,
        position,
    ]).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Default, serde::Serialize)]
pub struct ImportStats {
    pub conversations: usize,
    pub media: usize,
    pub senders: usize,
}

pub fn create_album(conn: &Connection, name: &str, color: &str) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO albums (name, color) VALUES (?1, ?2)",
        rusqlite::params![name, color],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn rename_album(conn: &Connection, album_id: i64, name: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE albums SET name = ?1 WHERE id = ?2",
        rusqlite::params![name, album_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_album_color(conn: &Connection, album_id: i64, color: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE albums SET color = ?1 WHERE id = ?2",
        rusqlite::params![color, album_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_album(conn: &Connection, album_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM album_media WHERE album_id = ?1",
        rusqlite::params![album_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM albums WHERE id = ?1",
        rusqlite::params![album_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn add_media_to_album(conn: &Connection, album_id: i64, media_id: i64) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO album_media (album_id, media_id) VALUES (?1, ?2)",
        rusqlite::params![album_id, media_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_media_from_album(conn: &Connection, album_id: i64, media_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM album_media WHERE album_id = ?1 AND media_id = ?2",
        rusqlite::params![album_id, media_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
