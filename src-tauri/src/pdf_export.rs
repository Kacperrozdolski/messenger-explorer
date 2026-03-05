use ::image::GenericImageView;
use printpdf::*;
use std::fs;
use std::io::{BufWriter, Cursor};
use std::path::Path;

// A4 dimensions in mm
const PAGE_W: f32 = 210.0;
const PAGE_H: f32 = 297.0;
const MARGIN: f32 = 5.0;
const GAP: f32 = 5.0;

const USABLE_W: f32 = PAGE_W - 2.0 * MARGIN; // 200mm
const USABLE_H: f32 = PAGE_H - 2.0 * MARGIN; // 287mm

// Photo size: 2:3 ratio, computed to fit exactly 2×2 on a page.
// Height-constrained: h = (287 - 5) / 2 = 141mm, w = h / 1.5 = 94mm
const PHOTO_W: f32 = 94.0;
const PHOTO_H: f32 = 141.0;
const COLS: usize = 2;

// 1mm = 2.834646 PDF points
const MM_TO_PT: f32 = 2.834646;

struct PhotoInfo {
    jpeg_data: Vec<u8>,
    width: u32,
    height: u32,
}

/// Load a photo, rotate landscape to portrait, and center-crop to 2:3 ratio.
fn load_photo(path: &str) -> Option<PhotoInfo> {
    let p = Path::new(path);
    if !p.exists() {
        return None;
    }

    let data = fs::read(p).ok()?;
    let mut img = ::image::load_from_memory(&data).ok()?;
    let (ow, oh) = img.dimensions();

    // Rotate landscape photos 90° clockwise so all photos are portrait
    if ow > oh {
        img = img.rotate90();
    }

    let (ow, oh) = img.dimensions();

    // Center-crop to 2:3 ratio (w:h = 2:3)
    let target_w;
    let target_h;
    if ow as f32 / oh as f32 > 2.0 / 3.0 {
        // Too wide — crop sides
        target_h = oh;
        target_w = (oh as f32 * 2.0 / 3.0) as u32;
    } else {
        // Too tall — crop top/bottom
        target_w = ow;
        target_h = (ow as f32 * 3.0 / 2.0) as u32;
    }

    let cx = (ow.saturating_sub(target_w)) / 2;
    let cy = (oh.saturating_sub(target_h)) / 2;
    let cropped = img.crop_imm(cx, cy, target_w.min(ow), target_h.min(oh));

    let rgb = cropped.to_rgb8();
    let (w, h) = rgb.dimensions();
    let mut jpeg_buf = Vec::new();
    let mut cursor = Cursor::new(&mut jpeg_buf);
    rgb.write_to(&mut cursor, ::image::ImageFormat::Jpeg).ok()?;

    Some(PhotoInfo {
        jpeg_data: jpeg_buf,
        width: w,
        height: h,
    })
}

fn place_image(layer: &PdfLayerReference, photo: &PhotoInfo, x: f32, y: f32) {
    let sx = PHOTO_W * MM_TO_PT / photo.width as f32;
    let sy = PHOTO_H * MM_TO_PT / photo.height as f32;

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
}

/// Generate a PDF with all photos in a 2×2 grid on A4 pages.
/// Landscape photos are rotated to portrait. All photos are cropped to 2:3 ratio.
/// Returns (exported_count, skipped_count).
pub fn generate_album_pdf(
    image_paths: Vec<String>,
    output_path: &str,
) -> Result<(usize, usize), String> {
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

    // Center the 2-column grid horizontally
    let grid_w = PHOTO_W * COLS as f32 + GAP * (COLS as f32 - 1.0);
    let offset_x = MARGIN + (USABLE_W - grid_w) / 2.0;

    let doc = PdfDocument::empty("Album Export");
    let photos_per_page = 4;
    let total_pages = (photos.len() + photos_per_page - 1) / photos_per_page;

    for page_num in 0..total_pages {
        let (page, layer_idx) = doc.add_page(
            Mm(PAGE_W),
            Mm(PAGE_H),
            &format!("Page {}", page_num + 1),
        );
        let layer = doc.get_page(page).get_layer(layer_idx);

        let start = page_num * photos_per_page;
        let end = (start + photos_per_page).min(photos.len());

        for (i, pi) in (start..end).enumerate() {
            let col = i % COLS;
            let row = i / COLS;

            let x = offset_x + col as f32 * (PHOTO_W + GAP);
            let y = PAGE_H - MARGIN - (row as f32 + 1.0) * PHOTO_H - row as f32 * GAP;

            place_image(&layer, &photos[pi], x, y);
        }
    }

    let exported = photos.len();
    let file =
        fs::File::create(output_path).map_err(|e| format!("Failed to create PDF file: {}", e))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer).map_err(|e| format!("Failed to save PDF: {}", e))?;

    Ok((exported, skipped))
}
