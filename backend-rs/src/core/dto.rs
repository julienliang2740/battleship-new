use crate::shared::{GameStateDTO, PlayerSide};

use super::game::Game;

/// Project a Game to a serializable DTO from the requested viewer's perspective.
pub fn to_game_state_dto(game: &Game, viewer: PlayerSide) -> GameStateDTO {
    let own = game.board_for(viewer);
    let enemy = game.enemy_board_for(viewer);
    let mut dto = GameStateDTO {
        game_id: game.id.clone(),
        phase: game.phase,
        active_player: game.active_player,
        you: own.to_owner_view(),
        enemy: enemy.to_enemy_view(),
        placement: None,
        winner: game.winner,
    };
    if matches!(game.phase, crate::shared::GamePhase::Placement) && viewer == PlayerSide::Human {
        dto.placement = Some(crate::shared::PlacementProgress {
            order: game.placement.order.clone(),
            next_index: game.placement.next_index,
        });
    }
    dto
}
