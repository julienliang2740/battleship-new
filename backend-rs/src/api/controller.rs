use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use serde_json::Value;

use crate::models::factory::fleet_meta;
use crate::services::GameService;
use crate::shared::{FleetMetaDTO, GameEvent, GameStateDTO};

use super::errors::ApiResult;
use super::validators::{parse_action_request, parse_create_body, parse_place_body};

#[derive(Serialize)]
pub struct StateEnvelope {
    pub state: GameStateDTO,
}

#[derive(Serialize)]
pub struct ActionEnvelope {
    pub state: GameStateDTO,
    pub events: Vec<GameEvent>,
}

#[derive(Serialize)]
pub struct AiStepEnvelope {
    pub state: GameStateDTO,
    pub events: Vec<GameEvent>,
    #[serde(rename = "aiDone")]
    pub ai_done: bool,
}

#[derive(Clone)]
pub struct AppState {
    pub service: GameService,
}

pub async fn create_game(
    State(state): State<AppState>,
    body: Option<Json<Value>>,
) -> ApiResult<(StatusCode, Json<StateEnvelope>)> {
    let body = body.map(|Json(v)| v).unwrap_or(Value::Null);
    let seed = parse_create_body(&body)?;
    let s = state.service.create_game(seed);
    Ok((StatusCode::CREATED, Json(StateEnvelope { state: s })))
}

pub async fn get_game(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<StateEnvelope>> {
    let s = state.service.get_view(&id)?;
    Ok(Json(StateEnvelope { state: s }))
}

pub async fn delete_game(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> StatusCode {
    state.service.delete_game(&id);
    StatusCode::NO_CONTENT
}

pub async fn place_ship(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> ApiResult<Json<StateEnvelope>> {
    let (kind, anchor, orientation) = parse_place_body(&body)?;
    let s = state.service.place_ship(&id, kind, anchor, orientation)?;
    Ok(Json(StateEnvelope { state: s }))
}

pub async fn place_random(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<StateEnvelope>> {
    let s = state.service.place_random(&id)?;
    Ok(Json(StateEnvelope { state: s }))
}

pub async fn reset_placement(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<StateEnvelope>> {
    let s = state.service.reset_placement(&id)?;
    Ok(Json(StateEnvelope { state: s }))
}

pub async fn post_action(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> ApiResult<Json<ActionEnvelope>> {
    let action = parse_action_request(&body)?;
    let (s, events) = state.service.apply_action(&id, action)?;
    Ok(Json(ActionEnvelope { state: s, events }))
}

pub async fn ai_step(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<AiStepEnvelope>> {
    let (s, events, ai_done) = state.service.ai_step(&id)?;
    Ok(Json(AiStepEnvelope {
        state: s,
        events,
        ai_done,
    }))
}

pub async fn get_fleet_meta() -> Json<FleetMetaDTO> {
    Json(fleet_meta())
}
