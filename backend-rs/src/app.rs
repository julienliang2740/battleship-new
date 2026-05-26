use axum::{routing::get, Json, Router};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

use crate::api::{build_router, AppState};
use crate::services::{GameService, GameStore};

pub fn create_app() -> Router {
    let store = GameStore::new();
    let service = GameService::new(store.clone());
    let state = AppState {
        service: service.clone(),
    };

    let api = build_router(state);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let store_for_health = store.clone();
    let health = move || {
        let store = store_for_health.clone();
        async move {
            Json(json!({ "ok": true, "games": store.size() }))
        }
    };

    Router::new()
        .route("/health", get(health))
        .nest("/api", api)
        .layer(cors)
}
