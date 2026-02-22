use serde::Deserialize;
use crate::parser::facebook::{Message, MediaRef, GifRef};

/// Top-level structure of a Messenger export JSON file.
#[derive(Deserialize, Debug)]
pub struct MessengerExport {
    pub participants: Vec<String>,
    #[serde(rename = "threadName")]
    pub thread_name: String,
    pub messages: Vec<MessengerMessage>,
}

#[derive(Deserialize, Debug)]
pub struct MessengerMessage {
    #[serde(rename = "senderName")]
    pub sender_name: String,
    pub timestamp: i64,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub media: Vec<MessengerMediaRef>,
}

#[derive(Deserialize, Debug)]
pub struct MessengerMediaRef {
    pub uri: String,
}

/// Convert a Messenger message into the existing Facebook Message struct
/// so that extract_media() and build_context() can be reused.
pub fn to_facebook_message(msg: &MessengerMessage) -> Message {
    let mut photos: Vec<MediaRef> = Vec::new();
    let mut videos: Vec<MediaRef> = Vec::new();
    let mut gifs: Vec<GifRef> = Vec::new();

    for media_ref in &msg.media {
        let uri = &media_ref.uri;
        let ext = uri.rsplit('.').next().unwrap_or("").to_lowercase();
        match ext.as_str() {
            "jpg" | "jpeg" | "png" | "webp" => {
                photos.push(MediaRef {
                    uri: uri.clone(),
                    creation_timestamp: None,
                });
            }
            "mp4" => {
                videos.push(MediaRef {
                    uri: uri.clone(),
                    creation_timestamp: None,
                });
            }
            "gif" => {
                gifs.push(GifRef {
                    uri: uri.clone(),
                });
            }
            // Skip audio (.ogg) and other unsupported formats
            _ => {}
        }
    }

    let content = if msg.text.is_empty() {
        None
    } else {
        Some(msg.text.clone())
    };

    Message {
        sender_name: msg.sender_name.clone(),
        timestamp_ms: msg.timestamp,
        content,
        photos: if photos.is_empty() { None } else { Some(photos) },
        videos: if videos.is_empty() { None } else { Some(videos) },
        gifs: if gifs.is_empty() { None } else { Some(gifs) },
    }
}
