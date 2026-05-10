//! Standalone `qxp-web` binary — parses CLI args and runs the daemon. The
//! actual server lives in the library at `lib.rs` so embedders (Tauri shell,
//! tests) can call into it directly.

use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use tracing_subscriber::EnvFilter;

use qxp_web::{run, DaemonConfig};

#[derive(Parser, Debug)]
#[command(name = "qxp-web", version)]
struct Args {
    /// Address to listen on (host:port). Use port 0 to let the OS pick.
    #[arg(long, default_value = "127.0.0.1:9090")]
    listen: SocketAddr,

    /// Path to the accounts directory. Created if absent.
    #[arg(long, default_value = "./qxp-web-accounts")]
    accounts_dir: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let args = Args::parse();
    run(DaemonConfig {
        listen: args.listen,
        accounts_dir: args.accounts_dir,
    })
    .await
}
