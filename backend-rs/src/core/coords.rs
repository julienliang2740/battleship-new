use crate::shared::{Direction, Orientation};

#[inline]
pub fn idx(row: i32, col: i32, size: u32) -> u32 {
    (row as u32) * size + (col as u32)
}

#[inline]
pub fn row_col(index: u32, size: u32) -> (i32, i32) {
    ((index / size) as i32, (index % size) as i32)
}

#[inline]
pub fn in_bounds(row: i32, col: i32, size: u32) -> bool {
    let s = size as i32;
    row >= 0 && row < s && col >= 0 && col < s
}

/// Compute the cells occupied by a ship anchored at (start_row, start_col).
/// Returns None if the ship would exit the board.
pub fn ship_cells(
    start_row: i32,
    start_col: i32,
    length: u32,
    orientation: Orientation,
    size: u32,
) -> Option<Vec<u32>> {
    let mut cells = Vec::with_capacity(length as usize);
    for i in 0..(length as i32) {
        let (r, c) = match orientation {
            Orientation::Horizontal => (start_row, start_col + i),
            Orientation::Vertical => (start_row + i, start_col),
        };
        if !in_bounds(r, c, size) {
            return None;
        }
        cells.push(idx(r, c, size));
    }
    Some(cells)
}

/// 4-neighborhood for a flat cell index.
#[allow(dead_code)]
pub fn neighbors(cell: u32, size: u32) -> Vec<u32> {
    let (row, col) = row_col(cell, size);
    let mut out = Vec::with_capacity(4);
    if row > 0 {
        out.push(idx(row - 1, col, size));
    }
    if row < (size as i32) - 1 {
        out.push(idx(row + 1, col, size));
    }
    if col > 0 {
        out.push(idx(row, col - 1, size));
    }
    if col < (size as i32) - 1 {
        out.push(idx(row, col + 1, size));
    }
    out
}

/// Expand a 2x2 anchored at the top-left `anchor`. Returns all 4 cell indices
/// that are in bounds (skipping any that fall off).
pub fn expand_2x2(anchor: u32, size: u32) -> Vec<u32> {
    let (row, col) = row_col(anchor, size);
    let mut out = Vec::with_capacity(4);
    for dr in 0..2 {
        for dc in 0..2 {
            let r = row + dr;
            let c = col + dc;
            if in_bounds(r, c, size) {
                out.push(idx(r, c, size));
            }
        }
    }
    out
}

/// Unit vector for a cardinal direction.
pub fn delta(dir: Direction) -> (i32, i32) {
    match dir {
        Direction::N => (-1, 0),
        Direction::S => (1, 0),
        Direction::W => (0, -1),
        Direction::E => (0, 1),
    }
}
