use std::collections::HashSet;

use crate::config::FLEET_ORDER;
use crate::core::coords::{expand_2x2, idx, row_col};
use crate::shared::{BoardViewDTO, CellKnowledge, ShipKind};

/// Targeter: derives shot priorities from an enemy BoardViewDTO.
pub struct Targeter {
    pub view: BoardViewDTO,
    pub active_hits: Vec<u32>,
    pub remaining_sizes: Vec<u32>,
    pub density: Vec<i32>,
}

impl Targeter {
    pub fn new(view: BoardViewDTO) -> Self {
        let mut t = Self {
            view,
            active_hits: Vec::new(),
            remaining_sizes: Vec::new(),
            density: Vec::new(),
        };
        t.update();
        t
    }

    pub fn update(&mut self) {
        self.active_hits.clear();
        for (i, c) in self.view.cells.iter().enumerate() {
            if matches!(c, CellKnowledge::Hit) {
                self.active_hits.push(i as u32);
            }
        }
        let sunk_kinds: HashSet<ShipKind> = self
            .view
            .ships
            .iter()
            .filter(|s| s.sunk)
            .map(|s| s.kind)
            .collect();
        let lengths = length_for_each();
        let mut remaining = Vec::new();
        for k in FLEET_ORDER.iter().copied() {
            if !sunk_kinds.contains(&k) {
                remaining.push(lengths(k));
            }
        }
        self.remaining_sizes = remaining;
        self.density = self.compute_density();
    }

    /// Single-cell densest unattacked cell. Returns -1 if none.
    pub fn best_single_target(&self) -> i64 {
        let view = &self.view;
        let mut best: i64 = -1;
        let mut best_score: i32 = -1;
        for i in 0..view.cells.len() {
            if !matches!(view.cells[i], CellKnowledge::Unknown) {
                continue;
            }
            let s = self.density.get(i).copied().unwrap_or(0);
            if s > best_score {
                best_score = s;
                best = i as i64;
            }
        }
        if best < 0 {
            for i in 0..view.cells.len() {
                if matches!(view.cells[i], CellKnowledge::Unknown) {
                    return i as i64;
                }
            }
        }
        best
    }

    /// Best 2x2 anchor by sum-of-density. Returns `(anchor, score)`.
    pub fn best_area_target(&self) -> (u32, i32) {
        let size = self.view.size;
        let mut best_anchor: i64 = -1;
        let mut best_score: i32 = i32::MIN;
        for r in 0..((size as i32) - 1) {
            for c in 0..((size as i32) - 1) {
                let anchor = idx(r, c, size);
                let cells = expand_2x2(anchor, size);
                let mut score = 0i32;
                let mut unattacked = 0i32;
                for cell in &cells {
                    if matches!(self.view.cells[*cell as usize], CellKnowledge::Unknown) {
                        score += self.density.get(*cell as usize).copied().unwrap_or(0);
                        unattacked += 1;
                    }
                }
                if unattacked < 2 {
                    continue;
                }
                if score > best_score {
                    best_score = score;
                    best_anchor = anchor as i64;
                }
            }
        }
        if best_anchor < 0 {
            for r in 0..((size as i32) - 1) {
                for c in 0..((size as i32) - 1) {
                    let anchor = idx(r, c, size);
                    let cells = expand_2x2(anchor, size);
                    if cells
                        .iter()
                        .any(|cc| matches!(self.view.cells[*cc as usize], CellKnowledge::Unknown))
                    {
                        return (anchor, 0);
                    }
                }
            }
            return (0, 0);
        }
        (best_anchor as u32, best_score)
    }

    fn compute_density(&self) -> Vec<i32> {
        let size = self.view.size;
        let n = (size * size) as usize;
        let mut density = vec![0i32; n];
        let target_mode = !self.active_hits.is_empty();
        let hit_set: HashSet<u32> = self.active_hits.iter().copied().collect();

        let blocked = |cell: u32| {
            matches!(
                self.view.cells[cell as usize],
                CellKnowledge::Miss | CellKnowledge::Sunk
            )
        };

        for &ship_size in &self.remaining_sizes {
            // Horizontal placements.
            for r in 0..(size as i32) {
                for c in 0..=((size as i32) - (ship_size as i32)) {
                    let mut ok = true;
                    let mut overlaps_hit = false;
                    for k in 0..(ship_size as i32) {
                        let cell = idx(r, c + k, size);
                        if blocked(cell) {
                            ok = false;
                            break;
                        }
                        if hit_set.contains(&cell) {
                            overlaps_hit = true;
                        }
                    }
                    if !ok {
                        continue;
                    }
                    if target_mode && !overlaps_hit {
                        continue;
                    }
                    for k in 0..(ship_size as i32) {
                        let cell = idx(r, c + k, size);
                        if !matches!(self.view.cells[cell as usize], CellKnowledge::Unknown) {
                            continue;
                        }
                        density[cell as usize] += 1;
                    }
                }
            }
            // Vertical placements.
            for c in 0..(size as i32) {
                for r in 0..=((size as i32) - (ship_size as i32)) {
                    let mut ok = true;
                    let mut overlaps_hit = false;
                    for k in 0..(ship_size as i32) {
                        let cell = idx(r + k, c, size);
                        if blocked(cell) {
                            ok = false;
                            break;
                        }
                        if hit_set.contains(&cell) {
                            overlaps_hit = true;
                        }
                    }
                    if !ok {
                        continue;
                    }
                    if target_mode && !overlaps_hit {
                        continue;
                    }
                    for k in 0..(ship_size as i32) {
                        let cell = idx(r + k, c, size);
                        if !matches!(self.view.cells[cell as usize], CellKnowledge::Unknown) {
                            continue;
                        }
                        density[cell as usize] += 1;
                    }
                }
            }
        }
        density
    }
}

fn length_for_each() -> impl Fn(ShipKind) -> u32 {
    |k| match k {
        ShipKind::AircraftCarrier => 8,
        ShipKind::Battleship => 6,
        ShipKind::Cruiser => 4,
        ShipKind::Frigate => 3,
        ShipKind::Submarine => 2,
    }
}

/// Center of mass of MISS/HIT cells (for sub evasion). Returns None if none.
pub fn miss_center(view: &BoardViewDTO) -> Option<(f64, f64)> {
    let mut sum_r = 0.0;
    let mut sum_c = 0.0;
    let mut n = 0.0;
    for i in 0..view.cells.len() {
        if matches!(view.cells[i], CellKnowledge::Miss | CellKnowledge::Hit) {
            let (row, col) = row_col(i as u32, view.size);
            sum_r += row as f64;
            sum_c += col as f64;
            n += 1.0;
        }
    }
    if n == 0.0 {
        return None;
    }
    Some((sum_r / n, sum_c / n))
}
