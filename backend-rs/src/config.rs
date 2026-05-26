use crate::shared::ShipKind;

/// Default grid size; 12x12 comfortably fits a length-8 carrier.
pub const BOARD_SIZE: u32 = 12;

/// Order of ships in a fleet (used for placement order + fleet listings).
pub const FLEET_ORDER: [ShipKind; 5] = [
    ShipKind::AircraftCarrier,
    ShipKind::Battleship,
    ShipKind::Cruiser,
    ShipKind::Frigate,
    ShipKind::Submarine,
];

pub fn port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4000)
}
