use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;

use image::GenericImageView;
use ndarray::Array4;
use ort::session::Session;
use ort::value::Tensor;
use tokenizers::Tokenizer;

static ORT_INIT: Once = Once::new();
static mut ORT_INIT_ERROR: Option<String> = None;

/// Initialize ONNX Runtime by pointing to the shared library.
/// Must be called before any Session is created. Safe to call multiple times.
pub fn init_ort(lib_dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let lib_name = "onnxruntime.dll";
    #[cfg(target_os = "macos")]
    let lib_name = "libonnxruntime.dylib";
    #[cfg(target_os = "linux")]
    let lib_name = "libonnxruntime.so";

    let lib_path = lib_dir.join(lib_name);
    if !lib_path.exists() {
        return Err(format!("ONNX Runtime library not found: {}", lib_path.display()));
    }

    // Set the env var so ort finds the DLL via load-dynamic
    std::env::set_var("ORT_DYLIB_PATH", &lib_path);
    log::info!("Set ORT_DYLIB_PATH={}", lib_path.display());

    ORT_INIT.call_once(|| {
        let builder = ort::init();
        builder.commit();
        log::info!("ONNX Runtime initialized from {}", lib_dir.display());
    });

    unsafe {
        if let Some(ref e) = ORT_INIT_ERROR {
            return Err(e.clone());
        }
    }
    Ok(())
}

const IMAGE_SIZE: usize = 224;
const MAX_TOKEN_LEN: usize = 77;

// CLIP normalization constants
const MEAN: [f32; 3] = [0.48145466, 0.4578275, 0.40821073];
const STD: [f32; 3] = [0.26862954, 0.26130258, 0.27577711];

pub struct ClipModel {
    visual: Session,
    textual: Session,
    tokenizer: Tokenizer,
}

impl ClipModel {
    pub fn load(models_dir: &Path) -> Result<Self, String> {
        // Initialize ONNX Runtime from the bundled shared library
        init_ort(models_dir)?;

        let visual_path = models_dir.join("clip-visual.onnx");
        let textual_path = models_dir.join("clip-textual.onnx");
        let tokenizer_path = models_dir.join("tokenizer.json");

        if !visual_path.exists() {
            return Err(format!("Visual model not found: {}", visual_path.display()));
        }
        if !textual_path.exists() {
            return Err(format!("Text model not found: {}", textual_path.display()));
        }
        if !tokenizer_path.exists() {
            return Err(format!("Tokenizer not found: {}", tokenizer_path.display()));
        }

        let visual = Self::create_session(&visual_path)?;
        let textual = Self::create_session(&textual_path)?;

        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| format!("Failed to load tokenizer: {}", e))?;

        log::info!("CLIP models loaded from {}", models_dir.display());
        Ok(Self {
            visual,
            textual,
            tokenizer,
        })
    }

    fn create_session(model_path: &Path) -> Result<Session, String> {
        let mut builder =
            Session::builder().map_err(|e| format!("Failed to create session builder: {}", e))?;
        let model_bytes = std::fs::read(model_path)
            .map_err(|e| format!("Failed to read model file {}: {}", model_path.display(), e))?;
        builder
            .commit_from_memory(&model_bytes)
            .map_err(|e| format!("Failed to load model {}: {}", model_path.display(), e))
    }

    pub fn encode_image(&mut self, image_path: &Path) -> Result<Vec<f32>, String> {
        let img =
            image::open(image_path).map_err(|e| format!("Failed to open image: {}", e))?;

        let tensor = preprocess_image(&img);

        let (raw_data, _offset) = tensor.into_raw_vec_and_offset();
        let input_value =
            Tensor::from_array(([1usize, 3, IMAGE_SIZE, IMAGE_SIZE], raw_data))
                .map_err(|e| format!("Failed to create tensor: {}", e))?;

        let outputs = self
            .visual
            .run(ort::inputs!["pixel_values" => input_value])
            .map_err(|e| format!("Visual inference failed: {}", e))?;

        let output = &outputs[0];
        let (_, emb_data) = output
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Failed to extract embedding: {}", e))?;

        Ok(normalize_vec(emb_data))
    }

    pub fn encode_text(&mut self, text: &str) -> Result<Vec<f32>, String> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| format!("Tokenization failed: {}", e))?;

        let mut token_ids = vec![0i64; MAX_TOKEN_LEN];
        for (i, &id) in encoding.get_ids().iter().enumerate().take(MAX_TOKEN_LEN) {
            token_ids[i] = id as i64;
        }

        let input_value = Tensor::from_array(([1usize, MAX_TOKEN_LEN], token_ids))
            .map_err(|e| format!("Failed to create tensor: {}", e))?;

        let outputs = self
            .textual
            .run(ort::inputs!["input_ids" => input_value])
            .map_err(|e| format!("Text inference failed: {}", e))?;

        let output = &outputs[0];
        let (_, emb_data) = output
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Failed to extract text embedding: {}", e))?;

        Ok(normalize_vec(emb_data))
    }
}

