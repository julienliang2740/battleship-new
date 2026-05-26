use axum::{
    routing::{delete, get, post},
    Router,
};

use super::controller::{
    ai_step, create_game, delete_game, get_fleet_meta, get_game, place_random, place_ship,
    post_action, reset_placement, AppState,
};

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/meta/fleet", get(get_fleet_meta))
        .route("/games", post(create_game))
        .route("/games/:id", get(get_game))
        .route("/games/:id", delete(delete_game))
        .route("/games/:id/place", post(place_ship))
        .route("/games/:id/place-random", post(place_random))
        .route("/games/:id/reset-placement", post(reset_placement))
        .route("/games/:id/actions", post(post_action))
        .route("/games/:id/ai-step", post(ai_step))
        .with_state(state)
}
