//! qxp-web daemon library — exposes the axum + yerpc bridge as a callable
//! function so embedders (e.g. the Tauri desktop shell at `web/desktop/`)
//! can spawn the daemon in-process instead of going through the binary.
//!
//! The binary at `src/main.rs` is now a thin wrapper that parses CLI flags
//! and delegates to [`run`].

pub mod file;
pub mod upload;
pub mod ws;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result};
use axum::Router;
use axum::http::{HeaderValue, Method, header::CONTENT_TYPE};
use axum::routing::{get, post};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
pub struct AppState {
    pub api: deltachat_jsonrpc::api::CommandApi,
    pub uploads_dir: Arc<PathBuf>,
    pub accounts_dir: Arc<PathBuf>,
}

/// Configuration for [`run`].
#[derive(Clone, Debug)]
pub struct DaemonConfig {
    /// Address to bind. Use `127.0.0.1:0` to let the OS pick a free port.
    pub listen: SocketAddr,
    /// Where account databases live; created if absent.
    pub accounts_dir: PathBuf,
}

/// Open the daemon's accounts dir, build the axum router, bind the listener,
/// and serve it until the future completes (typically: ctrl-c, or the
/// in-process spawn task panics). On graceful shutdown deltachat IO is
/// stopped so we don't leave half-flushed databases behind.
pub async fn run(config: DaemonConfig) -> Result<()> {
    tracing::info!(accounts_dir = %config.accounts_dir.display(), "opening accounts");
    let accounts = deltachat_jsonrpc::api::Accounts::new(config.accounts_dir.clone(), true)
        .await
        .with_context(|| {
            format!("failed to open accounts at {}", config.accounts_dir.display())
        })?;
    let accounts = Arc::new(RwLock::new(accounts));
    let api = deltachat_jsonrpc::api::CommandApi::from_arc(accounts.clone()).await;

    let uploads_dir = Arc::new(config.accounts_dir.join("_uploads"));
    tokio::fs::create_dir_all(uploads_dir.as_ref())
        .await
        .with_context(|| format!("failed to create uploads dir {}", uploads_dir.display()))?;

    let accounts_dir = Arc::new(config.accounts_dir.clone());

    // The packaged Tauri app loads the SPA from a custom-scheme origin
    // (`tauri://localhost`, or `http://tauri.localhost` on Windows) while the
    // daemon listens on loopback `127.0.0.1:4041`. Every `fetch` to `/upload`
    // is therefore cross-origin and triggers a CORS preflight. Dev builds
    // dodge this — Vite proxies `/upload` same-origin — but the bundled app
    // talks to the daemon directly, so without these headers the preflight
    // fails and attachment / vCard uploads silently break.
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("tauri://localhost"),
            HeaderValue::from_static("http://tauri.localhost"),
        ])
        .allow_methods([Method::GET, Method::POST, Method::DELETE])
        .allow_headers([CONTENT_TYPE]);

    let app = Router::new()
        .route("/ws", get(ws::handler))
        .route("/upload", post(upload::handler))
        .route("/file", get(file::handler).delete(file::delete_handler))
        .layer(cors)
        .with_state(AppState {
            api,
            uploads_dir,
            accounts_dir,
        });

    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    let addr = listener.local_addr()?;
    tracing::info!("listening on http://{addr}  (websocket: ws://{addr}/ws)");

    let accounts_for_shutdown = accounts.clone();
    let serve = tokio::spawn(async move {
        let result = axum::serve(listener, app).await;
        tracing::info!("stopping IO before shutdown");
        accounts_for_shutdown.read().await.stop_io().await;
        result.context("axum server error")
    });

    tokio::select! {
        result = serve => result.context("daemon task panicked")?,
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("ctrl-c received, shutting down");
            Ok(())
        }
    }
}
