use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ConversationInfo {
    pub id: i64,
    pub title: String,
    pub chat_type: String,
    pub media_count: i64,
}

#[derive(Debug, Serialize)]
pub struct SenderInfo {
    pub id: i64,
    pub name: String,
    pub media_count: i64,
}

#[derive(Debug, Serialize)]
pub struct MediaItem {
    pub id: i64,
    pub file_path: String,
    pub sender_name: String,
    pub timestamp_ms: i64,
    pub conversation_title: String,
    pub chat_type: String,
    pub file_type: String,
    pub conversation_id: i64,
    pub sender_id: i64,
}

#[derive(Debug, Serialize)]
pub struct ContextMessage {
    pub sender_name: String,
    pub content: String,
    pub timestamp_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct MediaContext {
    pub media: MediaItem,
    pub context_before: Vec<ContextMessage>,
    pub context_after: Vec<ContextMessage>,
}

#[derive(Debug, Serialize)]
pub struct TimelineEntry {
    pub label: String,
    pub month_key: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct ImportStatus {
    pub has_data: bool,
    pub media_count: i64,
    pub conversation_count: i64,
}

#[derive(Debug, Serialize)]
pub struct SourceInfo {
    pub source_type: String,
    pub source_path: String,
    pub conversations: i64,
    pub media_count: i64,
}

#[derive(Debug, serde::Deserialize)]
pub struct MediaFilters {
    pub conversation_id: Option<i64>,
    pub sender_id: Option<i64>,
    pub file_type: Option<String>,
    pub month: Option<String>,
    pub search: Option<String>,
    pub sort: String,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub fn get_import_status(conn: &Connection) -> Result<ImportStatus, String> {
    let media_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM media", [], |row| row.get(0))
        .unwrap_or(0);
    let conversation_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM conversations", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(ImportStatus {
        has_data: media_count > 0,
        media_count,
        conversation_count,
    })
}

pub fn get_conversations(conn: &Connection) -> Result<Vec<ConversationInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.title, c.chat_type, COUNT(m.id) as media_count
             FROM conversations c
             LEFT JOIN media m ON m.conversation_id = c.id
             GROUP BY c.id
             ORDER BY c.title",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ConversationInfo {
                id: row.get(0)?,
                title: row.get(1)?,
                chat_type: row.get(2)?,
                media_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_senders(conn: &Connection) -> Result<Vec<SenderInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, COUNT(m.id) as media_count
             FROM senders s
             INNER JOIN media m ON m.sender_id = s.id
             GROUP BY s.id
             ORDER BY s.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SenderInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                media_count: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_media(conn: &Connection, filters: &MediaFilters) -> Result<Vec<MediaItem>, String> {
    let mut sql = String::from(
        "SELECT m.id, m.file_path, s.name, m.timestamp_ms, c.title, c.chat_type, m.file_type, m.conversation_id, m.sender_id
         FROM media m
         INNER JOIN senders s ON s.id = m.sender_id
         INNER JOIN conversations c ON c.id = m.conversation_id
         WHERE 1=1",
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(cid) = filters.conversation_id {
        sql.push_str(" AND m.conversation_id = ?");
        params.push(Box::new(cid));
    }
    if let Some(sid) = filters.sender_id {
        sql.push_str(" AND m.sender_id = ?");
        params.push(Box::new(sid));
    }
    if let Some(ref ft) = filters.file_type {
        sql.push_str(" AND m.file_type = ?");
        params.push(Box::new(ft.clone()));
    }
    if let Some(ref month) = filters.month {
        // month is in "YYYY-MM" format
        sql.push_str(" AND strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) = ?");
        params.push(Box::new(month.clone()));
    }
    if let Some(ref search) = filters.search {
        if !search.is_empty() {
            // Whole-word match for message content and context:
            // Normalize punctuation to spaces, pad with spaces, then LIKE '% word %'
            let word_pat = format!("% {} %", search);
            let name_pat = format!("%{}%", search);
            const NORM: &str = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(";
            const NORM_END: &str = ", ',', ' '), '.', ' '), '!', ' '), '?', ' '), '\"', ' '), ''',' ')";
            let word_expr = |col: &str| -> String {
                format!("(' ' || {NORM}{col}{NORM_END} || ' ') LIKE ?")
            };
            let mc_expr = word_expr("m.message_content");
            let cc_expr = word_expr("cm.content");
            sql.push_str(&format!(
                " AND (s.name LIKE ? OR c.title LIKE ? OR {mc_expr}
                  OR m.id IN (SELECT cm.media_id FROM context_messages cm
                              INNER JOIN senders cs ON cs.id = cm.sender_id
                              WHERE cs.name LIKE ? OR {cc_expr}))",
            ));
            params.push(Box::new(name_pat.clone())); // s.name
            params.push(Box::new(name_pat.clone())); // c.title
            params.push(Box::new(word_pat.clone()));  // message_content
            params.push(Box::new(name_pat));          // cs.name
            params.push(Box::new(word_pat));           // cm.content
        }
    }

    // Sort
    match filters.sort.as_str() {
        "date-asc" => sql.push_str(" ORDER BY m.timestamp_ms ASC"),
        "sender" => sql.push_str(" ORDER BY s.name ASC, m.timestamp_ms DESC"),
        _ => sql.push_str(" ORDER BY m.timestamp_ms DESC"), // date-desc default
    }

    // Pagination
    let limit = filters.limit.unwrap_or(500);
    let offset = filters.offset.unwrap_or(0);
    sql.push_str(" LIMIT ? OFFSET ?");
    params.push(Box::new(limit));
    params.push(Box::new(offset));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(MediaItem {
                id: row.get(0)?,
                file_path: row.get(1)?,
                sender_name: row.get(2)?,
                timestamp_ms: row.get(3)?,
                conversation_title: row.get(4)?,
                chat_type: row.get(5)?,
                file_type: row.get(6)?,
                conversation_id: row.get(7)?,
                sender_id: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_context(conn: &Connection, media_id: i64) -> Result<MediaContext, String> {
    // Get the media item itself
    let media = conn
        .query_row(
            "SELECT m.id, m.file_path, s.name, m.timestamp_ms, c.title, c.chat_type, m.file_type, m.conversation_id, m.sender_id
             FROM media m
             INNER JOIN senders s ON s.id = m.sender_id
             INNER JOIN conversations c ON c.id = m.conversation_id
             WHERE m.id = ?1",
            rusqlite::params![media_id],
            |row| {
                Ok(MediaItem {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    sender_name: row.get(2)?,
                    timestamp_ms: row.get(3)?,
                    conversation_title: row.get(4)?,
                    chat_type: row.get(5)?,
                    file_type: row.get(6)?,
                    conversation_id: row.get(7)?,
                    sender_id: row.get(8)?,
                })
            },
        )
        .map_err(|e| format!("Media not found: {}", e))?;

    // Get context messages
    let mut stmt = conn
        .prepare(
            "SELECT s.name, cm.content, cm.timestamp_ms, cm.position
             FROM context_messages cm
             INNER JOIN senders s ON s.id = cm.sender_id
             WHERE cm.media_id = ?1
             ORDER BY cm.position ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![media_id], |row| {
            let position: i32 = row.get(3)?;
            Ok((
                ContextMessage {
                    sender_name: row.get(0)?,
                    content: row.get(1)?,
                    timestamp_ms: row.get(2)?,
                },
                position,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut context_before = Vec::new();
    let mut context_after = Vec::new();

    for row in rows {
        let (msg, position) = row.map_err(|e| e.to_string())?;
        if position < 0 {
            context_before.push(msg);
        } else {
            context_after.push(msg);
        }
    }

    Ok(MediaContext {
        media,
        context_before,
        context_after,
    })
}

pub fn get_timeline(conn: &Connection) -> Result<Vec<TimelineEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT
                strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) as month_key,
                COUNT(*) as count
             FROM media m
             GROUP BY month_key
             ORDER BY month_key DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let month_key: String = row.get(0)?;
            // Convert "2024-03" to "Mar 2024" for display
            let label = format_month_label(&month_key);
            Ok(TimelineEntry {
                label,
                month_key,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_sources(conn: &Connection) -> Result<Vec<SourceInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.source_type, c.source_path,
                    COUNT(DISTINCT c.id) as conversations,
                    COUNT(m.id) as media_count
             FROM conversations c
             LEFT JOIN media m ON m.conversation_id = c.id
             GROUP BY c.source_type, c.source_path
             ORDER BY c.source_path",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SourceInfo {
                source_type: row.get(0)?,
                source_path: row.get(1)?,
                conversations: row.get(2)?,
                media_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

fn format_month_label(month_key: &str) -> String {
    let parts: Vec<&str> = month_key.split('-').collect();
    if parts.len() != 2 {
        return month_key.to_string();
    }
    let month_name = match parts[1] {
        "01" => "Jan",
        "02" => "Feb",
        "03" => "Mar",
        "04" => "Apr",
        "05" => "May",
        "06" => "Jun",
        "07" => "Jul",
        "08" => "Aug",
        "09" => "Sep",
        "10" => "Oct",
        "11" => "Nov",
        "12" => "Dec",
        _ => parts[1],
    };
    format!("{} {}", month_name, parts[0])
}
