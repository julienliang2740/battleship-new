use crate::api::errors::{ApiError, ApiErrorCode, ApiResult};
use crate::config::{BOARD_SIZE, FLEET_ORDER};
use crate::models::{build_fleet, Ship};
use crate::shared::{
    GameEvent, GamePhase, Orientation, PlacementProgress, PlayerSide, ShipActionRequest, ShipKind,
};

use super::actions::{execute, validate, ActionCtx};
use super::board::Board;
use super::coords::{row_col, ship_cells};
use super::rng::Rng;

/// Aggregate root: owns the two boards, the rng, the phase, and the
/// placement progress.
pub struct Game {
    pub id: String,
    pub rng: Rng,
    pub human_board: Board,
    pub ai_board: Board,
    pub placement: PlacementProgress,
    pub phase: GamePhase,
    pub active_player: PlayerSide,
    pub winner: Option<PlayerSide>,
}

impl Game {
    pub fn new(id: String, rng: Rng) -> Self {
        Self {
            id,
            rng,
            human_board: Board::new(BOARD_SIZE, PlayerSide::Human, build_fleet(PlayerSide::Human)),
            ai_board: Board::new(BOARD_SIZE, PlayerSide::Ai, build_fleet(PlayerSide::Ai)),
            placement: PlacementProgress {
                order: FLEET_ORDER.to_vec(),
                next_index: 0,
            },
            phase: GamePhase::Placement,
            active_player: PlayerSide::Human,
            winner: None,
        }
    }

    pub fn board_for(&self, side: PlayerSide) -> &Board {
        match side {
            PlayerSide::Human => &self.human_board,
            PlayerSide::Ai => &self.ai_board,
        }
    }

    pub fn enemy_board_for(&self, side: PlayerSide) -> &Board {
        match side {
            PlayerSide::Human => &self.ai_board,
            PlayerSide::Ai => &self.human_board,
        }
    }

    pub fn board_for_mut(&mut self, side: PlayerSide) -> &mut Board {
        match side {
            PlayerSide::Human => &mut self.human_board,
            PlayerSide::Ai => &mut self.ai_board,
        }
    }

    pub fn ship_idx_for(&self, side: PlayerSide, ship_id: &str) -> Option<usize> {
        self.board_for(side).find_ship_idx_by_id(ship_id)
    }

    // ----- Placement ------------------------------------------------------

    pub fn place_human_ship(
        &mut self,
        kind: ShipKind,
        anchor: u32,
        orientation: Orientation,
    ) -> ApiResult<()> {
        if self.phase != GamePhase::Placement {
            return Err(ApiError::new(
                ApiErrorCode::WrongPhase,
                "Ships can only be placed in the placement phase.",
            ));
        }
        let expected = self.placement.order[self.placement.next_index as usize];
        if kind != expected {
            return Err(ApiError::new(
                ApiErrorCode::InvalidPlace,
                format!("Expected to place {:?} next, got {:?}.", expected, kind),
            ));
        }
        let Some(idx) = self.human_board.find_ship_idx_by_kind(kind) else {
            return Err(ApiError::new(
                ApiErrorCode::Internal,
                format!("No ship of kind {:?} on human board.", kind),
            ));
        };
        self.human_board
            .place_ship(idx, anchor, orientation)
            .map_err(|e| ApiError::new(ApiErrorCode::InvalidPlace, e))?;
        self.placement.next_index += 1;
        if self.placement.next_index as usize >= self.placement.order.len() {
            self.phase = GamePhase::Playing;
            self.active_player = PlayerSide::Human;
            self.reset_quotas_for(PlayerSide::Human);
        }
        Ok(())
    }

    pub fn place_human_random(&mut self) -> ApiResult<()> {
        if self.phase != GamePhase::Placement {
            return Err(ApiError::new(
                ApiErrorCode::WrongPhase,
                "Random placement only allowed in placement phase.",
            ));
        }
        self.human_board.clear_all_ships();
        self.placement.next_index = 0;
        auto_place_fleet(&mut self.human_board, &mut self.rng);
        self.placement.next_index = self.placement.order.len() as u32;
        self.phase = GamePhase::Playing;
        self.active_player = PlayerSide::Human;
        self.reset_quotas_for(PlayerSide::Human);
        Ok(())
    }

    pub fn reset_human_placement(&mut self) -> ApiResult<()> {
        if self.phase != GamePhase::Placement {
            return Err(ApiError::new(
                ApiErrorCode::WrongPhase,
                "Cannot reset placement once playing.",
            ));
        }
        self.human_board.clear_all_ships();
        self.placement.next_index = 0;
        Ok(())
    }

    // ----- Action application -------------------------------------------

    pub fn apply_human_action(&mut self, req: &ShipActionRequest) -> ApiResult<Vec<GameEvent>> {
        if self.phase == GamePhase::Gameover {
            return Err(ApiError::new(ApiErrorCode::GameOver, "Game has ended."));
        }
        if self.phase != GamePhase::Playing {
            return Err(ApiError::new(
                ApiErrorCode::WrongPhase,
                "Actions are only allowed during play.",
            ));
        }
        if self.active_player != PlayerSide::Human {
            return Err(ApiError::new(
                ApiErrorCode::NotYourTurn,
                "It is not your turn.",
            ));
        }
        self.apply_action(PlayerSide::Human, req)
    }

