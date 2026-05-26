use crate::core::game::Game;
use crate::core::rng::Rng;
use crate::shared::{ActionKind, GameEvent, ShipKind};

use super::placement::place_ai_fleet;
use super::policy::{pick_attack_action, pick_submarine_action};
use super::targeting::Targeter;

const SHIP_ORDER: [ShipKind; 5] = [
    ShipKind::Battleship,
    ShipKind::AircraftCarrier,
    ShipKind::Cruiser,
    ShipKind::Frigate,
    ShipKind::Submarine,
];

pub struct AIOpponent;

impl AIOpponent {
    pub fn place_fleet(game: &mut Game, rng: &mut Rng) {
        place_ai_fleet(&mut game.ai_board, rng);
    }

    /// Pick the next alive AI ship index (in ai_board.ships) that still has
    /// actions, in canonical order.
    fn next_ship_idx(game: &Game) -> Option<usize> {
        for kind in SHIP_ORDER.iter().copied() {
            if let Some(idx) = game.ai_board.ships.iter().position(|x| x.kind() == kind) {
                let s = &game.ai_board.ships[idx];
                if s.sunk() {
                    continue;
                }
                if s.total_actions_left() == 0 {
                    continue;
                }
                return Some(idx);
            }
        }
        None
    }

    /// Execute exactly one AI action.
    pub fn step_once(game: &mut Game) -> Vec<GameEvent> {
        if game.is_over() {
            return Vec::new();
        }
        let Some(ship_idx) = Self::next_ship_idx(game) else {
            return Vec::new();
        };
        let kind = game.ai_board.ships[ship_idx].kind();

        let targeter = Targeter::new(game.human_board.to_enemy_view());
        let req = if kind == ShipKind::Submarine {
            let sub = &game.ai_board.ships[ship_idx];
            pick_submarine_action(game, sub, &targeter)
        } else {
            let ship = &game.ai_board.ships[ship_idx];
            pick_attack_action(ship, &targeter)
        };

        let Some(req) = req else {
            // Defensively zero quotas.
            game.ai_board.ships[ship_idx].quotas.clear();
            return Vec::new();
        };

        match game.apply_action(crate::shared::PlayerSide::Ai, &req) {
            Ok(events) => events,
            Err(_) => {
                let req_kind: ActionKind = req.kind;
                if game.ai_board.ships[ship_idx]
                    .consume_quota(req_kind)
                    .is_err()
                {
                    game.ai_board.ships[ship_idx].quotas.clear();
                }
                Vec::new()
            }
        }
    }
}
