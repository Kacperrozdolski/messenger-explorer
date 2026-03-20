use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use image::GenericImageView;
use ndarray::Array4;
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use ort::value::Tensor;
use safetensors::SafeTensors;
use tokenizers::Tokenizer;

static ORT_INIT: OnceLock<Result<(), String>> = OnceLock::new();

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

    let result = ORT_INIT.get_or_init(|| {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            ort::init().commit();
        })) {
            Ok(()) => {
                log::info!("ONNX Runtime initialized from {}", lib_dir.display());
                Ok(())
            }
            Err(e) => {
                let msg = if let Some(s) = e.downcast_ref::<String>() {
                    format!("ONNX Runtime initialization panicked: {}", s)
                } else if let Some(s) = e.downcast_ref::<&str>() {
                    format!("ONNX Runtime initialization panicked: {}", s)
                } else {
                    "ONNX Runtime initialization panicked (unknown error)".to_string()
                };
                log::error!("{}", msg);
                Err(msg)
            }
        }
    });

    result.clone()
}

const IMAGE_SIZE: usize = 224;
const MAX_TOKEN_LEN: usize = 128;
const DISTILBERT_DIM: usize = 768;
const CLIP_DIM: usize = 512;

// CLIP normalization constants
const MEAN: [f32; 3] = [0.48145466, 0.4578275, 0.40821073];
const STD: [f32; 3] = [0.26862954, 0.26130258, 0.27577711];

pub struct ClipModel {
    visual: Session,
    textual: Session,
    tokenizer: Tokenizer,
    /// Dense projection weights [CLIP_DIM, DISTILBERT_DIM] (512 x 768), no bias
    dense_weights: Vec<f32>,
}

impl ClipModel {
    pub fn load(models_dir: &Path) -> Result<Self, String> {
        // Initialize ONNX Runtime from the bundled shared library
        init_ort(models_dir)?;

        let visual_path = models_dir.join("clip-visual.onnx");
        let textual_path = models_dir.join("clip-textual.onnx");
        let tokenizer_path = models_dir.join("tokenizer.json");
        let dense_path = models_dir.join("dense.safetensors");

        if !visual_path.exists() {
            return Err(format!("Visual model not found: {}", visual_path.display()));
        }
        if !textual_path.exists() {
            return Err(format!("Text model not found: {}", textual_path.display()));
        }
        if !tokenizer_path.exists() {
            return Err(format!("Tokenizer not found: {}", tokenizer_path.display()));
        }
        if !dense_path.exists() {
            return Err(format!("Dense weights not found: {}", dense_path.display()));
        }

        log::info!("Loading visual encoder...");
        let visual = Self::create_session(&visual_path)?;
        log::info!("Loading text encoder...");
        let textual = Self::create_session(&textual_path)?;

        log::info!("Loading tokenizer...");
        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| format!("Failed to load tokenizer: {}", e))?;

        log::info!("Loading dense projection weights...");
        let dense_weights = Self::load_dense_weights(&dense_path)?;

