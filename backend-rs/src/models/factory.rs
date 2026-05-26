use crate::config::{BOARD_SIZE, FLEET_ORDER};
use crate::shared::{FleetMetaDTO, PlayerSide, ShipKind, ShipMetaDTO};

use super::ship::{class_for, Ship};

pub fn create_ship(kind: ShipKind, side: PlayerSide) -> Ship {
    Ship::new(kind, side)
}

/// Build a full fleet for the given side in canonical order.
pub fn build_fleet(side: PlayerSide) -> Vec<Ship> {
    FLEET_ORDER
        .iter()
        .copied()
        .map(|k| create_ship(k, side))
        .collect()
}

/// Metadata for `GET /api/meta/fleet`.
pub fn fleet_meta() -> FleetMetaDTO {
    let ships: Vec<ShipMetaDTO> = FLEET_ORDER
        .iter()
        .copied()
        .map(|kind| {
            let class = class_for(kind);
            let mut actions = std::collections::BTreeMap::new();
            for (k, v) in class.default_quotas.iter().copied() {
                actions.insert(k, v);
            }
            let shared_budget = if kind == ShipKind::Submarine {
                Some(1)
            } else {
                None
            };
            ShipMetaDTO {
                kind,
                name: class.name.to_string(),
                length: class.length,
                actions,
                shared_budget,
            }
        })
        .collect();
    FleetMetaDTO {
        board_size: BOARD_SIZE,
        ships,
    }
}
