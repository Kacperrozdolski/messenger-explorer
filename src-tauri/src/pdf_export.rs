use ::image::GenericImageView;
use printpdf::*;
use std::fs;
use std::io::{BufWriter, Cursor};
use std::path::Path;

// A4 dimensions in mm
const PAGE_W: f32 = 210.0;
const PAGE_H: f32 = 297.0;
const MARGIN: f32 = 10.0;
const GAP: f32 = 5.0;

// Standard photo print size: 10x15 cm
const PHOTO_SHORT: f32 = 100.0; // 10 cm
const PHOTO_LONG: f32 = 150.0;  // 15 cm

const USABLE_W: f32 = PAGE_W - 2.0 * MARGIN;
const USABLE_H: f32 = PAGE_H - 2.0 * MARGIN;

// 1mm = 2.834646 PDF points
const MM_TO_PT: f32 = 2.834646;

struct PhotoInfo {
    jpeg_data: Vec<u8>,
    width: u32,
    height: u32,
}

/// Slot size for a photo based on its orientation.
fn slot_size(photo: &PhotoInfo) -> (f32, f32) {
    if photo.width >= photo.height {
        (PHOTO_LONG, PHOTO_SHORT) // landscape: 150x100mm
    } else {
        (PHOTO_SHORT, PHOTO_LONG) // portrait: 100x150mm
    }
}

fn load_photo(path: &str) -> Option<PhotoInfo> {
    let p = Path::new(path);
    if !p.exists() {
        return None;
    }

    let data = fs::read(p).ok()?;
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "jpg" | "jpeg" => {
            let reader = ::image::ImageReader::new(Cursor::new(&data))
                .with_guessed_format()
                .ok()?;
            let dims = reader.into_dimensions().ok()?;
            Some(PhotoInfo {
                jpeg_data: data,
                width: dims.0,
                height: dims.1,
            })
        }
        "png" | "webp" | "bmp" => {
            let img = ::image::load_from_memory(&data).ok()?;
            let (w, h) = img.dimensions();
            let rgb = img.to_rgb8();
            let mut jpeg_buf = Vec::new();
            let mut cursor = Cursor::new(&mut jpeg_buf);
            rgb.write_to(&mut cursor, ::image::ImageFormat::Jpeg).ok()?;
            Some(PhotoInfo {
                jpeg_data: jpeg_buf,
                width: w,
                height: h,
            })
        }
        _ => None,
    }
}

struct SlotInRow {
    photo_idx: usize,
    slot_w: f32,
    slot_h: f32,
}

/// Pack photos into rows using standard 10x15cm slot sizes.
/// If a row's natural width exceeds the usable width, scale all slots down.
fn pack_rows(photos: &[PhotoInfo]) -> Vec<Vec<SlotInRow>> {
    let mut rows: Vec<Vec<SlotInRow>> = Vec::new();
    let mut current_row: Vec<SlotInRow> = Vec::new();
    let mut current_width: f32 = 0.0;

    for (idx, photo) in photos.iter().enumerate() {
        let (sw, sh) = slot_size(photo);
        let needed = if current_row.is_empty() { sw } else { GAP + sw };

        if current_width + needed > USABLE_W && !current_row.is_empty() {
            rows.push(current_row);
            current_row = Vec::new();
            current_width = 0.0;
        }

        if !current_row.is_empty() {
            current_width += GAP;
        }
        current_row.push(SlotInRow { photo_idx: idx, slot_w: sw, slot_h: sh });
        current_width += sw;
    }

    if !current_row.is_empty() {
        rows.push(current_row);
    }

    rows
}

