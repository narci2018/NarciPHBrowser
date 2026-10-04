//! Sealing store files to the user account.
//!
//! # Why
//!
//! The stores carry secrets: proxy URLs with embedded credentials, subscription
//! URLs that are bearer tokens. Written as plain JSON they leak with the disk —
//! a cloud-synced `%APPDATA%`, a stolen laptop, a backup — and everything they
//! protect leaks with them. Sealing encrypts the file at rest so the plaintext
//! never touches the disk.
//!
//! # What it protects against, honestly
//!
//! On Windows the file is sealed with DPAPI under the current user account. It
//! defends against everything that is *not* running as that user: another
//! machine, an offline disk image, a synced or stolen copy. It does **not**
//! defend against code running inside the same session as the app — nothing
//! short of asking for a password on every launch does, and that trade is not
//! this module's to make.
//!
//! # The envelope
//!
//! A sealed file is a small JSON object (`sealed`, `format`, `data`) whose
//! `data` is the hex of the platform-sealed bytes. JSON was chosen over a raw
//! binary format so a user who opens the file sees something identifiable and
//! so the format version can be bumped the way the other store formats are.
//! Hex rather than base64 keeps the module dependency-free; the files are
//! small enough that the size difference is irrelevant.
//!
//! # Reading is tolerant, writing is current
//!
//! A file that does not parse as the envelope is read as plaintext — that is
//! every store written by an older build, and they migrate to sealed the next
//! time they save. A file sealed on Windows cannot be opened elsewhere, which
//! is reported rather than guessed at.

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

/// The current envelope format.
const SEALED_FORMAT: u32 = 1;

/// The marker distinguishing a sealed envelope from a plaintext store file.
const SEALED_MARKER: bool = true;

/// Application-specific DPAPI entropy, binding the blobs to this app.
#[cfg(windows)]
const ENTROPY: &[u8] = b"NarciPHBrowser store seal v1";

/// The on-disk envelope around sealed bytes.
#[derive(Debug, Serialize, Deserialize)]
struct SealedEnvelope {
    sealed: bool,
    format: u32,
    data: String,
}

/// Reads a store file, transparently unsealing an encrypted one.
///
/// `Ok(None)` means the file does not exist, which every store treats as "an
/// empty store" rather than an error. Bytes that are not a valid envelope come
/// back as-is, which is the migration path for plaintext files from older
/// builds.
pub fn read_store(path: &std::path::Path) -> Result<Option<Vec<u8>>> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).map_err(|source| {
        Error::environment(format!("could not read {}: {source}", path.display()))
    })?;
    match serde_json::from_slice::<SealedEnvelope>(&bytes) {
        Ok(envelope) if envelope.sealed && envelope.format == SEALED_FORMAT => {
            let data = hex_decode(&envelope.data)?;
            Ok(Some(unseal(&data)?))
        }
        Ok(envelope) if envelope.sealed && envelope.format > SEALED_FORMAT => {
            Err(Error::environment(format!(
                "{} was written by a newer version of NarciPHBrowser (seal format {}, this build \
                 understands {}); upgrade rather than letting it be rewritten",
                path.display(),
                envelope.format,
                SEALED_FORMAT
            )))
        }
        _ => Ok(Some(bytes)),
    }
}

/// Writes a store file atomically, sealed where the platform supports it.
pub fn write_store(path: &std::path::Path, bytes: &[u8]) -> Result<()> {
    let payload: Vec<u8> = match seal(bytes) {
        Ok(sealed) => {
            let envelope = SealedEnvelope {
                sealed: SEALED_MARKER,
                format: SEALED_FORMAT,
                data: hex_encode(&sealed),
            };
            serde_json::to_vec(&envelope).map_err(|source| {
                Error::environment(format!("could not serialise the seal envelope: {source}"))
            })?
        }
        // A platform without a seal writes plaintext, exactly as builds before
        // this one did. The store reads both shapes, so the files stay
        // portable even where the encryption is not.
        Err(_) => bytes.to_vec(),
    };

    // The temp file lives beside the target so the rename stays on one volume,
    // and the write lands all at once: a crash mid-save must not truncate a
    // store that was perfectly fine a second ago.
    let temp = temp_path(path);
    std::fs::write(&temp, &payload).map_err(|source| {
        Error::environment(format!("could not write {}: {source}", temp.display()))
    })?;
    std::fs::rename(&temp, path).map_err(|source| {
        Error::environment(format!("could not move {} into place: {source}", temp.display()))
    })?;
    Ok(())
}