    /// Internal action application. Used by both human actions and the AI.
    pub fn apply_action(
        &mut self,
        side: PlayerSide,
        req: &ShipActionRequest,
    ) -> ApiResult<Vec<GameEvent>> {
        let ship_idx = self.ship_idx_for(side, &req.ship_id).ok_or_else(|| {
            ApiError::new(
                ApiErrorCode::InvalidAction,
                format!("Unknown ship {}.", req.ship_id),
            )
        })?;
        // Pre-checks on a shared ref before splitting borrows.
        {
            let ship: &Ship = &self.board_for(side).ships[ship_idx];
            if ship.side != side {
                return Err(ApiError::new(
                    ApiErrorCode::InvalidAction,
                    "That ship is not yours.",
                ));
            }
            if ship.sunk() {
                return Err(ApiError::new(
                    ApiErrorCode::InvalidAction,
                    format!("{} is sunk and cannot act.", ship.name()),
                ));
            }
            if !ship.supported_actions().contains(&req.kind) {
                return Err(ApiError::new(
                    ApiErrorCode::InvalidAction,
                    format!("{} does not support action {:?}.", ship.name(), req.kind),
                ));
            }
            if !ship.has_quota(req.kind) {
                return Err(ApiError::new(
                    ApiErrorCode::NoQuota,
                    format!(
                        "{} cannot perform {:?} this turn.",
                        ship.name(),
                        req.kind
                    ),
                ));
            }
        }

        // Split mutable borrows of the two boards.
        let (own_board, enemy_board) = match side {
            PlayerSide::Human => {
                let (a, b) = split_boards(&mut self.human_board, &mut self.ai_board);
                (a, b)
            }
            PlayerSide::Ai => {
                let (b, a) = split_boards(&mut self.human_board, &mut self.ai_board);
                (a, b)
            }
        };

        let mut ctx = ActionCtx {
            side,
            ship_idx,
            own_board,
            enemy_board,
            request: req,
        };
        validate(req.kind, &ctx)?;
        let mut events = execute(req.kind, &mut ctx)?;

        // Check for game-over.
        let enemy_all_sunk = self.enemy_board_for(side).all_ships_sunk();
        if enemy_all_sunk {
            self.phase = GamePhase::Gameover;
            self.winner = Some(side);
            events.push(GameEvent::GameOver { winner: side });
        }
        Ok(events)
    }

    pub fn end_human_turn_transition(&mut self) -> ApiResult<Vec<GameEvent>> {
        if self.phase != GamePhase::Playing {
            return Err(ApiError::new(
                ApiErrorCode::WrongPhase,
                "Cannot end turn outside of play.",
            ));
        }
        if self.active_player != PlayerSide::Human {
            return Err(ApiError::new(
                ApiErrorCode::NotYourTurn,
                "Only the active human turn may be ended this way.",
            ));
        }
        self.reset_quotas_for(PlayerSide::Human);
        self.active_player = PlayerSide::Ai;
        self.reset_quotas_for(PlayerSide::Ai);
        Ok(vec![GameEvent::TurnStarted {
            player: PlayerSide::Ai,
        }])
    }

    pub fn finish_ai_turn_if_done(&mut self) -> Vec<GameEvent> {
        if self.phase != GamePhase::Playing {
            return Vec::new();
        }
        if self.active_player != PlayerSide::Ai {
            return Vec::new();
        }
        if self.ai_has_actions_left() {
            return Vec::new();
        }
        self.active_player = PlayerSide::Human;
        self.reset_quotas_for(PlayerSide::Human);
        vec![GameEvent::TurnStarted {
            player: PlayerSide::Human,
        }]
    }

    pub fn reset_quotas_for(&mut self, side: PlayerSide) {
        for s in &mut self.board_for_mut(side).ships {
            s.reset_quotas();
        }
    }

    pub fn is_over(&self) -> bool {
        self.phase == GamePhase::Gameover
    }

    pub fn human_has_actions_left(&self) -> bool {
        self.human_board
            .ships
            .iter()
            .any(|s| !s.sunk() && s.total_actions_left() > 0)
    }

    pub fn ai_has_actions_left(&self) -> bool {
        self.ai_board
            .ships
            .iter()
            .any(|s| !s.sunk() && s.total_actions_left() > 0)
    }
}

fn split_boards<'a>(a: &'a mut Board, b: &'a mut Board) -> (&'a mut Board, &'a mut Board) {
    (a, b)
}

/// Random rejection-sampling placement. Iterative outer retry loop to avoid
/// recursion (the TS version recurses on failure).
pub fn auto_place_fleet(board: &mut Board, rng: &mut Rng) {
    'retry: loop {
        board.clear_all_ships();
        let n = board.ships.len();
        for i in 0..n {
            let length = board.ships[i].length();
            let size = board.size;
            let mut placed = false;
            for _ in 0..500 {
                let orientation = if rng.next_float() < 0.5 {
                    Orientation::Horizontal
                } else {
                    Orientation::Vertical
                };
                let r = rng.next_int(size) as i32;
                let c = rng.next_int(size) as i32;
                let Some(cells) = ship_cells(r, c, length, orientation, size) else {
                    continue;
                };
                if !board.can_place_cells(&cells, Some(i)) {
                    continue;
                }
                let (anchor_row, anchor_col) = row_col(cells[0], size);
                let _ = (anchor_row, anchor_col);
                if board.place_ship(i, cells[0], orientation).is_ok() {
                    placed = true;
                    break;
                }
            }
            if !placed {
                continue 'retry;
            }
        }
        break;
    }
}
