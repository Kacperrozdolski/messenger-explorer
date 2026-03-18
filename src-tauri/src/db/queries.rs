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

#[derive(Debug, Serialize)]
pub struct AlbumInfo {
    pub id: i64,
    pub name: String,
    pub media_count: i64,
    pub color: String,
    pub created_at: i64,
}

#[derive(Debug, serde::Deserialize)]
pub struct MediaFilters {
    pub conversation_id: Option<i64>,
    pub sender_id: Option<i64>,
    pub file_type: Option<String>,
    pub month: Option<String>,
    pub search: Option<String>,
    pub album_id: Option<i64>,
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
        if month.len() == 4 {
            // Year-only filter: "YYYY"
            sql.push_str(" AND strftime('%Y', datetime(m.timestamp_ms / 1000, 'unixepoch')) = ?");
        } else {
            // Month filter: "YYYY-MM"
            sql.push_str(" AND strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) = ?");
        }
        params.push(Box::new(month.clone()));
    }
    if let Some(aid) = filters.album_id {
        sql.push_str(" AND m.id IN (SELECT media_id FROM album_media WHERE album_id = ?)");
        params.push(Box::new(aid));
    }
    if let Some(ref search) = filters.search {
        let trimmed = search.trim();
        if trimmed.len() >= 2 {
            let pattern = format!("%{}%", trimmed.to_lowercase());
            sql.push_str(
                " AND (LOWER(COALESCE(m.message_content, '')) LIKE ?
                   OR m.id IN (SELECT cm.media_id FROM context_messages cm
                               WHERE LOWER(cm.content) LIKE ?))",
            );
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern));
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

#[derive(Debug, Serialize)]
pub struct UnindexedCounts {
    pub senders: Vec<UnindexedItemCount>,
    pub conversations: Vec<UnindexedItemCount>,
}

#[derive(Debug, Serialize)]
pub struct UnindexedItemCount {
    pub id: i64,
    pub total_images: i64,
    pub unindexed: i64,
}

