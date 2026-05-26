use std::collections::HashSet;

use crate::models::Ship;
use crate::shared::{
    BoardViewDTO, CellKnowledge, Direction, GameEvent, Orientation, PlayerSide, ShotResult,
};

use super::coords::{delta, idx, in_bounds, row_col, ship_cells};

/// A player's board. Owns:
///   - The grid of cell knowledge from THIS player's (the owner's) perspective.
///   - The ordered list of this player's ships.
pub struct Board {
    pub size: u32,
    pub side: PlayerSide,
    pub ships: Vec<Ship>,
    /// Owner's view: SHIP cells are visible; MISS/HIT/SUNK are the public truth.
    pub cells: Vec<CellKnowledge>,
}

impl Board {
    pub fn new(size: u32, side: PlayerSide, ships: Vec<Ship>) -> Self {
        Self {
            size,
            side,
            ships,
            cells: vec![CellKnowledge::Unknown; (size * size) as usize],
        }
    }

    // ----- Placement -------------------------------------------------------

    pub fn clear_all_ships(&mut self) {
        self.cells = vec![CellKnowledge::Unknown; (self.size * self.size) as usize];
        for s in &mut self.ships {
            s.positions.clear();
            s.hits.clear();
            s.orientation = Orientation::Horizontal;
            s.reset_quotas();
        }
    }

    pub fn find_ship_idx_by_id(&self, id: &str) -> Option<usize> {
        self.ships.iter().position(|s| s.id == id)
    }

    pub fn find_ship_idx_by_kind(&self, kind: crate::shared::ShipKind) -> Option<usize> {
        self.ships.iter().position(|s| s.kind() == kind)
    }

    /// Whether `ship` (by index) could be placed at the given anchor and
    /// orientation.
    pub fn can_place(
        &self,
        ship_idx: usize,
        anchor: u32,
        orientation: Orientation,
    ) -> bool {
        let ship = &self.ships[ship_idx];
        let (row, col) = row_col(anchor, self.size);
        let Some(cells) = ship_cells(row, col, ship.length(), orientation, self.size) else {
            return false;
        };
        self.can_place_cells(&cells, Some(ship_idx))
    }

    pub fn can_place_cells(&self, cells: &[u32], ignore_ship_idx: Option<usize>) -> bool {
        let mut occupied = HashSet::new();
        for (i, other) in self.ships.iter().enumerate() {
            if Some(i) == ignore_ship_idx {
                continue;
            }
            for c in &other.positions {
                occupied.insert(*c);
            }
        }
        !cells.iter().any(|c| occupied.contains(c))
    }

    /// Place ship (by index) at the given anchor. Returns Err with message on failure.
    pub fn place_ship(
        &mut self,
        ship_idx: usize,
        anchor: u32,
        orientation: Orientation,
    ) -> Result<(), String> {
        let length = self.ships[ship_idx].length();
        let (row, col) = row_col(anchor, self.size);
        let Some(cells) = ship_cells(row, col, length, orientation, self.size) else {
            return Err("Ship would go off the board".into());
        };
        if !self.can_place_cells(&cells, Some(ship_idx)) {
            return Err("Ship overlaps another".into());
        }
        for c in &cells {
            self.cells[*c as usize] = CellKnowledge::Ship;
        }
        let ship = &mut self.ships[ship_idx];
        ship.positions = cells;
        ship.orientation = orientation;
        ship.hits.clear();
        Ok(())
    }

    // ----- Submarine moves -------------------------------------------------

    /// Try to translate ship (by index) by 1 cell in `direction`.
    pub fn move_ship(&mut self, ship_idx: usize, direction: Direction) -> Result<(), String> {
        if self.ships[ship_idx].positions.is_empty() {
            return Err("Ship not placed".into());
        }
        let (dr, dc) = delta(direction);
        let size = self.size;
        let old_positions = self.ships[ship_idx].positions.clone();
        let mut new_positions = Vec::with_capacity(old_positions.len());
        for cell in &old_positions {
            let (row, col) = row_col(*cell, size);
            let nr = row + dr;
            let nc = col + dc;
            if !in_bounds(nr, nc, size) {
                return Err("Move out of bounds".into());
            }
            new_positions.push(idx(nr, nc, size));
        }
        if !self.can_place_cells(&new_positions, Some(ship_idx)) {
            return Err("Move blocked by another ship".into());
        }
        for c in &new_positions {
            if self.cells[*c as usize] != CellKnowledge::Unknown {
                return Err("Cannot move into previously attacked cell".into());
            }
        }

        // Translate hits, preserving the order of the existing hit list.
        let old_hits = self.ships[ship_idx].hits.clone();
        let mut new_hits: Vec<u32> = Vec::new();
        for h in &old_hits {
            if let Some(i) = old_positions.iter().position(|p| p == h) {
                new_hits.push(new_positions[i]);
            }
        }

        // Owner-view cell knowledge.
        for c in &old_positions {
            if old_hits.contains(c) {
                self.cells[*c as usize] = CellKnowledge::Miss;
            } else {
                self.cells[*c as usize] = CellKnowledge::Unknown;
            }
        }
        for c in &new_positions {
            self.cells[*c as usize] = CellKnowledge::Ship;
        }

        let ship = &mut self.ships[ship_idx];
        ship.positions = new_positions;
        ship.hits = new_hits;
        Ok(())
    }