/// The sibling temp file a sealed write lands in before it is renamed.
pub(crate) fn temp_path(path: &std::path::Path) -> std::path::PathBuf {
    let mut name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_else(|| "store.json".into());
    name.push(".tmp-seal");
    path.with_file_name(name)
}

/// Seals bytes to the current user, or reports that the platform cannot.
#[cfg(windows)]
pub fn seal(plaintext: &[u8]) -> std::result::Result<Vec<u8>, Error> {
    imp::protect(plaintext, ENTROPY)
}

/// Whether this platform has a seal implementation at all.
///
/// A UI shows this rather than guessing: where it is `false`, every store
/// file on disk is plaintext — proxy logins and subscription URLs included —
/// and the user should know that without reading this module. Where it is
/// `true`, writes are sealed; a runtime DPAPI failure still falls back to
/// plaintext, which is exactly why the envelope format keeps a marker and the
/// honest note below names the limit rather than overclaiming.
pub fn seal_available() -> bool {
    cfg!(windows)
}

/// The honest one-paragraph description of what the seal does here.
///
/// Paired with [`seal_available`] for display; the wording is the module
/// documentation condensed, not a marketing line.
pub fn seal_note() -> &'static str {
    if cfg!(windows) {
        "Files are sealed with Windows DPAPI under your user account. That \
         protects them from other machines, offline copies and synced folders; \
         it does not protect them from code running inside your session."
    } else {
        "This platform has no store sealing. Files are written as plaintext: \
         proxy logins and subscription URLs live in them unencrypted."
    }
}

/// Seals bytes, on the platforms that can.
#[cfg(not(windows))]
pub fn seal(plaintext: &[u8]) -> std::result::Result<Vec<u8>, Error> {
    let _ = plaintext;
    Err(Error::environment(
        "this platform cannot seal store files; they are written as plaintext",
    ))
}

/// Opens sealed bytes, or reports why it cannot.
#[cfg(windows)]
pub fn unseal(sealed: &[u8]) -> std::result::Result<Vec<u8>, Error> {
    imp::unprotect(sealed, ENTROPY)
}

/// Opens sealed bytes, on the platforms that can.
#[cfg(not(windows))]
pub fn unseal(sealed: &[u8]) -> std::result::Result<Vec<u8>, Error> {
    let _ = sealed;
    Err(Error::environment(
        "this file was sealed on Windows and cannot be opened on this platform",
    ))
}

/// Lowercase hex encoding, for the envelope's `data` field.
fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// The inverse of [`hex_encode`], rejecting anything else outright.
fn hex_decode(text: &str) -> Result<Vec<u8>> {
    if text.len() % 2 != 0 || !text.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(Error::identity("the seal envelope's data is not hex"));
    }
    let bytes = text
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap_or(""), 16))
        .collect::<std::result::Result<Vec<u8>, _>>()
        .map_err(|_| Error::identity("the seal envelope's data is not hex"))?;
    Ok(bytes)
}

#[cfg(windows)]
mod imp {
    use super::Error;

    /// A `CRYPTOAPI_BLOB`: a length and the bytes it covers.
    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            data_in: *const DataBlob,
            description: *const u16,
            optional_entropy: *const DataBlob,
            reserved: *mut core::ffi::c_void,
            prompt: *mut core::ffi::c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
        fn CryptUnprotectData(
            data_in: *const DataBlob,
            description: *mut *mut u16,
            optional_entropy: *const DataBlob,
            reserved: *mut core::ffi::c_void,
            prompt: *mut core::ffi::c_void,
            flags: u32,
            data_out: *mut DataBlob,
        ) -> i32;
        fn LocalFree(memory: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
    }

