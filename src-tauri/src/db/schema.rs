use rusqlite::Connection;

const CURRENT_SCHEMA_VERSION: i32 = 2;

/// Initialize the database schema. Creates tables if they don't exist.
/// Handles migration from old schema versions by recreating tables.
pub fn initialize(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Create schema_version table if it doesn't exist
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        );"
    )?;

    let version: i32 = conn
        .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0);

    if version < CURRENT_SCHEMA_VERSION {
        // Drop old tables if they exist (data is imported, not user-generated)
        conn.execute_batch(
            "
            DROP TABLE IF EXISTS context_messages;
            DROP TABLE IF EXISTS media;
            DROP TABLE IF EXISTS conversation_participants;
            DROP TABLE IF EXISTS senders;
            DROP TABLE IF EXISTS conversations;
            DROP TABLE IF EXISTS schema_version;
            ",
        )?;

        // Recreate schema_version
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER NOT NULL
            );"
        )?;
        conn.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            rusqlite::params![CURRENT_SCHEMA_VERSION],
        )?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversations (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_name       TEXT NOT NULL,
            title             TEXT NOT NULL,
            chat_type         TEXT NOT NULL CHECK(chat_type IN ('group', 'dm')),
            participant_count INTEGER NOT NULL,
            thread_path       TEXT NOT NULL,
            source_type       TEXT NOT NULL DEFAULT 'facebook' CHECK(source_type IN ('facebook', 'messenger')),
            source_path       TEXT NOT NULL DEFAULT '',
            UNIQUE(source_path, folder_name)
        );

        CREATE TABLE IF NOT EXISTS senders (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS conversation_participants (
            conversation_id INTEGER NOT NULL REFERENCES conversations(id),
            sender_id       INTEGER NOT NULL REFERENCES senders(id),
            PRIMARY KEY (conversation_id, sender_id)
        );

        CREATE TABLE IF NOT EXISTS media (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id     INTEGER NOT NULL REFERENCES conversations(id),
            sender_id           INTEGER NOT NULL REFERENCES senders(id),
            file_path           TEXT NOT NULL,
            relative_uri        TEXT NOT NULL,
            file_type           TEXT NOT NULL CHECK(file_type IN ('image', 'video', 'gif')),
            timestamp_ms        INTEGER NOT NULL,
            creation_timestamp  INTEGER,
            message_content     TEXT
        );

        CREATE TABLE IF NOT EXISTS context_messages (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id     INTEGER NOT NULL REFERENCES media(id),
            sender_id    INTEGER NOT NULL REFERENCES senders(id),
            content      TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            position     INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_media_conversation ON media(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_media_sender ON media(sender_id);
        CREATE INDEX IF NOT EXISTS idx_media_file_type ON media(file_type);
        CREATE INDEX IF NOT EXISTS idx_media_timestamp ON media(timestamp_ms);
        CREATE INDEX IF NOT EXISTS idx_context_media ON context_messages(media_id);
        ",
    )?;
    Ok(())
}

/// Drop all tables (used before re-import).
pub fn clear_all(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        DELETE FROM context_messages;
        DELETE FROM media;
        DELETE FROM conversation_participants;
        DELETE FROM senders;
        DELETE FROM conversations;
        ",
    )?;
    Ok(())
}

/// Delete only data from a specific source path (cascading manually).
pub fn clear_source(conn: &Connection, source_path: &str) -> Result<(), rusqlite::Error> {
    // Delete context_messages for media in conversations from this source
    conn.execute(
        "DELETE FROM context_messages WHERE media_id IN (
            SELECT m.id FROM media m
            INNER JOIN conversations c ON c.id = m.conversation_id
            WHERE c.source_path = ?1
        )",
        rusqlite::params![source_path],
    )?;

    // Delete media in conversations from this source
    conn.execute(
        "DELETE FROM media WHERE conversation_id IN (
            SELECT id FROM conversations WHERE source_path = ?1
        )",
        rusqlite::params![source_path],
    )?;

    // Delete conversation_participants for conversations from this source
    conn.execute(
        "DELETE FROM conversation_participants WHERE conversation_id IN (
            SELECT id FROM conversations WHERE source_path = ?1
        )",
        rusqlite::params![source_path],
    )?;

    // Delete conversations from this source
    conn.execute(
        "DELETE FROM conversations WHERE source_path = ?1",
        rusqlite::params![source_path],
    )?;

    // Clean up orphaned senders (senders with no media and no conversation_participants)
    conn.execute_batch(
        "DELETE FROM senders WHERE id NOT IN (
            SELECT DISTINCT sender_id FROM media
            UNION
            SELECT DISTINCT sender_id FROM conversation_participants
        )"
    )?;

    Ok(())
}
