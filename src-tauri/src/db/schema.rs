use rusqlite::Connection;

const CURRENT_SCHEMA_VERSION: i32 = 5;

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

    if version < 2 {
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
    }

    if version >= 3 && version < 4 {
        // v3 -> v4: add color column to albums
        conn.execute_batch(
            "ALTER TABLE albums ADD COLUMN color TEXT NOT NULL DEFAULT '#60a5fa';"
        )?;
    }

    if version >= 4 && version < 5 {
        // v4 -> v5: add media_embeddings table for AI search
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS media_embeddings (
                media_id  INTEGER PRIMARY KEY REFERENCES media(id),
                embedding BLOB NOT NULL
            );"
        )?;
    }

    if version < CURRENT_SCHEMA_VERSION {
        // Update version
        if version == 0 {
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                rusqlite::params![CURRENT_SCHEMA_VERSION],
            )?;
        } else {
            conn.execute(
                "UPDATE schema_version SET version = ?1",
                rusqlite::params![CURRENT_SCHEMA_VERSION],
            )?;
        }
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
        CREATE INDEX IF NOT EXISTS idx_context_content ON context_messages(media_id, content);

        CREATE TABLE IF NOT EXISTS albums (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            color      TEXT NOT NULL DEFAULT '#60a5fa',
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
        );

        CREATE TABLE IF NOT EXISTS album_media (
            album_id  INTEGER NOT NULL REFERENCES albums(id),
            media_id  INTEGER NOT NULL REFERENCES media(id),
            added_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
            PRIMARY KEY (album_id, media_id)
        );
        CREATE INDEX IF NOT EXISTS idx_album_media_album ON album_media(album_id);
        CREATE INDEX IF NOT EXISTS idx_album_media_media ON album_media(media_id);

        CREATE TABLE IF NOT EXISTS media_embeddings (
            media_id  INTEGER PRIMARY KEY REFERENCES media(id),
            embedding BLOB NOT NULL
        );
        ",
    )?;
    Ok(())
}

/// Drop all tables (used before re-import).
pub fn clear_all(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        DELETE FROM media_embeddings;
        DELETE FROM album_media;
        DELETE FROM albums;
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

    // Clean up orphaned embeddings (media that no longer exists)
    conn.execute_batch(
        "DELETE FROM media_embeddings WHERE media_id NOT IN (
            SELECT id FROM media
        )"
    )?;

    // Clean up orphaned album_media rows (media that no longer exists)
    conn.execute_batch(
        "DELETE FROM album_media WHERE media_id NOT IN (
            SELECT id FROM media
        )"
    )?;

    // Clean up orphaned senders (senders with no media, no participants, and no context messages)
    conn.execute_batch(
        "DELETE FROM senders WHERE id NOT IN (
            SELECT DISTINCT sender_id FROM media
            UNION
            SELECT DISTINCT sender_id FROM conversation_participants
            UNION
            SELECT DISTINCT sender_id FROM context_messages
        )"
    )?;

    Ok(())
}
