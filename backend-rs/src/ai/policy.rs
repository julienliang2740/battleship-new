use crate::core::coords::row_col;
use crate::core::game::Game;
use crate::models::Ship;
use crate::shared::{ActionKind, CellKnowledge, Direction, ShipActionRequest};

use super::targeting::{miss_center, Targeter};

/// Decide the next single action for a non-submarine ship.
pub fn pick_attack_action(ship: &Ship, targeter: &Targeter) -> Option<ShipActionRequest> {
    if ship.has_quota(ActionKind::SingleHit) {
        let target = targeter.best_single_target();
        if target < 0 {
            return None;
        }
        return Some(ShipActionRequest {
            ship_id: ship.id.clone(),
            kind: ActionKind::SingleHit,
            targets: vec![target as u32],
            direction: None,
        });
    }
    if ship.has_quota(ActionKind::AreaHit2x2) {
        let (anchor, _) = targeter.best_area_target();
        return Some(ShipActionRequest {
            ship_id: ship.id.clone(),
            kind: ActionKind::AreaHit2x2,
            targets: vec![anchor],
            direction: None,
        });
    }
    None
}

/// Pick a single action for the submarine: hit, move, or rotate.
pub fn pick_submarine_action(
    game: &Game,
    submarine: &Ship,
    targeter: &Targeter,
) -> Option<ShipActionRequest> {
    if !submarine.has_quota(ActionKind::SingleHit) {
        return None;
    }

    let enemy_view = game.ai_board.to_enemy_view(); // what HUMAN sees of AI
    let sub_cells = &submarine.positions;
    let mut pressure = 0;
    for cell in sub_cells {
        let (row, col) = row_col(*cell, enemy_view.size);
        for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
            let r = row + dr;
            let c = col + dc;
            if r < 0 || r >= enemy_view.size as i32 || c < 0 || c >= enemy_view.size as i32 {
                continue;
            }
            let k = enemy_view.cells[(r as u32 * enemy_view.size + c as u32) as usize];
            if matches!(k, CellKnowledge::Miss | CellKnowledge::Hit) {
                pressure += 1;
            }
        }
    }

    let damaged = !submarine.hits.is_empty();

    if (pressure >= 3 || damaged) && try_evade(game, submarine).is_some() {
        return try_evade(game, submarine);
    }

    let target = targeter.best_single_target();
    if target < 0 {
        return None;
    }
    Some(ShipActionRequest {
        ship_id: submarine.id.clone(),
        kind: ActionKind::SingleHit,
        targets: vec![target as u32],
        direction: None,
    })
}

fn try_evade(game: &Game, submarine: &Ship) -> Option<ShipActionRequest> {
    let my_view = game.ai_board.to_enemy_view();
    let center = miss_center(&my_view);
    let sub_anchor = submarine.positions[0];
    let (sr, sc) = row_col(sub_anchor, my_view.size);

    let mut candidates: Vec<Direction> = Vec::new();
    if let Some((cr, cc)) = center {
        if (sr as f64) < cr {
            candidates.push(Direction::N);
        } else {
            candidates.push(Direction::S);
        }
        if (sc as f64) < cc {
            candidates.push(Direction::W);
        } else {
            candidates.push(Direction::E);
        }
    } else {
        candidates.extend([Direction::N, Direction::E, Direction::S, Direction::W]);
    }
    for d in candidates {
        if can_move(game, submarine, d) {
            return Some(ShipActionRequest {
                ship_id: submarine.id.clone(),
                kind: ActionKind::Move1,
                targets: vec![],
                direction: Some(d),
            });
        }
    }
    if can_rotate(game, submarine) {
        return Some(ShipActionRequest {
            ship_id: submarine.id.clone(),
            kind: ActionKind::Rotate90,
            targets: vec![],
            direction: None,
        });
    }
    None
}

fn can_move(game: &Game, submarine: &Ship, dir: Direction) -> bool {
    let size = game.ai_board.size;
    let offset: i32 = match dir {
        Direction::N => -(size as i32),
        Direction::S => size as i32,
        Direction::W => -1,
        Direction::E => 1,
    };
    let new_cells: Vec<i32> = submarine
        .positions
        .iter()
        .map(|c| (*c as i32) + offset)
        .collect();

    for (i, _) in submarine.positions.iter().enumerate() {
        if new_cells[i] < 0 || (new_cells[i] as u32) >= size * size {
            return false;
        }
        let (old_r, old_c) = row_col(submarine.positions[i], size);
        let (new_r, new_c) = row_col(new_cells[i] as u32, size);
        if matches!(dir, Direction::E | Direction::W) {
            if old_r != new_r {
                return false;
            }
            if new_c < 0 || new_c >= size as i32 {
                return false;
            }
        }
        if matches!(dir, Direction::N | Direction::S) {
            if old_c != new_c {
                return false;
            }
            if new_r < 0 || new_r >= size as i32 {
                return false;
            }
        }
    }
    let sub_idx = game
        .ai_board
        .ships
        .iter()
        .position(|s| s.id == submarine.id);
    let new_cells_u32: Vec<u32> = new_cells.iter().map(|c| *c as u32).collect();
    if !game.ai_board.can_place_cells(&new_cells_u32, sub_idx) {
        return false;
    }
    for c in &new_cells_u32 {
        let k = game.ai_board.cells[*c as usize];
        if matches!(
            k,
            CellKnowledge::Miss | CellKnowledge::Hit | CellKnowledge::Sunk
        ) {
            return false;
        }
    }
    true
}

fn can_rotate(game: &Game, submarine: &Ship) -> bool {
    let anchor = submarine.positions[0];
    let size = game.ai_board.size;
    let new_orient = match submarine.orientation {
        crate::shared::Orientation::Horizontal => crate::shared::Orientation::Vertical,
        crate::shared::Orientation::Vertical => crate::shared::Orientation::Horizontal,
    };
    let mut cells: Vec<u32> = Vec::new();
    for i in 0..(submarine.length() as i32) {
        let (row, col) = row_col(anchor, size);
        let (r, c) = match new_orient {
            crate::shared::Orientation::Horizontal => (row, col + i),
            crate::shared::Orientation::Vertical => (row + i, col),
        };
        if r < 0 || r >= size as i32 || c < 0 || c >= size as i32 {
            return false;
        }
        cells.push((r as u32) * size + (c as u32));
    }
    let sub_idx = game
        .ai_board
        .ships
        .iter()
        .position(|s| s.id == submarine.id);
    if !game.ai_board.can_place_cells(&cells, sub_idx) {
        return false;
    }
    for i in 1..cells.len() {
        let k = game.ai_board.cells[cells[i] as usize];
        if matches!(
            k,
            CellKnowledge::Miss | CellKnowledge::Hit | CellKnowledge::Sunk
        ) {
            return false;
        }
    }
    true
}
