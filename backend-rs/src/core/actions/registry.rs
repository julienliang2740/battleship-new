//! Trivial registry shim. The TS version exposes Action objects keyed by
//! ActionKind; in Rust the dispatch happens directly in `actions::validate`/
//! `actions::execute`. This file is kept for parity with the TS layout.

use crate::shared::ActionKind;

#[allow(dead_code)]
pub fn known(kind: ActionKind) -> bool {
    matches!(
        kind,
        ActionKind::SingleHit | ActionKind::AreaHit2x2 | ActionKind::Move1 | ActionKind::Rotate90
    )
}
