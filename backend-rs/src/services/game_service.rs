use uuid::Uuid;

use crate::ai::AIOpponent;
use crate::api::errors::{ApiError, ApiErrorCode, ApiResult};
use crate::core::dto::to_game_state_dto;
use crate::core::game::Game;
use crate::core::rng::Rng;
use crate::shared::{
    ActionRequest, GameEvent, GameStateDTO, Orientation, PlayerSide, ShipKind,
};

use super::store::GameStore;

/// Use-case layer. Controllers only call methods on this class.
#[derive(Clone)]
pub struct GameService {
    pub store: GameStore,
}

impl GameService {
    pub fn new(store: GameStore) -> Self {
        Self { store }
    }

    // ----- Lifecycle ----------------------------------------------------

    pub fn create_game(&self, seed: Option<u32>) -> GameStateDTO {
        let mut rng = match seed {
            Some(s) => Rng::new(s),
            None => Rng::random(),
        };
        let id = Uuid::new_v4().to_string();
        let mut game = Game::new(id, rng.clone());
        // Place the AI fleet using a clone of the RNG; advance the game's
        // canonical RNG to match so subsequent random ops are deterministic
        // given a seed (mirrors the TS code, which shares one Rng instance).
        AIOpponent::place_fleet(&mut game, &mut rng);
        game.rng = rng;
        let state = to_game_state_dto(&game, PlayerSide::Human);
        self.store.create(game);
        state
    }

    pub fn get_view(&self, id: &str) -> ApiResult<GameStateDTO> {
        let g = self.require_game(id)?;
        let g = g.lock();
        Ok(to_game_state_dto(&g, PlayerSide::Human))
    }

    pub fn delete_game(&self, id: &str) {
        self.store.delete(id);
    }

    // ----- Placement ----------------------------------------------------

    pub fn place_ship(
        &self,
        id: &str,
        kind: ShipKind,
        anchor: u32,
        orientation: Orientation,
    ) -> ApiResult<GameStateDTO> {
        let g = self.require_game(id)?;
        let mut g = g.lock();
        g.place_human_ship(kind, anchor, orientation)?;
        Ok(to_game_state_dto(&g, PlayerSide::Human))
    }

    pub fn place_random(&self, id: &str) -> ApiResult<GameStateDTO> {
        let g = self.require_game(id)?;
        let mut g = g.lock();
        g.place_human_random()?;
        Ok(to_game_state_dto(&g, PlayerSide::Human))
    }

    pub fn reset_placement(&self, id: &str) -> ApiResult<GameStateDTO> {
        let g = self.require_game(id)?;
        let mut g = g.lock();
        g.reset_human_placement()?;
        Ok(to_game_state_dto(&g, PlayerSide::Human))
    }

    // ----- Play ---------------------------------------------------------

    pub fn apply_action(
        &self,
        id: &str,
        req: ActionRequest,
    ) -> ApiResult<(GameStateDTO, Vec<GameEvent>)> {
        let g = self.require_game(id)?;
        let mut g = g.lock();
        if g.is_over() {
            return Err(ApiError::new(ApiErrorCode::GameOver, "Game has ended."));
        }
        if g.phase != crate::shared::GamePhase::Playing {
            return Err(ApiError::new(
                ApiErrorCode::WrongPhase,
                "Actions only allowed during play.",
            ));
        }

        let events: Vec<GameEvent> = match req {
            ActionRequest::EndTurn => g.end_human_turn_transition()?,
            ActionRequest::Ship(ship_req) => {
                let mut ev = g.apply_human_action(&ship_req)?;
                if !g.is_over()
                    && g.active_player == PlayerSide::Human
                    && !g.human_has_actions_left()
                {
                    let mut more = g.end_human_turn_transition()?;
                    ev.append(&mut more);
                }
                ev
            }
        };
        let state = to_game_state_dto(&g, PlayerSide::Human);
        Ok((state, events))
    }

    /// Execute a single AI action.
    pub fn ai_step(&self, id: &str) -> ApiResult<(GameStateDTO, Vec<GameEvent>, bool)> {
        let g = self.require_game(id)?;
        let mut g = g.lock();
        if g.is_over() {
            return Ok((to_game_state_dto(&g, PlayerSide::Human), Vec::new(), true));
        }
        if g.active_player != PlayerSide::Ai {
            return Ok((to_game_state_dto(&g, PlayerSide::Human), Vec::new(), true));
        }
        let step_events = AIOpponent::step_once(&mut g);
        let finish_events = g.finish_ai_turn_if_done();
        let ai_done = g.active_player != PlayerSide::Ai || g.is_over();
        let mut events = step_events;
        events.extend(finish_events);
        Ok((to_game_state_dto(&g, PlayerSide::Human), events, ai_done))
    }

    // ----- helpers ------------------------------------------------------

    fn require_game(
        &self,
        id: &str,
    ) -> ApiResult<std::sync::Arc<parking_lot::Mutex<Game>>> {
        self.store.get(id).ok_or_else(|| {
            ApiError::new(ApiErrorCode::NotFound, format!("No game with id {}", id))
        })
    }
}
