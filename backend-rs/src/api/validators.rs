//! Manual parsers that mirror `backend/src/api/validators.ts`. We use
//! `serde_json::Value` to keep the validation messages identical to the TS
//! implementation, which the frontend may depend on for error display.

use serde_json::Value;

use crate::shared::{
    ActionKind, ActionRequest, Direction, Orientation, ShipActionRequest, ShipKind,
};

use super::errors::{ApiError, ApiErrorCode};

fn bad<M: Into<String>>(msg: M) -> ApiError {
    ApiError::new(ApiErrorCode::BadRequest, msg)
}

fn need(cond: bool, msg: &str) -> Result<(), ApiError> {
    if !cond {
        Err(bad(msg.to_string()))
    } else {
        Ok(())
    }
}

pub fn as_string(v: &Value, field: &str) -> Result<String, ApiError> {
    if let Value::String(s) = v {
        if !s.is_empty() {
            return Ok(s.clone());
        }
    }
    Err(bad(format!("Missing field: {}", field)))
}

pub fn as_non_neg_int(v: &Value, field: &str) -> Result<u32, ApiError> {
    if let Value::Number(n) = v {
        if let Some(i) = n.as_i64() {
            if i >= 0 && i <= u32::MAX as i64 {
                return Ok(i as u32);
            }
        }
        // Some JSON numbers might come through as floats; reject non-integers.
    }
    Err(bad(format!(
        "Field {} must be a non-negative integer",
        field
    )))
}

pub fn as_ship_kind(v: &Value) -> Result<ShipKind, ApiError> {
    let s = match v {
        Value::String(s) => s.as_str(),
        _ => "",
    };
    match s {
        "AIRCRAFT_CARRIER" => Ok(ShipKind::AircraftCarrier),
        "BATTLESHIP" => Ok(ShipKind::Battleship),
        "CRUISER" => Ok(ShipKind::Cruiser),
        "FRIGATE" => Ok(ShipKind::Frigate),
        "SUBMARINE" => Ok(ShipKind::Submarine),
        _ => Err(bad(format!("Invalid ship kind: {}", s))),
    }
}

pub fn as_orientation(v: &Value) -> Result<Orientation, ApiError> {
    let s = match v {
        Value::String(s) => s.as_str(),
        _ => "",
    };
    match s {
        "horizontal" => Ok(Orientation::Horizontal),
        "vertical" => Ok(Orientation::Vertical),
        _ => Err(bad(format!("Invalid orientation: {}", s))),
    }
}

pub fn as_action_kind(v: &Value) -> Result<ActionKind, ApiError> {
    let s = match v {
        Value::String(s) => s.as_str(),
        _ => "",
    };
    match s {
        "SINGLE_HIT" => Ok(ActionKind::SingleHit),
        "AREA_HIT_2X2" => Ok(ActionKind::AreaHit2x2),
        "MOVE_1" => Ok(ActionKind::Move1),
        "ROTATE_90" => Ok(ActionKind::Rotate90),
        _ => Err(bad(format!("Invalid action kind: {}", s))),
    }
}

pub fn as_direction(v: &Value) -> Result<Direction, ApiError> {
    let s = match v {
        Value::String(s) => s.as_str(),
        _ => "",
    };
    match s {
        "N" => Ok(Direction::N),
        "E" => Ok(Direction::E),
        "S" => Ok(Direction::S),
        "W" => Ok(Direction::W),
        _ => Err(bad(format!("Invalid direction: {}", s))),
    }
}

/// Validate the body of `POST /api/games/:id/actions`.
pub fn parse_action_request(body: &Value) -> Result<ActionRequest, ApiError> {
    need(
        body.is_object(),
        "Request body must be a JSON object",
    )?;
    let obj = body.as_object().unwrap();

    if let Some(et) = obj.get("endTurn") {
        if et == &Value::Bool(true) {
            return Ok(ActionRequest::EndTurn);
        }
    }

    let ship_id = match obj.get("shipId") {
        Some(v) => as_string(v, "shipId")?,
        None => return Err(bad("Missing field: shipId")),
    };
    let kind = match obj.get("kind") {
        Some(v) => as_action_kind(v)?,
        None => return Err(bad("Invalid action kind: undefined")),
    };
    let targets_v = obj
        .get("targets")
        .ok_or_else(|| bad("Field 'targets' must be an array of cell indices"))?;
    let targets_arr = targets_v
        .as_array()
        .ok_or_else(|| bad("Field 'targets' must be an array of cell indices"))?;
    let mut targets: Vec<u32> = Vec::with_capacity(targets_arr.len());
    for (i, t) in targets_arr.iter().enumerate() {
        targets.push(as_non_neg_int(t, &format!("targets[{}]", i))?);
    }
    let mut out = ShipActionRequest {
        ship_id,
        kind,
        targets,
        direction: None,
    };
    if let Some(d) = obj.get("direction") {
        if !d.is_null() {
            out.direction = Some(as_direction(d)?);
        }
    }
    Ok(ActionRequest::Ship(out))
}

pub fn parse_place_body(
    body: &Value,
) -> Result<(ShipKind, u32, Orientation), ApiError> {
    need(
        body.is_object(),
        "Request body must be a JSON object",
    )?;
    let obj = body.as_object().unwrap();
    let kind = as_ship_kind(
        obj.get("kind")
            .ok_or_else(|| bad("Invalid ship kind: undefined"))?,
    )?;
    let anchor = as_non_neg_int(
        obj.get("anchor")
            .ok_or_else(|| bad("Field anchor must be a non-negative integer"))?,
        "anchor",
    )?;
    let orientation = as_orientation(
        obj.get("orientation")
            .ok_or_else(|| bad("Invalid orientation: undefined"))?,
    )?;
    Ok((kind, anchor, orientation))
}

pub fn parse_create_body(body: &Value) -> Result<Option<u32>, ApiError> {
    if !body.is_object() {
        return Ok(None);
    }
    let obj = body.as_object().unwrap();
    let Some(s) = obj.get("seed") else {
        return Ok(None);
    };
    if s.is_null() {
        return Ok(None);
    }
    Ok(Some(as_non_neg_int(s, "seed")?))
}