pub fn get_unindexed_counts(conn: &Connection) -> Result<UnindexedCounts, String> {
    let mut sender_stmt = conn
        .prepare(
            "SELECT m.sender_id,
                    COUNT(*) as total_images,
                    SUM(CASE WHEN me.media_id IS NULL THEN 1 ELSE 0 END) as unindexed
             FROM media m
             LEFT JOIN media_embeddings me ON me.media_id = m.id
             WHERE m.file_type = 'image'
             GROUP BY m.sender_id",
        )
        .map_err(|e| e.to_string())?;

    let senders: Vec<UnindexedItemCount> = sender_stmt
        .query_map([], |row| {
            Ok(UnindexedItemCount {
                id: row.get(0)?,
                total_images: row.get(1)?,
                unindexed: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut conv_stmt = conn
        .prepare(
            "SELECT m.conversation_id,
                    COUNT(*) as total_images,
                    SUM(CASE WHEN me.media_id IS NULL THEN 1 ELSE 0 END) as unindexed
             FROM media m
             LEFT JOIN media_embeddings me ON me.media_id = m.id
             WHERE m.file_type = 'image'
             GROUP BY m.conversation_id",
        )
        .map_err(|e| e.to_string())?;

    let conversations: Vec<UnindexedItemCount> = conv_stmt
        .query_map([], |row| {
            Ok(UnindexedItemCount {
                id: row.get(0)?,
                total_images: row.get(1)?,
                unindexed: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(UnindexedCounts { senders, conversations })
}

pub fn get_albums(conn: &Connection) -> Result<Vec<AlbumInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, COUNT(am.media_id) as media_count,
                    a.color, a.created_at
             FROM albums a
             LEFT JOIN album_media am ON am.album_id = a.id
             GROUP BY a.id
             ORDER BY a.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AlbumInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                media_count: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_media_count(conn: &Connection, filters: &MediaFilters) -> Result<i64, String> {
    let mut sql = String::from(
        "SELECT COUNT(*)
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
        if month.len() == 4 {
            sql.push_str(" AND strftime('%Y', datetime(m.timestamp_ms / 1000, 'unixepoch')) = ?");
        } else {
            sql.push_str(" AND strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) = ?");
        }
        params.push(Box::new(month.clone()));
    }
    if let Some(aid) = filters.album_id {
        sql.push_str(" AND m.id IN (SELECT media_id FROM album_media WHERE album_id = ?)");
        params.push(Box::new(aid));
    }
    if let Some(ref search) = filters.search {
        let trimmed = search.trim();
        if trimmed.len() >= 2 {
            let pattern = format!("%{}%", trimmed.to_lowercase());
            sql.push_str(
                " AND (LOWER(COALESCE(m.message_content, '')) LIKE ?
                   OR m.id IN (SELECT cm.media_id FROM context_messages cm
                               WHERE LOWER(cm.content) LIKE ?))",
            );
            params.push(Box::new(pattern.clone()));
            params.push(Box::new(pattern));
        }
    }

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.query_row(&sql, param_refs.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())
}

pub fn get_media_by_ids(conn: &Connection, ids: &[i64]) -> Result<Vec<MediaItem>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT m.id, m.file_path, s.name, m.timestamp_ms, c.title, c.chat_type, m.file_type, m.conversation_id, m.sender_id
         FROM media m
         INNER JOIN senders s ON s.id = m.sender_id
         INNER JOIN conversations c ON c.id = m.conversation_id
         WHERE m.id IN ({})",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params: Vec<Box<dyn rusqlite::types::ToSql>> = ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
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

pub fn get_media_albums(conn: &Connection, media_id: i64) -> Result<Vec<i64>, String> {
    let mut stmt = conn
        .prepare("SELECT album_id FROM album_media WHERE media_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![media_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// --- Faceted filter support ---

#[derive(Debug, Serialize)]
pub struct FileTypeCounts {
    pub image: i64,
    pub video: i64,
    pub gif: i64,
}

#[derive(Debug, Serialize)]
pub struct FilterFacets {
    pub conversations: Vec<ConversationInfo>,
    pub senders: Vec<SenderInfo>,
    pub timeline: Vec<TimelineEntry>,
    pub file_type_counts: FileTypeCounts,
}

struct WhereClause {
    sql: String,
    params: Vec<Box<dyn rusqlite::types::ToSql>>,
}

fn build_media_where(filters: &MediaFilters, exclude: &str) -> WhereClause {
    let mut sql = String::from("WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if exclude != "conversation_id" {
        if let Some(cid) = filters.conversation_id {
            sql.push_str(" AND m.conversation_id = ?");
            params.push(Box::new(cid));
        }
    }
    if exclude != "sender_id" {
        if let Some(sid) = filters.sender_id {
            sql.push_str(" AND m.sender_id = ?");
            params.push(Box::new(sid));
        }
    }
    if exclude != "file_type" {
        if let Some(ref ft) = filters.file_type {
            sql.push_str(" AND m.file_type = ?");
            params.push(Box::new(ft.clone()));
        }
    }
    if exclude != "month" {
        if let Some(ref month) = filters.month {
            if month.len() == 4 {
                sql.push_str(" AND strftime('%Y', datetime(m.timestamp_ms / 1000, 'unixepoch')) = ?");
            } else {
                sql.push_str(" AND strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) = ?");
            }
            params.push(Box::new(month.clone()));
        }
    }
    if exclude != "album_id" {
        if let Some(aid) = filters.album_id {
            sql.push_str(" AND m.id IN (SELECT media_id FROM album_media WHERE album_id = ?)");
            params.push(Box::new(aid));
        }
    }
    if exclude != "search" {
        if let Some(ref search) = filters.search {
            let trimmed = search.trim();
            if trimmed.len() >= 2 {
                let pattern = format!("%{}%", trimmed.to_lowercase());
                sql.push_str(
                    " AND (LOWER(COALESCE(m.message_content, '')) LIKE ?
                       OR m.id IN (SELECT cm.media_id FROM context_messages cm
                                   WHERE LOWER(cm.content) LIKE ?))",
                );
                params.push(Box::new(pattern.clone()));
                params.push(Box::new(pattern));
            }
        }
    }

    WhereClause { sql, params }
}

pub fn get_filter_facets(conn: &Connection, filters: &MediaFilters) -> Result<FilterFacets, String> {
    // Conversations facet: apply all filters except conversation_id
    let conversations = {
        let wc = build_media_where(filters, "conversation_id");
        let sql = format!(
            "SELECT c.id, c.title, c.chat_type, COUNT(m.id) as media_count
             FROM media m
             INNER JOIN conversations c ON c.id = m.conversation_id
             INNER JOIN senders s ON s.id = m.sender_id
             {} GROUP BY c.id ORDER BY c.title",
            wc.sql
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = wc.params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(ConversationInfo {
                id: row.get(0)?,
                title: row.get(1)?,
                chat_type: row.get(2)?,
                media_count: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows { result.push(row.map_err(|e| e.to_string())?); }
        result
    };

    // Senders facet: apply all filters except sender_id
    let senders = {
        let wc = build_media_where(filters, "sender_id");
        let sql = format!(
            "SELECT s.id, s.name, COUNT(m.id) as media_count
             FROM media m
             INNER JOIN senders s ON s.id = m.sender_id
             INNER JOIN conversations c ON c.id = m.conversation_id
             {} GROUP BY s.id ORDER BY s.name",
            wc.sql
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = wc.params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(SenderInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                media_count: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows { result.push(row.map_err(|e| e.to_string())?); }
        result
    };

    // Timeline facet: apply all filters except month
    let timeline = {
        let wc = build_media_where(filters, "month");
        let sql = format!(
            "SELECT strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) as month_key,
                    COUNT(*) as count
             FROM media m
             INNER JOIN senders s ON s.id = m.sender_id
             INNER JOIN conversations c ON c.id = m.conversation_id
             {} GROUP BY month_key ORDER BY month_key DESC",
            wc.sql
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = wc.params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            let month_key: String = row.get(0)?;
            let label = format_month_label(&month_key);
            Ok(TimelineEntry {
                label,
                month_key,
                count: row.get(1)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows { result.push(row.map_err(|e| e.to_string())?); }
        result
    };

    // File type facet: apply all filters except file_type
    let file_type_counts = {
        let wc = build_media_where(filters, "file_type");
        let sql = format!(
            "SELECT m.file_type, COUNT(*) as count
             FROM media m
             INNER JOIN senders s ON s.id = m.sender_id
             INNER JOIN conversations c ON c.id = m.conversation_id
             {} GROUP BY m.file_type",
            wc.sql
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = wc.params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut counts = FileTypeCounts { image: 0, video: 0, gif: 0 };
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?;
        for row in rows {
            let (ft, count) = row.map_err(|e| e.to_string())?;
            match ft.as_str() {
                "image" => counts.image = count,
                "video" => counts.video = count,
                "gif" => counts.gif = count,
                _ => {}
            }
        }
        counts
    };

    Ok(FilterFacets {
        conversations,
        senders,
        timeline,
        file_type_counts,
    })
}

#[derive(Debug, Serialize)]
pub struct MediaPage {
    pub items: Vec<MediaItem>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct MonthPageFilters {
    pub conversation_id: Option<i64>,
    pub sender_id: Option<i64>,
    pub file_type: Option<String>,
    pub search: Option<String>,
    pub album_id: Option<i64>,
    pub sort: String,
    pub cursor_month: Option<String>,
    pub months_per_page: i64,
}

pub fn get_media_month_page(
    conn: &Connection,
    filters: &MonthPageFilters,
) -> Result<MediaPage, String> {
    let is_desc = filters.sort.as_str() != "date-asc";

    // Build common WHERE clause (reused for both queries)
    let build_where = || -> (String, Vec<Box<dyn rusqlite::types::ToSql>>) {
        let mut sql = String::from("WHERE 1=1");
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
        if let Some(aid) = filters.album_id {
            sql.push_str(" AND m.id IN (SELECT media_id FROM album_media WHERE album_id = ?)");
            params.push(Box::new(aid));
        }
        if let Some(ref search) = filters.search {
            let trimmed = search.trim();
            if trimmed.len() >= 2 {
                let pattern = format!("%{}%", trimmed.to_lowercase());
                sql.push_str(
                    " AND (LOWER(COALESCE(m.message_content, '')) LIKE ?
                       OR m.id IN (SELECT cm.media_id FROM context_messages cm
                                   WHERE LOWER(cm.content) LIKE ?))",
                );
                params.push(Box::new(pattern.clone()));
                params.push(Box::new(pattern));
            }
        }
        (sql, params)
    };

    // Step 1: Get target months
    let (where_sql, mut months_params) = build_where();
    let mut months_sql = format!(
        "SELECT DISTINCT strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) as mk
         FROM media m
         INNER JOIN senders s ON s.id = m.sender_id
         INNER JOIN conversations c ON c.id = m.conversation_id
         {}",
        where_sql
    );

    if let Some(ref cursor) = filters.cursor_month {
        if is_desc {
            months_sql.push_str(" AND strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) < ?");
        } else {
            months_sql.push_str(" AND strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) > ?");
        }
        months_params.push(Box::new(cursor.clone()));
    }

    months_sql.push_str(if is_desc { " ORDER BY mk DESC" } else { " ORDER BY mk ASC" });
    // Fetch one extra month to detect if there's a next page
    months_sql.push_str(&format!(" LIMIT {}", filters.months_per_page + 1));

    let months_refs: Vec<&dyn rusqlite::types::ToSql> = months_params.iter().map(|p| p.as_ref()).collect();
    let mut months_stmt = conn.prepare(&months_sql).map_err(|e| e.to_string())?;
    let month_rows = months_stmt
        .query_map(months_refs.as_slice(), |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut all_months = Vec::new();
    for row in month_rows {
        all_months.push(row.map_err(|e| e.to_string())?);
    }

    let has_more = all_months.len() as i64 > filters.months_per_page;
    let target_months: Vec<String> = all_months
        .into_iter()
        .take(filters.months_per_page as usize)
        .collect();

    if target_months.is_empty() {
        return Ok(MediaPage {
            items: Vec::new(),
            next_cursor: None,
        });
    }

    let next_cursor = if has_more {
        target_months.last().cloned()
    } else {
        None
    };

    // Step 2: Fetch all images from the target months
    let (where_sql2, mut items_params) = build_where();
    let month_placeholders: String = target_months.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let items_sql = format!(
        "SELECT m.id, m.file_path, s.name, m.timestamp_ms, c.title, c.chat_type, m.file_type, m.conversation_id, m.sender_id
         FROM media m
         INNER JOIN senders s ON s.id = m.sender_id
         INNER JOIN conversations c ON c.id = m.conversation_id
         {} AND strftime('%Y-%m', datetime(m.timestamp_ms / 1000, 'unixepoch')) IN ({})
         ORDER BY m.timestamp_ms {}",
        where_sql2,
        month_placeholders,
        if is_desc { "DESC" } else { "ASC" }
    );

    for m in &target_months {
        items_params.push(Box::new(m.clone()));
    }

    let items_refs: Vec<&dyn rusqlite::types::ToSql> = items_params.iter().map(|p| p.as_ref()).collect();
    let mut items_stmt = conn.prepare(&items_sql).map_err(|e| e.to_string())?;
    let item_rows = items_stmt
        .query_map(items_refs.as_slice(), |row| {
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

    let mut items = Vec::new();
    for row in item_rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    Ok(MediaPage { items, next_cursor })
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
