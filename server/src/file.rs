//! `GET /file?path=<absolute-path>` — streams a file from disk.
//! `DELETE /file?path=<absolute-path>` — removes a file from disk. Used by
//! the GIF cache cleanup flow to drop a cached `.gif` when the user deletes
//! it from the recents panel.
//!
//! Used by the frontend to display avatars / image attachments / files /
//! voice notes whose paths come back as daemon-side filesystem paths from
//! `deltachat-jsonrpc` (e.g. `MessageObject.file`, `Contact.profile_image`).
//!
//! Safety: only paths that resolve under the daemon's accounts directory
//! (`AppState.accounts_dir`) are served. This prevents the route from being
//! used as an arbitrary-read primitive.

use std::path::Path;

use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, HeaderValue, StatusCode},
    response::Response,
};
use serde::Deserialize;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct FileParams {
    path: String,
}

pub async fn handler(
    State(state): State<AppState>,
    Query(params): Query<FileParams>,
) -> Result<Response, (StatusCode, String)> {
    let req_path = Path::new(&params.path);
    let canonical_req = tokio::fs::canonicalize(req_path)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
    let canonical_root = tokio::fs::canonicalize(state.accounts_dir.as_ref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if !canonical_req.starts_with(&canonical_root) {
        return Err((
            StatusCode::FORBIDDEN,
            "path outside accounts directory".into(),
        ));
    }

    let file = File::open(&canonical_req)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
    let metadata = file
        .metadata()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mime = mime_for(&canonical_req);
    let mut response = Response::new(Body::from_stream(ReaderStream::new(file)));
    let headers = response.headers_mut();
    if let Ok(ct) = HeaderValue::from_str(mime) {
        headers.insert(header::CONTENT_TYPE, ct);
    }
    if let Ok(cl) = HeaderValue::from_str(&metadata.len().to_string()) {
        headers.insert(header::CONTENT_LENGTH, cl);
    }
    // Browser cache is fine — paths never change content (deltachat blobs are
    // content-addressed).
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=31536000, immutable"),
    );

    Ok(response)
}

pub async fn delete_handler(
    State(state): State<AppState>,
    Query(params): Query<FileParams>,
) -> Result<StatusCode, (StatusCode, String)> {
    let req_path = Path::new(&params.path);
    let canonical_req = tokio::fs::canonicalize(req_path)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
    let canonical_root = tokio::fs::canonicalize(state.accounts_dir.as_ref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if !canonical_req.starts_with(&canonical_root) {
        return Err((
            StatusCode::FORBIDDEN,
            "path outside accounts directory".into(),
        ));
    }
    tokio::fs::remove_file(&canonical_req)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mp3") => "audio/mpeg",
        Some("ogg" | "oga") => "audio/ogg",
        Some("opus") => "audio/ogg; codecs=opus",
        Some("m4a") => "audio/mp4",
        Some("wav") => "audio/wav",
        Some("pdf") => "application/pdf",
        Some("vcf") => "text/vcard",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}
