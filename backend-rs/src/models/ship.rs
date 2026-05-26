use std::collections::BTreeMap;

use crate::shared::{ActionKind, ActionMap, Orientation, PlayerSide, ShipDTO, ShipKind};

/// Per-class static configuration. Equivalent to the TS subclasses
/// (AircraftCarrier, Battleship, Cruiser, Frigate, Submarine).
#[derive(Debug, Clone)]
pub struct ShipClass {
    pub kind: ShipKind,
    pub length: u32,
    pub name: &'static str,
    pub default_quotas: &'static [(ActionKind, u32)],
    pub supported_actions: &'static [ActionKind],
    /// Submarine has special shared-budget semantics: consuming any quota
    /// zeroes ALL quotas this turn.
    pub shared_budget: bool,
}

pub const AIRCRAFT_CARRIER: ShipClass = ShipClass {
    kind: ShipKind::AircraftCarrier,
    length: 8,
    name: "Aircraft Carrier",
    default_quotas: &[(ActionKind::SingleHit, 4)],
    supported_actions: &[ActionKind::SingleHit],
    shared_budget: false,
};

pub const BATTLESHIP: ShipClass = ShipClass {
    kind: ShipKind::Battleship,
    length: 6,
    name: "Battleship",
    default_quotas: &[(ActionKind::AreaHit2x2, 1)],
    supported_actions: &[ActionKind::AreaHit2x2],
    shared_budget: false,
};

pub const CRUISER: ShipClass = ShipClass {
    kind: ShipKind::Cruiser,
    length: 4,
    name: "Cruiser",
    default_quotas: &[(ActionKind::SingleHit, 2)],
    supported_actions: &[ActionKind::SingleHit],
    shared_budget: false,
};

pub const FRIGATE: ShipClass = ShipClass {
    kind: ShipKind::Frigate,
    length: 3,
    name: "Frigate",
    default_quotas: &[(ActionKind::SingleHit, 1)],
    supported_actions: &[ActionKind::SingleHit],
    shared_budget: false,
};

pub const SUBMARINE: ShipClass = ShipClass {
    kind: ShipKind::Submarine,
    length: 2,
    name: "Submarine",
    default_quotas: &[
        (ActionKind::SingleHit, 1),
        (ActionKind::Move1, 1),
        (ActionKind::Rotate90, 1),
    ],
    supported_actions: &[ActionKind::SingleHit, ActionKind::Move1, ActionKind::Rotate90],
    shared_budget: true,
};

pub fn class_for(kind: ShipKind) -> &'static ShipClass {
    match kind {
        ShipKind::AircraftCarrier => &AIRCRAFT_CARRIER,
        ShipKind::Battleship => &BATTLESHIP,
        ShipKind::Cruiser => &CRUISER,
        ShipKind::Frigate => &FRIGATE,
        ShipKind::Submarine => &SUBMARINE,
    }
}

#[derive(Debug, Clone)]
pub struct Ship {
    pub class: &'static ShipClass,
    pub side: PlayerSide,
    pub id: String,
    pub orientation: Orientation,
    pub positions: Vec<u32>,
    /// Insertion-ordered list of hit cells (mirrors JS `Set<number>` semantics
    /// so the wire-level order matches the TS implementation exactly).
    pub hits: Vec<u32>,
    pub quotas: BTreeMap<ActionKind, u32>,
}

impl Ship {
    pub fn new(kind: ShipKind, side: PlayerSide) -> Self {
        let class = class_for(kind);
        let id = format!(
            "{}-{}",
            match side {
                PlayerSide::Human => "human",
                PlayerSide::Ai => "ai",
            },
            screaming_snake(kind)
        );
        let mut s = Self {
            class,
            side,
            id,
            orientation: Orientation::Horizontal,
            positions: Vec::new(),
            hits: Vec::new(),
            quotas: BTreeMap::new(),
        };
        s.reset_quotas();
        s
    }

    pub fn kind(&self) -> ShipKind {
        self.class.kind
    }
    pub fn length(&self) -> u32 {
        self.class.length
    }
    pub fn name(&self) -> &'static str {
        self.class.name
    }

    pub fn supported_actions(&self) -> &'static [ActionKind] {
        self.class.supported_actions
    }

    pub fn default_quotas(&self) -> ActionMap {
        let mut m = BTreeMap::new();
        for (k, v) in self.class.default_quotas.iter().copied() {
            m.insert(k, v);
        }
        m
    }

    pub fn reset_quotas(&mut self) {
        self.quotas = self.default_quotas();
    }

    pub fn has_quota(&self, kind: ActionKind) -> bool {
        if !self.supported_actions().contains(&kind) {
            return false;
        }
        self.quotas.get(&kind).copied().unwrap_or(0) > 0
    }

    /// Subtract one from the quota for `kind`. Submarine zeroes all quotas.
    pub fn consume_quota(&mut self, kind: ActionKind) -> Result<(), String> {
        if !self.has_quota(kind) {
            return Err(format!("Ship {} has no quota for {:?}", self.id, kind));
        }
        if self.class.shared_budget {
            self.quotas.clear();
        } else {
            let left = self.quotas.get(&kind).copied().unwrap_or(0);
            if left == 0 {
                return Err(format!("Ship {} has no quota for {:?}", self.id, kind));
            }
            self.quotas.insert(kind, left - 1);
        }
        Ok(())
    }

    pub fn total_actions_left(&self) -> u32 {
        let mut n = 0;
        for k in self.supported_actions() {
            n += self.quotas.get(k).copied().unwrap_or(0);
        }
        n
    }

    pub fn sunk(&self) -> bool {
        self.length() > 0 && (self.hits.len() as u32) == self.length()
    }

    /// Add a cell to `hits` only if not already present, preserving order.
    pub fn record_hit(&mut self, cell: u32) {
        if !self.hits.contains(&cell) {
            self.hits.push(cell);
        }
    }

    pub fn has_hit(&self, cell: u32) -> bool {
        self.hits.contains(&cell)
    }

    pub fn to_dto(&self, owner_view: bool) -> ShipDTO {
        let sunk = self.sunk();
        let (positions, hits, actions_remaining) = if owner_view {
            (
                self.positions.clone(),
                self.hits.clone(),
                Some(self.quotas.clone()),
            )
        } else if sunk {
            (self.positions.clone(), self.positions.clone(), None)
        } else {
            (Vec::new(), Vec::new(), None)
        };
        ShipDTO {
            id: self.id.clone(),
            kind: self.kind(),
            name: self.name().to_string(),
            length: self.length(),
            orientation: self.orientation,
            positions,
            hits,
            sunk,
            actions_remaining,
        }
    }
}

fn screaming_snake(kind: ShipKind) -> &'static str {
    match kind {
        ShipKind::AircraftCarrier => "AIRCRAFT_CARRIER",
        ShipKind::Battleship => "BATTLESHIP",
        ShipKind::Cruiser => "CRUISER",
        ShipKind::Frigate => "FRIGATE",
        ShipKind::Submarine => "SUBMARINE",
    }
}
