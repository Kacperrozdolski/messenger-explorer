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

// ── Shared WHERE-clause builder ─────────────────────────────────────────

struct WhereClause {
    sql: String,
    params: Vec<Box<dyn rusqlite::types::ToSql>>,
    /// Whether an album JOIN is needed (replaces the old IN-subquery).
    needs_album_join: bool,
    /// Whether the search touches context_messages (needs a semi-join).
    needs_search_join: bool,
    search_pattern: Option<String>,
}

/// Build a reusable WHERE clause from MediaFilters.
/// `exclude` lets facet queries skip one dimension (e.g. "file_type").
fn build_where(filters: &MediaFilters, exclude: &str) -> WhereClause {
    let mut sql = String::from("WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut needs_album_join = false;
    let mut needs_search_join = false;
    let mut search_pattern: Option<String> = None;

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
                sql.push_str(" AND m.year_month LIKE ?");
                params.push(Box::new(format!("{}-%", month)));
            } else {
                sql.push_str(" AND m.year_month = ?");
                params.push(Box::new(month.clone()));
            }
        }
    }
    if exclude != "album_id" {
        if filters.album_id.is_some() {
            needs_album_join = true;
        }
    }
    if exclude != "search" {
        if let Some(ref search) = filters.search {
            let trimmed = search.trim();
            if trimmed.len() >= 2 {
                let pattern = format!("%{}%", trimmed.to_lowercase());
                // Use pre-lowered columns — avoids LOWER() at query time
                sql.push_str(
                    " AND (m.message_content_lower LIKE ? OR _ctx_search.media_id IS NOT NULL)",
                );
                params.push(Box::new(pattern.clone()));
                needs_search_join = true;
                search_pattern = Some(pattern);
            }
        }
    }

    WhereClause { sql, params, needs_album_join, needs_search_join, search_pattern }
}

/// Build the FROM + JOIN clause using a WhereClause.
/// `base_joins` are extra JOINs the caller always needs (e.g. senders/conversations).
fn build_from(wc: &WhereClause, base_joins: &str) -> String {
    let mut from = format!("FROM media m{}", base_joins);
    if wc.needs_album_join {
        from.push_str(" INNER JOIN album_media am ON am.media_id = m.id");
    }
    if wc.needs_search_join {
        from.push_str(
            " LEFT JOIN (SELECT DISTINCT cm.media_id FROM context_messages cm WHERE cm.content_lower LIKE ?) _ctx_search ON _ctx_search.media_id = m.id"
        );
    }
    from
}

fn param_refs_with_joins<'a>(
    wc: &'a WhereClause,
    album_id_param: &'a Option<i64>,
    extra_where_sql: &mut String,
) -> Vec<&'a dyn rusqlite::types::ToSql> {
    let mut refs: Vec<&dyn rusqlite::types::ToSql> = Vec::new();

    // FROM-level params come first in SQLite's binding order:
    // search join param
    if wc.needs_search_join {
        if let Some(ref pattern) = wc.search_pattern {
            refs.push(pattern as &dyn rusqlite::types::ToSql);
        }
    }

    // Album id for the join — we add a WHERE condition
    if wc.needs_album_join {
        if let Some(ref aid) = album_id_param {
            extra_where_sql.push_str(" AND am.album_id = ?");
            refs.push(aid as &dyn rusqlite::types::ToSql);
        }
    }

    // WHERE-level params
    for p in &wc.params {
        refs.push(p.as_ref());
    }

    refs
}

