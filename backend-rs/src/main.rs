mod ai;
mod api;
mod app;
mod config;
mod core;
mod models;
mod services;
mod shared;

use std::net::SocketAddr;

use crate::app::create_app;
use crate::config::port;

#[tokio::main]
async fn main() {
    let app = create_app();
    let port = port();
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind TCP listener");
    println!("Battleship backend listening on http://localhost:{}", port);
    axum::serve(listener, app)
        .await
        .expect("server error");
}