fn preprocess_image(img: &image::DynamicImage) -> Array4<f32> {
    let (w, h) = img.dimensions();
    let scale = IMAGE_SIZE as f32 / w.min(h) as f32;
    let new_w = (w as f32 * scale).ceil() as u32;
    let new_h = (h as f32 * scale).ceil() as u32;

    let resized = img.resize_exact(new_w, new_h, image::imageops::FilterType::Lanczos3);

    // Center crop to IMAGE_SIZE x IMAGE_SIZE
    let x_offset = (new_w.saturating_sub(IMAGE_SIZE as u32)) / 2;
    let y_offset = (new_h.saturating_sub(IMAGE_SIZE as u32)) / 2;
    let cropped = resized.crop_imm(x_offset, y_offset, IMAGE_SIZE as u32, IMAGE_SIZE as u32);

    let rgb = cropped.to_rgb8();

    // Convert to NCHW float tensor and normalize
    let mut tensor = Array4::<f32>::zeros((1, 3, IMAGE_SIZE, IMAGE_SIZE));
    for y in 0..IMAGE_SIZE {
        for x in 0..IMAGE_SIZE {
            let pixel = rgb.get_pixel(x as u32, y as u32);
            for c in 0..3 {
                tensor[[0, c, y, x]] = (pixel[c] as f32 / 255.0 - MEAN[c]) / STD[c];
            }
        }
    }
    tensor
}

fn normalize_vec(v: &[f32]) -> Vec<f32> {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        v.iter().map(|x| x / norm).collect()
    } else {
        v.to_vec()
    }
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

pub fn embedding_to_bytes(embedding: &[f32]) -> Vec<u8> {
    embedding
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect()
}

pub fn embedding_from_bytes(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

/// Run indexing on all unindexed images in the database.
pub fn run_indexing(
    model: &mut ClipModel,
    conn: &rusqlite::Connection,
    cancel_flag: &AtomicBool,
    on_progress: impl Fn(u64, u64),
) -> Result<u64, String> {
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.file_path FROM media m
             WHERE m.file_type = 'image'
             AND m.id NOT IN (SELECT media_id FROM media_embeddings)",
        )
        .map_err(|e| e.to_string())?;

    let items: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total = items.len() as u64;
    if total == 0 {
        on_progress(0, 0);
        return Ok(0);
    }

    let mut indexed: u64 = 0;
    on_progress(indexed, total);

    for (media_id, file_path) in &items {
        if cancel_flag.load(Ordering::Relaxed) {
            log::info!("Indexing cancelled at {}/{}", indexed, total);
            break;
        }

        let path = PathBuf::from(file_path);
        if !path.exists() {
            indexed += 1;
            on_progress(indexed, total);
            continue;
        }

        match model.encode_image(&path) {
            Ok(embedding) => {
                let bytes = embedding_to_bytes(&embedding);
                conn.execute(
                    "INSERT OR REPLACE INTO media_embeddings (media_id, embedding) VALUES (?1, ?2)",
                    rusqlite::params![media_id, bytes],
                )
                .map_err(|e| e.to_string())?;
            }
            Err(e) => {
                log::warn!("Failed to encode image {}: {}", file_path, e);
            }
        }

        indexed += 1;
        if indexed % 10 == 0 || indexed == total {
            on_progress(indexed, total);
        }
    }

    Ok(indexed)
}

/// Search for images similar to a text query.
pub fn search_by_text(
    model: &mut ClipModel,
    conn: &rusqlite::Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<(i64, f32)>, String> {
    let text_embedding = model.encode_text(query)?;

    let mut stmt = conn
        .prepare("SELECT media_id, embedding FROM media_embeddings")
        .map_err(|e| e.to_string())?;

    let mut results: Vec<(i64, f32)> = stmt
        .query_map([], |row| {
            let media_id: i64 = row.get(0)?;
            let bytes: Vec<u8> = row.get(1)?;
            Ok((media_id, bytes))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|(media_id, bytes)| {
            let img_embedding = embedding_from_bytes(&bytes);
            let similarity = cosine_similarity(&text_embedding, &img_embedding);
            (media_id, similarity)
        })
        .collect();

    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);

    Ok(results)
}