// ── Public query functions ──────────────────────────────────────────────

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
             ORDER BY c.title COLLATE NOCASE",
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

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_senders(conn: &Connection) -> Result<Vec<SenderInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, COUNT(m.id) as media_count
             FROM senders s
             INNER JOIN media m ON m.sender_id = s.id
             GROUP BY s.id
             ORDER BY s.name COLLATE NOCASE",
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

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_media(conn: &Connection, filters: &MediaFilters) -> Result<Vec<MediaItem>, String> {
    let wc = build_where(filters, "");
    let base_joins = "\n INNER JOIN senders s ON s.id = m.sender_id\n INNER JOIN conversations c ON c.id = m.conversation_id";
    let from = build_from(&wc, base_joins);

    let mut extra_where = String::new();
    let album_id = filters.album_id;
    let mut param_list = param_refs_with_joins(&wc, &album_id, &mut extra_where);

    // Sort
    let order = match filters.sort.as_str() {
        "date-asc" => " ORDER BY m.timestamp_ms ASC",
        "sender" => " ORDER BY s.name COLLATE NOCASE ASC, m.timestamp_ms DESC",
        _ => " ORDER BY m.timestamp_ms DESC",
    };

    let limit = filters.limit.unwrap_or(500);
    let offset = filters.offset.unwrap_or(0);

    let sql = format!(
        "SELECT m.id, m.file_path, s.name, m.timestamp_ms, c.title, c.chat_type, m.file_type, m.conversation_id, m.sender_id\n {}\n {}{}{} LIMIT ? OFFSET ?",
        from, wc.sql, extra_where, order
    );

    param_list.push(&limit);
    param_list.push(&offset);

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_list.as_slice(), |row| {
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

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_context(conn: &Connection, media_id: i64) -> Result<MediaContext, String> {
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
            "SELECT m.year_month as month_key, COUNT(*) as count
             FROM media m
             GROUP BY m.year_month
             ORDER BY month_key DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let month_key: String = row.get(0)?;
            let label = format_month_label(&month_key);
            Ok(TimelineEntry {
                label,
                month_key,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
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

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
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

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_media_count(conn: &Connection, filters: &MediaFilters) -> Result<i64, String> {
    let wc = build_where(filters, "");
    // Count query doesn't need the senders/conversations JOIN unless search or sender filter.
    // But for simplicity and to keep the WHERE clause working, we include minimal joins.
    let from = build_from(&wc, "");

    let mut extra_where = String::new();
    let album_id = filters.album_id;
    let param_list = param_refs_with_joins(&wc, &album_id, &mut extra_where);

    let sql = format!(
        "SELECT COUNT(*)\n {}\n {}{}",
        from, wc.sql, extra_where
    );

    conn.query_row(&sql, param_list.as_slice(), |row| row.get(0))
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

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_media_albums(conn: &Connection, media_id: i64) -> Result<Vec<i64>, String> {
    let mut stmt = conn
        .prepare("SELECT album_id FROM album_media WHERE media_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![media_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
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

/// Helper to run a facet query using the shared WHERE builder.
fn run_facet_query<T, F>(
    conn: &Connection,
    filters: &MediaFilters,
    exclude: &str,
    select: &str,
    extra_joins: &str,
    group_order: &str,
    map_fn: F,
) -> Result<Vec<T>, String>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
{
    let wc = build_where(filters, exclude);
    let from = build_from(&wc, extra_joins);

    let mut extra_where = String::new();
    let album_id = filters.album_id;
    let param_list = param_refs_with_joins(&wc, &album_id, &mut extra_where);

    let sql = format!(
        "SELECT {}\n {}\n {}{} {}",
        select, from, wc.sql, extra_where, group_order
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_list.as_slice(), map_fn)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_filter_facets(conn: &Connection, filters: &MediaFilters) -> Result<FilterFacets, String> {
    // Conversations facet: apply all filters except conversation_id
    let conversations = run_facet_query(
        conn, filters, "conversation_id",
        "c.id, c.title, c.chat_type, COUNT(m.id) as media_count",
        "\n INNER JOIN conversations c ON c.id = m.conversation_id",
        "GROUP BY c.id ORDER BY c.title COLLATE NOCASE",
        |row| Ok(ConversationInfo {
            id: row.get(0)?,
            title: row.get(1)?,
            chat_type: row.get(2)?,
            media_count: row.get(3)?,
        }),
    )?;

    // Senders facet: apply all filters except sender_id
    let senders = run_facet_query(
        conn, filters, "sender_id",
        "s.id, s.name, COUNT(m.id) as media_count",
        "\n INNER JOIN senders s ON s.id = m.sender_id",
        "GROUP BY s.id ORDER BY s.name COLLATE NOCASE",
        |row| Ok(SenderInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            media_count: row.get(2)?,
        }),
    )?;

    // Timeline facet: apply all filters except month
    let timeline = run_facet_query(
        conn, filters, "month",
        "m.year_month as month_key, COUNT(*) as count",
        "",
        "GROUP BY m.year_month ORDER BY month_key DESC",
        |row| {
            let month_key: String = row.get(0)?;
            let label = format_month_label(&month_key);
            Ok(TimelineEntry {
                label,
                month_key,
                count: row.get(1)?,
            })
        },
    )?;

    // File type facet: apply all filters except file_type
    let ft_rows = run_facet_query(
        conn, filters, "file_type",
        "m.file_type, COUNT(*) as count",
        "",
        "GROUP BY m.file_type",
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    )?;

    let mut file_type_counts = FileTypeCounts { image: 0, video: 0, gif: 0 };
    for (ft, count) in ft_rows {
        match ft.as_str() {
            "image" => file_type_counts.image = count,
            "video" => file_type_counts.video = count,
            "gif" => file_type_counts.gif = count,
            _ => {}
        }
    }

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

    // Convert MonthPageFilters to MediaFilters for the shared builder
    let media_filters = MediaFilters {
        conversation_id: filters.conversation_id,
        sender_id: filters.sender_id,
        file_type: filters.file_type.clone(),
        month: None, // month is handled by cursor
        search: filters.search.clone(),
        album_id: filters.album_id,
        sort: filters.sort.clone(),
        limit: None,
        offset: None,
    };

    // Step 1: Get target months
    let wc = build_where(&media_filters, "");
    let from = build_from(&wc, "");

    let mut extra_where = String::new();
    let album_id = media_filters.album_id;
    let mut param_list = param_refs_with_joins(&wc, &album_id, &mut extra_where);

    let cursor_month = filters.cursor_month.clone();
    if let Some(ref cursor) = cursor_month {
        if is_desc {
            extra_where.push_str(" AND m.year_month < ?");
        } else {
            extra_where.push_str(" AND m.year_month > ?");
        }
        param_list.push(cursor as &dyn rusqlite::types::ToSql);
    }

    let limit_months = filters.months_per_page + 1;

    let months_sql = format!(
        "SELECT DISTINCT m.year_month as mk\n {}\n {}{} ORDER BY mk {} LIMIT ?",
        from, wc.sql, extra_where,
        if is_desc { "DESC" } else { "ASC" }
    );
    param_list.push(&limit_months);

    let mut months_stmt = conn.prepare(&months_sql).map_err(|e| e.to_string())?;
    let month_rows = months_stmt
        .query_map(param_list.as_slice(), |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let all_months: Vec<String> = month_rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

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

    // Step 2: Fetch all items from target months
    let wc2 = build_where(&media_filters, "");
    let base_joins = "\n INNER JOIN senders s ON s.id = m.sender_id\n INNER JOIN conversations c ON c.id = m.conversation_id";
    let from2 = build_from(&wc2, base_joins);

    let mut extra_where2 = String::new();
    let album_id2 = media_filters.album_id;
    let mut param_list2 = param_refs_with_joins(&wc2, &album_id2, &mut extra_where2);

    let month_placeholders: String = target_months.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    extra_where2.push_str(&format!(" AND m.year_month IN ({})", month_placeholders));

    for m in &target_months {
        param_list2.push(m as &dyn rusqlite::types::ToSql);
    }

    let items_sql = format!(
        "SELECT m.id, m.file_path, s.name, m.timestamp_ms, c.title, c.chat_type, m.file_type, m.conversation_id, m.sender_id\n {}\n {}{} ORDER BY m.timestamp_ms {}",
        from2, wc2.sql, extra_where2,
        if is_desc { "DESC" } else { "ASC" }
    );

    let mut items_stmt = conn.prepare(&items_sql).map_err(|e| e.to_string())?;
    let item_rows = items_stmt
        .query_map(param_list2.as_slice(), |row| {
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

    let items: Vec<MediaItem> = item_rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

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
