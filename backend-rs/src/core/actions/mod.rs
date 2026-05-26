pub mod registry;

use crate::api::errors::{ApiError, ApiErrorCode, ApiResult};
use crate::shared::{ActionKind, Direction, GameEvent, PlayerSide, ShipActionRequest};

use super::board::Board;
use super::coords::{expand_2x2, row_col};

/// Mirrors TS ActionContext. We pass &mut Game in service code, but inside
/// action handlers we only need the active side and the ship_idx on each board.
pub struct ActionCtx<'a> {
    pub side: PlayerSide,
    /// Index into own_board.ships of the ship taking the action.
    pub ship_idx: usize,
    pub own_board: &'a mut Board,
    pub enemy_board: &'a mut Board,
    pub request: &'a ShipActionRequest,
}

pub fn validate(kind: ActionKind, ctx: &ActionCtx<'_>) -> ApiResult<()> {
    match kind {
        ActionKind::SingleHit => validate_single_hit(ctx),
        ActionKind::AreaHit2x2 => validate_area_hit(ctx),
        ActionKind::Move1 => validate_move(ctx),
        ActionKind::Rotate90 => Ok(()),
    }
}

pub fn execute(kind: ActionKind, ctx: &mut ActionCtx<'_>) -> ApiResult<Vec<GameEvent>> {
    match kind {
        ActionKind::SingleHit => execute_single_hit(ctx),
        ActionKind::AreaHit2x2 => execute_area_hit(ctx),
        ActionKind::Move1 => execute_move(ctx),
        ActionKind::Rotate90 => execute_rotate(ctx),
    }
}

// ---------- SINGLE_HIT ----------

fn validate_single_hit(ctx: &ActionCtx<'_>) -> ApiResult<()> {
    if ctx.request.targets.len() != 1 {
        return Err(ApiError::new(
            ApiErrorCode::InvalidTarget,
            "SINGLE_HIT expects exactly one target cell.",
        ));
    }
    let cell = ctx.request.targets[0];
    let total = ctx.enemy_board.size * ctx.enemy_board.size;
    if cell >= total {
        return Err(ApiError::new(
            ApiErrorCode::InvalidTarget,
            "Target cell out of bounds.",
        ));
    }
    let view = ctx.enemy_board.to_enemy_view();
    let k = view.cells[cell as usize];
    use crate::shared::CellKnowledge::*;
    if matches!(k, Miss | Hit | Sunk) {
        return Err(ApiError::new(
            ApiErrorCode::InvalidTarget,
            "That cell has already been attacked.",
        ));
    }
    Ok(())
}

fn execute_single_hit(ctx: &mut ActionCtx<'_>) -> ApiResult<Vec<GameEvent>> {
    let cell = ctx.request.targets[0];
    let events = ctx.enemy_board.apply_hits(&[cell], ctx.side);
    consume_ctx_quota(ctx, ActionKind::SingleHit)?;
    Ok(events)
}

// ---------- AREA_HIT_2X2 ----------

fn validate_area_hit(ctx: &ActionCtx<'_>) -> ApiResult<()> {
    if ctx.request.targets.len() != 1 {
        return Err(ApiError::new(
            ApiErrorCode::InvalidTarget,
            "AREA_HIT_2X2 expects exactly one anchor cell (top-left of 2x2).",
        ));
    }
    let anchor = ctx.request.targets[0];
    let size = ctx.enemy_board.size;
    if anchor >= size * size {
        return Err(ApiError::new(
            ApiErrorCode::InvalidTarget,
            "Anchor cell out of bounds.",
        ));
    }
    let (row, col) = row_col(anchor, size);
    if row >= (size as i32) - 1 || col >= (size as i32) - 1 {
        return Err(ApiError::new(
            ApiErrorCode::InvalidTarget,
            "The 2x2 region would extend off the board; pick an anchor with row<size-1 and col<size-1.",
        ));
    }
    let cells = expand_2x2(anchor, size);
    let view = ctx.enemy_board.to_enemy_view();
    let unattacked = cells
        .iter()
        .filter(|c| matches!(view.cells[**c as usize], crate::shared::CellKnowledge::Unknown))
        .count();
    if unattacked == 0 {
        return Err(ApiError::new(
            ApiErrorCode::InvalidTarget,
            "Every cell in that 2x2 has already been attacked.",
        ));
    }
    Ok(())
}

fn execute_area_hit(ctx: &mut ActionCtx<'_>) -> ApiResult<Vec<GameEvent>> {
    let anchor = ctx.request.targets[0];
    let cells = expand_2x2(anchor, ctx.enemy_board.size);
    let events = ctx.enemy_board.apply_hits(&cells, ctx.side);
    consume_ctx_quota(ctx, ActionKind::AreaHit2x2)?;
    Ok(events)
}

// ---------- MOVE_1 ----------

fn validate_move(ctx: &ActionCtx<'_>) -> ApiResult<()> {
    let Some(d) = ctx.request.direction else {
        return Err(ApiError::new(
            ApiErrorCode::BadRequest,
            "MOVE_1 requires a 'direction' field.",
        ));
    };
    // Type system ensures it's one of N/S/E/W.
    let _ = d;
    Ok(())
}

fn execute_move(ctx: &mut ActionCtx<'_>) -> ApiResult<Vec<GameEvent>> {
    let dir: Direction = ctx.request.direction.unwrap();
    ctx.own_board
        .move_ship(ctx.ship_idx, dir)
        .map_err(|e| ApiError::new(ApiErrorCode::InvalidTarget, e))?;
    consume_ctx_quota(ctx, ActionKind::Move1)?;
    let ship_id = ctx.own_board.ships[ctx.ship_idx].id.clone();
    Ok(vec![GameEvent::ShipMoved {
        side: ctx.side,
        ship_id,
    }])
}

// ---------- ROTATE_90 ----------

fn execute_rotate(ctx: &mut ActionCtx<'_>) -> ApiResult<Vec<GameEvent>> {
    ctx.own_board
        .rotate_ship(ctx.ship_idx)
        .map_err(|e| ApiError::new(ApiErrorCode::InvalidTarget, e))?;
    consume_ctx_quota(ctx, ActionKind::Rotate90)?;
    let ship_id = ctx.own_board.ships[ctx.ship_idx].id.clone();
    Ok(vec![GameEvent::ShipRotated {
        side: ctx.side,
        ship_id,
    }])
}

// ---------- helpers ----------

fn consume_ctx_quota(ctx: &mut ActionCtx<'_>, kind: ActionKind) -> ApiResult<()> {
    ctx.own_board.ships[ctx.ship_idx]
        .consume_quota(kind)
        .map_err(|e| ApiError::new(ApiErrorCode::Internal, e))
}
