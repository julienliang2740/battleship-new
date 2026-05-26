use crate::core::board::Board;
use crate::core::game::auto_place_fleet;
use crate::core::rng::Rng;

pub fn place_ai_fleet(board: &mut Board, rng: &mut Rng) {
    auto_place_fleet(board, rng);
}