        log::info!("All CLIP models loaded from {}", models_dir.display());
        Ok(Self {
            visual,
            textual,
            tokenizer,
            dense_weights,
        })
    }

    fn load_dense_weights(path: &Path) -> Result<Vec<f32>, String> {
        let data = std::fs::read(path)
            .map_err(|e| format!("Failed to read dense weights: {}", e))?;
        let tensors = SafeTensors::deserialize(&data)
            .map_err(|e| format!("Failed to parse safetensors: {}", e))?;
        let weight = tensors
            .tensor("linear.weight")
            .or_else(|_| tensors.tensor("weight"))
            .map_err(|e| format!("Failed to find weight tensor in dense: {}", e))?;
        let bytes = weight.data();
        let floats: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
            .collect();
        if floats.len() != CLIP_DIM * DISTILBERT_DIM {
            return Err(format!(
                "Dense weight size mismatch: expected {}, got {}",
                CLIP_DIM * DISTILBERT_DIM,
                floats.len()
            ));
        }
        log::info!("Loaded dense projection weights ({}x{})", CLIP_DIM, DISTILBERT_DIM);
        Ok(floats)
    }

    fn create_session(model_path: &Path) -> Result<Session, String> {
        log::info!("Creating ONNX session for {}...", model_path.display());
        let mut builder =
            Session::builder().map_err(|e| format!("Failed to create session builder: {}", e))?;
        // Limit ONNX to 2 threads to avoid starving the UI
        builder = builder
            .with_intra_threads(2)
            .map_err(|e| format!("Failed to set intra threads: {}", e))?;
        builder = builder
            .with_inter_threads(1)
            .map_err(|e| format!("Failed to set inter threads: {}", e))?;
        // Use basic optimizations only — Level3 (default) takes minutes on large models
        builder = builder
            .with_optimization_level(GraphOptimizationLevel::Level1)
            .map_err(|e| format!("Failed to set optimization level: {}", e))?;
        let session = builder
            .commit_from_file(model_path)
            .map_err(|e| format!("Failed to load model {}: {}", model_path.display(), e))?;
        log::info!("ONNX session created for {}", model_path.display());
        Ok(session)
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

        let ids = encoding.get_ids();
        let token_count = ids.len().min(MAX_TOKEN_LEN);

        let mut token_ids = vec![0i64; MAX_TOKEN_LEN];
        let mut attention_mask = vec![0i64; MAX_TOKEN_LEN];
        for i in 0..token_count {
            token_ids[i] = ids[i] as i64;
            attention_mask[i] = 1;
        }

        let input_ids = Tensor::from_array(([1usize, MAX_TOKEN_LEN], token_ids))
            .map_err(|e| format!("Failed to create tensor: {}", e))?;
        let attn_mask = Tensor::from_array(([1usize, MAX_TOKEN_LEN], attention_mask.clone()))
            .map_err(|e| format!("Failed to create attention mask tensor: {}", e))?;

        let outputs = self
            .textual
            .run(ort::inputs!["input_ids" => input_ids, "attention_mask" => attn_mask])
            .map_err(|e| format!("Text inference failed: {}", e))?;

        // Output shape: [1, seq_len, 768] — token-level embeddings
        let output = &outputs[0];
        let (_, token_embeddings) = output
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Failed to extract text embedding: {}", e))?;

        // Mean pooling: average token embeddings weighted by attention mask
        let mut pooled = vec![0.0f32; DISTILBERT_DIM];
        let mask_sum: f32 = attention_mask.iter().map(|&m| m as f32).sum();
        for i in 0..MAX_TOKEN_LEN {
            if attention_mask[i] == 1 {
                for j in 0..DISTILBERT_DIM {
                    pooled[j] += token_embeddings[i * DISTILBERT_DIM + j];
                }
            }
        }
        for v in &mut pooled {
            *v /= mask_sum;
        }

        // Dense projection: [768] -> [512], weights are [512, 768] row-major
        let mut projected = vec![0.0f32; CLIP_DIM];
        for i in 0..CLIP_DIM {
            let row_offset = i * DISTILBERT_DIM;
            for j in 0..DISTILBERT_DIM {
                projected[i] += self.dense_weights[row_offset + j] * pooled[j];
            }
        }

        Ok(normalize_vec(&projected))
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
    let raw = rgb.as_raw();
    let px_count = IMAGE_SIZE * IMAGE_SIZE;

    // Vectorized: build flat Vec then reshape — avoids per-pixel indexing overhead
    let mut data = vec![0.0f32; 3 * px_count];
    for i in 0..px_count {
        let r = raw[i * 3] as f32 / 255.0;
        let g = raw[i * 3 + 1] as f32 / 255.0;
        let b = raw[i * 3 + 2] as f32 / 255.0;
        data[i] = (r - MEAN[0]) / STD[0];
        data[px_count + i] = (g - MEAN[1]) / STD[1];
        data[2 * px_count + i] = (b - MEAN[2]) / STD[2];
    }

    Array4::from_shape_vec((1, 3, IMAGE_SIZE, IMAGE_SIZE), data)
        .expect("shape mismatch in preprocess_image")
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
/// When `sender_ids` or `conversation_ids` are non-empty, only images matching
/// those filters are indexed (combined with OR).
pub fn run_indexing(
    model: &mut ClipModel,
    conn: &rusqlite::Connection,
    cancel_flag: &AtomicBool,
    on_progress: impl Fn(u64, u64),
    sender_ids: &[i64],
    conversation_ids: &[i64],
) -> Result<u64, String> {
    let mut sql = String::from(
        "SELECT m.id, m.file_path FROM media m
         WHERE m.file_type = 'image'
         AND m.id NOT IN (SELECT media_id FROM media_embeddings)",
    );

    let mut params: Vec<rusqlite::types::Value> = Vec::new();

    let has_sender = !sender_ids.is_empty();
    let has_conv = !conversation_ids.is_empty();

    if has_sender || has_conv {
        let mut or_parts = Vec::new();

        if has_sender {
            let placeholders: Vec<String> = sender_ids.iter().map(|_| "?".to_string()).collect();
            or_parts.push(format!("m.sender_id IN ({})", placeholders.join(",")));
            for id in sender_ids {
                params.push(rusqlite::types::Value::Integer(*id));
            }
        }

        if has_conv {
            let placeholders: Vec<String> = conversation_ids.iter().map(|_| "?".to_string()).collect();
            or_parts.push(format!("m.conversation_id IN ({})", placeholders.join(",")));
            for id in conversation_ids {
                params.push(rusqlite::types::Value::Integer(*id));
            }
        }

        sql.push_str(&format!(" AND ({})", or_parts.join(" OR ")));
    }

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| e.to_string())?;

    let items: Vec<(i64, String)> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| Ok((row.get(0)?, row.get(1)?)))
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

    const BATCH_SIZE: usize = 100;
    let mut batch: Vec<(i64, Vec<u8>)> = Vec::with_capacity(BATCH_SIZE);

    for (media_id, file_path) in &items {
        if cancel_flag.load(Ordering::Relaxed) {
            log::info!("Indexing cancelled at {}/{}", indexed, total);
            break;
        }

        let path = PathBuf::from(file_path);
        if !path.exists() {
            indexed += 1;
            if indexed % 10 == 0 { on_progress(indexed, total); }
            continue;
        }

        match model.encode_image(&path) {
            Ok(embedding) => {
                batch.push((*media_id, embedding_to_bytes(&embedding)));
            }
            Err(e) => {
                log::warn!("Failed to encode image {}: {}", file_path, e);
            }
        }

        // Flush batch
        if batch.len() >= BATCH_SIZE {
            flush_embedding_batch(conn, &batch)?;
            batch.clear();
        }

        indexed += 1;
        if indexed % 10 == 0 || indexed == total {
            on_progress(indexed, total);
        }

        // Yield CPU periodically so the UI thread stays responsive
        if indexed % 5 == 0 {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }

    // Flush remaining
    if !batch.is_empty() {
        flush_embedding_batch(conn, &batch)?;
    }

    Ok(indexed)
}

fn flush_embedding_batch(conn: &rusqlite::Connection, batch: &[(i64, Vec<u8>)]) -> Result<(), String> {
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
    for (media_id, bytes) in batch {
        conn.execute(
            "INSERT OR REPLACE INTO media_embeddings (media_id, embedding) VALUES (?1, ?2)",
            rusqlite::params![media_id, bytes],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    Ok(())
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
