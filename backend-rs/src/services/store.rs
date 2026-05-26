use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;

use crate::core::game::Game;

/// Trivial in-memory store. Single-process only. Each game is wrapped in its
/// own `Mutex<Game>` so per-game requests can serialize without blocking
/// other games.
#[derive(Default, Clone)]
pub struct GameStore {
    inner: Arc<Mutex<HashMap<String, Arc<Mutex<Game>>>>>,
}

impl GameStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, id: &str) -> Option<Arc<Mutex<Game>>> {
        self.inner.lock().get(id).cloned()
    }

    pub fn create(&self, game: Game) {
        let id = game.id.clone();
        self.inner.lock().insert(id, Arc::new(Mutex::new(game)));
    }

    pub fn delete(&self, id: &str) -> bool {
        self.inner.lock().remove(id).is_some()
    }

    pub fn size(&self) -> usize {
        self.inner.lock().len()
    }
}