/// Generate a PDF with photos at standard 10x15cm sizes on A4 pages.
/// Returns (exported_count, skipped_count).
pub fn generate_album_pdf(image_paths: Vec<String>, output_path: &str) -> Result<(usize, usize), String> {
    let mut photos: Vec<PhotoInfo> = Vec::new();
    let mut skipped = 0usize;

    for path in &image_paths {
        match load_photo(path) {
            Some(info) => photos.push(info),
            None => {
                skipped += 1;
                log::warn!("Skipping unreadable image: {}", path);
            }
        }
    }

    if photos.is_empty() {
        return Err("No valid images found to export".to_string());
    }

    let rows = pack_rows(&photos);
    let doc = PdfDocument::empty("Album Export");
    let mut row_idx = 0;
    let mut page_num = 0;

    while row_idx < rows.len() {
        let (page, layer_idx) = doc.add_page(
            Mm(PAGE_W),
            Mm(PAGE_H),
            &format!("Page {}", page_num + 1),
        );
        let layer = doc.get_page(page).get_layer(layer_idx);
        page_num += 1;

        let mut cursor_y = MARGIN; // distance from top edge

        while row_idx < rows.len() {
            let row = &rows[row_idx];

            // Calculate natural row dimensions
            let natural_width: f32 = row.iter().map(|s| s.slot_w).sum::<f32>()
                + GAP * (row.len() as f32 - 1.0);
            let row_height = row.iter().map(|s| s.slot_h).fold(0.0_f32, f32::max);

            // Scale factor if row overflows usable width
            let scale = if natural_width > USABLE_W {
                USABLE_W / natural_width
            } else {
                1.0
            };
            let scaled_height = row_height * scale;

            // Check if row fits on current page
            if cursor_y + scaled_height > MARGIN + USABLE_H {
                if cursor_y > MARGIN + GAP {
                    break; // start new page
                }
                break;
            }

            // Center the row horizontally
            let actual_width = natural_width * scale;
            let row_offset_x = MARGIN + (USABLE_W - actual_width) / 2.0;

            let mut cursor_x = row_offset_x;
            for slot in row.iter() {
                let photo = &photos[slot.photo_idx];
                let slot_w = slot.slot_w * scale;
                let slot_h = slot.slot_h * scale;

                // Fit image within slot (contain), maintaining aspect ratio
                let img_aspect = photo.width as f32 / photo.height as f32;
                let slot_aspect = slot_w / slot_h;
                let (render_w, render_h) = if img_aspect >= slot_aspect {
                    // Image wider than slot — fit to width
                    (slot_w, slot_w / img_aspect)
                } else {
                    // Image taller than slot — fit to height
                    (slot_h * img_aspect, slot_h)
                };

                // Center image within slot
                let offset_x = (slot_w - render_w) / 2.0;
                let offset_y = (slot_h - render_h) / 2.0;

                let x = cursor_x + offset_x;
                // printpdf origin is bottom-left
                let y = PAGE_H - cursor_y - slot_h + offset_y;

                // At dpi=72: 1px = 1pt. scale = target_pt / pixels
                let sx = render_w * MM_TO_PT / photo.width as f32;
                let sy = render_h * MM_TO_PT / photo.height as f32;

                let image = Image::from(ImageXObject {
                    width: Px(photo.width as usize),
                    height: Px(photo.height as usize),
                    color_space: ColorSpace::Rgb,
                    bits_per_component: ColorBits::Bit8,
                    interpolate: true,
                    image_data: photo.jpeg_data.clone(),
                    image_filter: Some(ImageFilter::DCT),
                    clipping_bbox: None,
                    smask: None,
                });

                image.add_to_layer(
                    layer.clone(),
                    ImageTransform {
                        translate_x: Some(Mm(x)),
                        translate_y: Some(Mm(y)),
                        scale_x: Some(sx),
                        scale_y: Some(sy),
                        dpi: Some(72.0),
                        ..Default::default()
                    },
                );

                cursor_x += slot_w + GAP * scale;
            }

            row_idx += 1;
            cursor_y += scaled_height + GAP;
        }
    }

    let exported = photos.len();
    let file = fs::File::create(output_path)
        .map_err(|e| format!("Failed to create PDF file: {}", e))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .map_err(|e| format!("Failed to save PDF: {}", e))?;

    Ok((exported, skipped))
}
