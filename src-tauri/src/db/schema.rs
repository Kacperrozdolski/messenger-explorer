use rusqlite::Connection;

/// Initialize the database schema. Creates tables if they don't exist.
pub fn initialize(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversations (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_name       TEXT NOT NULL UNIQUE,
            title             TEXT NOT NULL,
            chat_type         TEXT NOT NULL CHECK(chat_type IN ('group', 'dm')),
            participant_count INTEGER NOT NULL,
            thread_path       TEXT NOT NULL
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
