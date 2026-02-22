use serde::Deserialize;

/// Top-level structure of a Facebook message_*.json file.
#[derive(Deserialize, Debug)]
pub struct FacebookExport {
    pub participants: Vec<Participant>,
    pub messages: Vec<Message>,
    pub title: String,
    #[serde(default)]
    pub thread_path: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Participant {
    pub name: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Message {
    pub sender_name: String,
    pub timestamp_ms: i64,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub photos: Option<Vec<MediaRef>>,
    #[serde(default)]
    pub videos: Option<Vec<MediaRef>>,
    #[serde(default)]
    pub gifs: Option<Vec<GifRef>>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct MediaRef {
    pub uri: String,
    #[serde(default)]
    pub creation_timestamp: Option<i64>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct GifRef {
    pub uri: String,
}

impl Message {
    /// Returns true if this message contains any media (photo, video, or gif).
    pub fn has_media(&self) -> bool {
        let has_photos = self.photos.as_ref().map_or(false, |p| !p.is_empty());
        let has_videos = self.videos.as_ref().map_or(false, |v| !v.is_empty());
        let has_gifs = self.gifs.as_ref().map_or(false, |g| !g.is_empty());
        has_photos || has_videos || has_gifs
    }
}
