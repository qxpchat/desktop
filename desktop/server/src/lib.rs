//! qxp-web daemon library — exposes the axum + yerpc bridge as a callable
//! function so embedders (e.g. the Tauri desktop shell at `web/desktop/`)
//! can spawn the daemon in-process instead of going through the binary.
//!
//! The binary at `src/main.rs` is now a thin wrapper that parses CLI flags
//! and delegates to [`run`].

pub mod assets;
pub mod file;
pub mod rpc;
pub mod upload;
pub mod ws;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result};
use axum::Router;
use axum::routing::{get, post};
use tokio::sync::RwLock;

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

/// What [`bind`] returns: the bound socket address (useful when the caller
/// asked for port 0) plus a future that runs the server until stopped.
pub struct BoundDaemon {
    pub addr: SocketAddr,
    pub serve: tokio::task::JoinHandle<Result<()>>,
}

/// Open the daemon's accounts dir, build the axum router, bind a socket, and
/// return immediately with a JoinHandle that drives the server. The handle
/// resolves when the server stops (via `serve.abort()` or process exit).
///
/// Embedders typically call this from a Tokio runtime, then either await
/// the handle directly or hold it for the lifetime of the embedding app.
pub async fn bind(config: DaemonConfig) -> Result<BoundDaemon> {
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

    let app = Router::new()
        .route("/", get(index))
        .route("/ws", get(ws::handler))
        .route("/upload", post(upload::handler))
        .route("/file", get(file::handler))
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
        // On shutdown, gracefully stop deltachat IO so we don't leave
        // half-flushed databases behind.
        tracing::info!("stopping IO before shutdown");
        accounts_for_shutdown.read().await.stop_io().await;
        result.context("axum server error")
    });

    Ok(BoundDaemon { addr, serve })
}

/// Run the daemon in the foreground until the future completes
/// (typically: ctrl-c, or the JoinHandle resolves). Used by the standalone
/// binary; Tauri callers prefer [`bind`] so they can hold a handle.
pub async fn run(config: DaemonConfig) -> Result<()> {
    let bound = bind(config).await?;
    tokio::select! {
        result = bound.serve => result.context("daemon task panicked")?,
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("ctrl-c received, shutting down");
            Ok(())
        }
    }
}

async fn index() -> axum::response::Html<&'static str> {
    axum::response::Html(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><title>qxp-web</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.5}code{background:#f3f3f3;padding:.1em .3em;border-radius:.2em}</style>
</head><body>
<h1>qxp-web</h1>
<p>The Rust daemon is running. The SPA isn't served from here yet — start the Vite dev server in <code>web/frontend</code> and open <code>http://localhost:4040</code>.</p>
<p>WebSocket endpoint: <code>/ws</code> (JSON-RPC 2.0).</p>
</body></html>"#,
    )
}