    /// Rotate ship 90 degrees around its first cell.
    pub fn rotate_ship(&mut self, ship_idx: usize) -> Result<(), String> {
        if self.ships[ship_idx].positions.is_empty() {
            return Err("Ship not placed".into());
        }
        let anchor = self.ships[ship_idx].positions[0];
        let new_orientation = match self.ships[ship_idx].orientation {
            Orientation::Horizontal => Orientation::Vertical,
            Orientation::Vertical => Orientation::Horizontal,
        };
        let length = self.ships[ship_idx].length();
        let (row, col) = row_col(anchor, self.size);
        let Some(cells) = ship_cells(row, col, length, new_orientation, self.size) else {
            return Err("Rotation out of bounds".into());
        };
        if !self.can_place_cells(&cells, Some(ship_idx)) {
            return Err("Rotation blocked by another ship".into());
        }
        for c in &cells {
            if *c == anchor {
                continue;
            }
            if self.cells[*c as usize] != CellKnowledge::Unknown {
                return Err("Cannot rotate into previously attacked cell".into());
            }
        }

        let old_positions = self.ships[ship_idx].positions.clone();
        let old_hits = self.ships[ship_idx].hits.clone();

        // Translate hits by index, preserving the order of the existing hits.
        let mut new_hits: Vec<u32> = Vec::new();
        for h in &old_hits {
            if let Some(i) = old_positions.iter().position(|p| p == h) {
                new_hits.push(cells[i]);
            }
        }

        // Vacate old cells (other than anchor).
        for i in 1..old_positions.len() {
            let c = old_positions[i];
            if old_hits.contains(&c) {
                self.cells[c as usize] = CellKnowledge::Miss;
            } else {
                self.cells[c as usize] = CellKnowledge::Unknown;
            }
        }
        // Occupy new cells.
        for c in &cells {
            self.cells[*c as usize] = CellKnowledge::Ship;
        }

        let ship = &mut self.ships[ship_idx];
        ship.positions = cells;
        ship.hits = new_hits;
        ship.orientation = new_orientation;
        Ok(())
    }

    // ----- Damage resolution ----------------------------------------------

    /// Apply an attack on this board (DEFENDER's board). Returns ordered events.
    pub fn apply_hits(&mut self, cells: &[u32], by: PlayerSide) -> Vec<GameEvent> {
        let mut events: Vec<GameEvent> = Vec::new();
        let mut dedup: HashSet<u32> = HashSet::new();
        let total = self.size * self.size;
        for &cell in cells {
            if cell >= total {
                continue;
            }
            if !dedup.insert(cell) {
                continue;
            }
            let before = self.cells[cell as usize];
            match before {
                CellKnowledge::Miss | CellKnowledge::Hit | CellKnowledge::Sunk => continue,
                CellKnowledge::Ship => {
                    let ship_idx = self.ship_at(cell);
                    match ship_idx {
                        None => {
                            // Defensive: treat as miss.
                            self.cells[cell as usize] = CellKnowledge::Miss;
                            events.push(GameEvent::Shot {
                                by,
                                cell,
                                result: ShotResult::Miss,
                            });
                        }
                        Some(idx_) => {
                            self.ships[idx_].record_hit(cell);
                            if self.ships[idx_].sunk() {
                                let positions = self.ships[idx_].positions.clone();
                                for c in &positions {
                                    self.cells[*c as usize] = CellKnowledge::Sunk;
                                }
                                let kind = self.ships[idx_].kind();
                                events.push(GameEvent::Shot {
                                    by,
                                    cell,
                                    result: ShotResult::Hit,
                                });
                                events.push(GameEvent::ShipSunk {
                                    by,
                                    ship_kind: kind,
                                    cells: positions,
                                });
                            } else {
                                self.cells[cell as usize] = CellKnowledge::Hit;
                                events.push(GameEvent::Shot {
                                    by,
                                    cell,
                                    result: ShotResult::Hit,
                                });
                            }
                        }
                    }
                }
                CellKnowledge::Unknown => {
                    self.cells[cell as usize] = CellKnowledge::Miss;
                    events.push(GameEvent::Shot {
                        by,
                        cell,
                        result: ShotResult::Miss,
                    });
                }
            }
        }
        events
    }

    pub fn ship_at(&self, cell: u32) -> Option<usize> {
        self.ships
            .iter()
            .position(|s| s.positions.contains(&cell))
    }

    pub fn all_ships_sunk(&self) -> bool {
        !self.ships.is_empty() && self.ships.iter().all(|s| s.sunk())
    }

    pub fn all_ships_placed(&self) -> bool {
        !self.ships.is_empty()
            && self
                .ships
                .iter()
                .all(|s| s.positions.len() as u32 == s.length())
    }

    // ----- DTOs -----------------------------------------------------------

    pub fn to_owner_view(&self) -> BoardViewDTO {
        BoardViewDTO {
            size: self.size,
            cells: self.cells.clone(),
            ships: self.ships.iter().map(|s| s.to_dto(true)).collect(),
        }
    }

    pub fn to_enemy_view(&self) -> BoardViewDTO {
        let cells: Vec<CellKnowledge> = self
            .cells
            .iter()
            .map(|c| {
                if matches!(c, CellKnowledge::Ship) {
                    CellKnowledge::Unknown
                } else {
                    *c
                }
            })
            .collect();
        BoardViewDTO {
            size: self.size,
            cells,
            ships: self.ships.iter().map(|s| s.to_dto(false)).collect(),
        }
    }
}
