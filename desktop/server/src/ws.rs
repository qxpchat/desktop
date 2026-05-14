//! WebSocket handler: bridges axum's WS frames to a yerpc `RpcSession`.

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use deltachat_jsonrpc::yerpc::{RpcClient, RpcSession};
use futures_lite::StreamExt as _;

use crate::AppState;

pub async fn handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| pump(socket, state.api))
}

async fn pump(mut socket: WebSocket, api: deltachat_jsonrpc::api::CommandApi) {
    let (client, mut out_rx) = RpcClient::new();
    let session = RpcSession::new(client, api);
    // JoinSet scoped to this connection — any per-frame handler task we
    // spawn is bounded by the connection's lifetime and gets aborted on
    // disconnect rather than racing the shared `session` against a closed
    // socket.
    let mut tasks = tokio::task::JoinSet::new();

    loop {
        tokio::select! {
            outgoing = out_rx.next() => {
                let Some(msg) = outgoing else { break };
                let text = match serde_json::to_string(&msg) {
                    Ok(t) => t,
                    Err(err) => {
                        tracing::error!("serializing rpc message: {err:#}");
                        continue;
                    }
                };
                if socket.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let session = session.clone();
                        let payload = text.as_str().to_owned();
                        tasks.spawn(async move {
                            session.handle_incoming(&payload).await;
                        });
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => continue, // ignore Binary / Ping / Pong (axum auto-handles Ping)
                    Some(Err(err)) => {
                        tracing::warn!("ws receive error: {err}");
                        break;
                    }
                }
            }
        }
    }

    tasks.shutdown().await;
    tracing::debug!("ws connection closed");
}
