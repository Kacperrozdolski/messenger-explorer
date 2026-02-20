/// Fix Facebook's mojibake encoding.
///
/// Facebook exports UTF-8 text encoded as Latin-1 codepoints.
/// E.g. the Polish character ł (U+0142, UTF-8 bytes C5 82) becomes "\u{00C5}\u{0082}".
/// We reverse this by collecting each char as a byte and reinterpreting as UTF-8.
pub fn fix_mojibake(input: &str) -> String {
    // If all characters fit in a single byte (0x00-0xFF), they might be mojibake
    if input.chars().all(|c| (c as u32) <= 0xFF) {
        let bytes: Vec<u8> = input.chars().map(|c| c as u8).collect();
        match String::from_utf8(bytes) {
            Ok(fixed) if fixed != input => fixed,
            _ => input.to_string(),
        }
    } else {
        input.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fix_polish_chars() {
        // "ł" in mojibake: \u00c5\u0082
        let mojibake = "\u{00C5}\u{0082}";
        assert_eq!(fix_mojibake(mojibake), "ł");
    }

    #[test]
    fn test_fix_emoji() {
        // 😆 = U+1F606, UTF-8: F0 9F 98 86
        let mojibake = "\u{00F0}\u{009F}\u{0098}\u{0086}";
        assert_eq!(fix_mojibake(mojibake), "😆");
    }

    #[test]
    fn test_plain_ascii_unchanged() {
        assert_eq!(fix_mojibake("hello world"), "hello world");
    }

    #[test]
    fn test_mixed_polish_text() {
        // "Rafał Brzeziński" in mojibake
        let mojibake = "Rafa\u{00C5}\u{0082} Brzezi\u{00C5}\u{0084}ski";
        assert_eq!(fix_mojibake(mojibake), "Rafał Brzeziński");
    }
}
