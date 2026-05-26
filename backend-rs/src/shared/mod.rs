//! Shared DTOs mirroring `shared/src/*.ts`. Wire format is preserved exactly
//! to match the existing frontend.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// ---------- coords.ts ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Direction {
    N,
    E,
    S,
    W,
}

// ---------- ships.ts ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ShipKind {
    AircraftCarrier,
    Battleship,
    Cruiser,
    Frigate,
    Submarine,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize, Deserialize)]
pub enum ActionKind {
    #[serde(rename = "SINGLE_HIT")]
    SingleHit,
    #[serde(rename = "AREA_HIT_2X2")]
    AreaHit2x2,
    #[serde(rename = "MOVE_1")]
    Move1,
    #[serde(rename = "ROTATE_90")]
    Rotate90,
}

impl ActionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ActionKind::SingleHit => "SINGLE_HIT",
            ActionKind::AreaHit2x2 => "AREA_HIT_2X2",
            ActionKind::Move1 => "MOVE_1",
            ActionKind::Rotate90 => "ROTATE_90",
        }
    }
}

/// Ordered map (BTreeMap) so JSON output is stable. Keys serialize using the
/// `SCREAMING_SNAKE_CASE` ActionKind names.
pub type ActionMap = BTreeMap<ActionKind, u32>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShipDTO {
    pub id: String,
    pub kind: ShipKind,
    pub name: String,
    pub length: u32,
    pub orientation: Orientation,
    pub positions: Vec<u32>,
    pub hits: Vec<u32>,
    pub sunk: bool,
    #[serde(rename = "actionsRemaining", skip_serializing_if = "Option::is_none")]
    pub actions_remaining: Option<ActionMap>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShipMetaDTO {
    pub kind: ShipKind,
    pub name: String,
    pub length: u32,
    pub actions: ActionMap,
    #[serde(rename = "sharedBudget", skip_serializing_if = "Option::is_none")]
    pub shared_budget: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleetMetaDTO {
    #[serde(rename = "boardSize")]
    pub board_size: u32,
    pub ships: Vec<ShipMetaDTO>,
}

// ---------- board.ts ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CellKnowledge {
    Unknown,
    Ship,
    Miss,
    Hit,
    Sunk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardViewDTO {
    pub size: u32,
    pub cells: Vec<CellKnowledge>,
    pub ships: Vec<ShipDTO>,
}

// ---------- game.ts ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlayerSide {
    Human,
    Ai,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GamePhase {
    Placement,
    Playing,
    Gameover,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacementProgress {
    pub order: Vec<ShipKind>,
    #[serde(rename = "nextIndex")]
    pub next_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameStateDTO {
    #[serde(rename = "gameId")]
    pub game_id: String,
    pub phase: GamePhase,
    #[serde(rename = "activePlayer")]
    pub active_player: PlayerSide,
    pub you: BoardViewDTO,
    pub enemy: BoardViewDTO,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placement: Option<PlacementProgress>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub winner: Option<PlayerSide>,
}

// ---------- actions.ts ----------

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GameEvent {
    Shot {
        by: PlayerSide,
        cell: u32,
        result: ShotResult,
    },
    ShipSunk {
        by: PlayerSide,
        #[serde(rename = "shipKind")]
        ship_kind: ShipKind,
        cells: Vec<u32>,
    },
    ShipMoved {
        side: PlayerSide,
        #[serde(rename = "shipId")]
        ship_id: String,
    },
    ShipRotated {
        side: PlayerSide,
        #[serde(rename = "shipId")]
        ship_id: String,
    },
    TurnStarted {
        player: PlayerSide,
    },
    GameOver {
        winner: PlayerSide,
    },
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ShotResult {
    Miss,
    Hit,
}

/// Parsed action request. Distinguished by `endTurn` field at the wire level
/// (handled in `api::validators`).
#[derive(Debug, Clone)]
pub enum ActionRequest {
    EndTurn,
    Ship(ShipActionRequest),
}

#[derive(Debug, Clone)]
pub struct ShipActionRequest {
    pub ship_id: String,
    pub kind: ActionKind,
    pub targets: Vec<u32>,
    pub direction: Option<Direction>,
}