    /// No dialog may ever appear for a background store save.
    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    /// Seals with the user's DPAPI key and the app entropy.
    pub fn protect(plaintext: &[u8], entropy: &[u8]) -> Result<Vec<u8>, Error> {
        let input = DataBlob {
            cb_data: plaintext.len() as u32,
            pb_data: plaintext.as_ptr() as *mut u8,
        };
        let entropy = DataBlob {
            cb_data: entropy.len() as u32,
            pb_data: entropy.as_ptr() as *mut u8,
        };
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                &entropy,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(Error::environment(
                "Windows refused to seal the store (CryptProtectData failed)",
            ));
        }
        Ok(unsafe { take_blob(output) })
    }

    /// The inverse of [`protect`].
    pub fn unprotect(sealed: &[u8], entropy: &[u8]) -> Result<Vec<u8>, Error> {
        let input = DataBlob {
            cb_data: sealed.len() as u32,
            pb_data: sealed.as_ptr() as *mut u8,
        };
        let entropy = DataBlob {
            cb_data: entropy.len() as u32,
            pb_data: entropy.as_ptr() as *mut u8,
        };
        let mut output = DataBlob {
            cb_data: 0,
            pb_data: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                &entropy,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(Error::environment(
                "Windows could not unseal the store (CryptUnprotectData failed); it may have \
                 been written by another user account",
            ));
        }
        Ok(unsafe { take_blob(output) })
    }

    /// Copies a successful call's output blob out and frees the system copy.
    unsafe fn take_blob(blob: DataBlob) -> Vec<u8> {
        let bytes =
            std::slice::from_raw_parts(blob.pb_data, blob.cb_data as usize).to_vec();
        LocalFree(blob.pb_data as *mut core::ffi::c_void);
        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(windows)]
    fn sealed_bytes_round_trip() {
        let plaintext = b"{\"proxies\":[],\"format\":1}";
        let sealed = seal(plaintext).expect("sealable on windows");
        assert_ne!(sealed, plaintext, "the plaintext must not survive verbatim");
        assert_eq!(unseal(&sealed).unwrap(), plaintext);
    }

    #[test]
    #[cfg(windows)]
    fn a_seal_from_this_account_is_reusable_but_distinct_per_call() {
        let plaintext = b"same bytes";
        let first = seal(plaintext).unwrap();
        let second = seal(plaintext).unwrap();
        // DPAPI is not deterministic, so two seals differ — the unseal is the
        // identity, not the seal.
        assert_ne!(first, second);
        assert_eq!(unseal(&first).unwrap(), plaintext);
        assert_eq!(unseal(&second).unwrap(), plaintext);
    }

    #[test]
    #[cfg(windows)]
    fn entropy_binds_the_blob_to_this_app() {
        let plaintext = b"store bytes";
        let sealed = imp::protect(plaintext, ENTROPY).unwrap();
        let foreign = b"some other application's entropy";
        assert!(imp::unprotect(&sealed, foreign).is_err());
        assert_eq!(imp::unprotect(&sealed, ENTROPY).unwrap(), plaintext);
    }

    #[test]
    fn hex_round_trips_every_byte_value() {
        let all: Vec<u8> = (0..=255u8).collect();
        assert_eq!(hex_decode(&hex_encode(&all)).unwrap(), all);
    }

    #[test]
    fn hex_decode_rejects_non_hex() {
        assert!(hex_decode("not hex").is_err());
        assert!(hex_decode("abc").is_err());
    }

    #[test]
    fn a_missing_file_reads_as_none() {
        let path = std::env::temp_dir().join(format!("narci-seal-missing-{}", std::process::id()));
        assert_eq!(read_store(&path).unwrap(), None);
    }

    #[test]
    fn a_plaintext_store_file_passes_through_untouched() {
        let dir = std::env::temp_dir().join(format!("narci-seal-plain-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("store.json");
        let legacy = br#"{"format":1,"subscriptions":[]}"#;
        std::fs::write(&path, legacy).unwrap();
        assert_eq!(read_store(&path).unwrap().as_deref(), Some(&legacy[..]));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    #[cfg(windows)]
    fn a_written_store_is_sealed_at_rest_and_reads_back() {
        let dir = std::env::temp_dir().join(format!("narci-seal-round-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("store.json");
        let secret = br#"{"url":"socks5://user:hunter2@host:1080"}"#;

        write_store(&path, secret).unwrap();

        // What hit the disk must not carry the credential.
        let on_disk = std::fs::read_to_string(&path).unwrap();
        assert!(!on_disk.contains("hunter2"), "the secret leaked to disk");
        let envelope: SealedEnvelope = serde_json::from_str(&on_disk).unwrap();
        assert!(envelope.sealed);
        assert_eq!(envelope.format, SEALED_FORMAT);

        // And the store reader recovers the plaintext.
        assert_eq!(read_store(&path).unwrap().as_deref(), Some(&secret[..]));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    #[cfg(windows)]
    fn a_newer_seal_format_is_refused_rather_than_rewritten() {
        let dir = std::env::temp_dir().join(format!("narci-seal-newer-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("store.json");
        let envelope = SealedEnvelope {
            sealed: true,
            format: SEALED_FORMAT + 1,
            data: hex_encode(&[1, 2, 3]),
        };
        std::fs::write(&path, serde_json::to_vec(&envelope).unwrap()).unwrap();
        let error = read_store(&path).unwrap_err().to_string();
        assert!(error.contains("newer version"), "{error}");
        std::fs::remove_dir_all(&dir).ok();
    }
}
