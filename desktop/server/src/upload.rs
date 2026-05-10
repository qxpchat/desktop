//! `POST /upload` — streams a request body to a temp file under
//! `<accounts_dir>/_uploads/` and returns the absolute path. Used by the
//! frontend to hand binary blobs (e.g. `.tar` backups, attachments) to the
//! daemon without base64-encoding through JSON-RPC.
//!
//! Query params:
//!   `?ext=<sanitized-ascii-alphanumeric>` — file extension on the temp file.
//!   Optional; defaults to `upload`.

use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    Json,
    body::Body,
    extract::{Query, State},
    http::StatusCode,
};
use futures_lite::stream::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct UploadParams {
    #[serde(default)]
    ext: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub path: String,
}

pub async fn handler(
    State(state): State<AppState>,
    Query(params): Query<UploadParams>,
    body: Body,
) -> Result<Json<UploadResponse>, (StatusCode, String)> {
    tokio::fs::create_dir_all(state.uploads_dir.as_ref())
        .await
        .map_err(io)?;

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    let safe_ext: String = params
        .ext
        .as_deref()
        .unwrap_or("upload")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    let ext = if safe_ext.is_empty() {
        "upload".to_owned()
    } else {
        safe_ext
    };

    let filename = format!("qxp-upload-{nanos}.{ext}");
    let path = state.uploads_dir.join(filename);

    let mut file = tokio::fs::File::create(&path).await.map_err(io)?;
    let mut stream = body.into_data_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
        file.write_all(&chunk).await.map_err(io)?;
    }
    file.flush().await.map_err(io)?;

    tracing::info!(path = %path.display(), "upload received");

    Ok(Json(UploadResponse {
        path: path.to_string_lossy().into_owned(),
    }))
}

fn io(err: std::io::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}
