//! Seedable PRNG (mulberry32). Mirrors the TS implementation so that, given
//! the same seed, generated sequences match for deterministic gameplay.

#[derive(Debug, Clone)]
pub struct Rng {
    state: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        let mut state = seed;
        if state == 0 {
            state = 0x9e37_79b9; // golden-ratio fallback
        }
        Self { state }
    }

    pub fn random() -> Self {
        // Cheap non-deterministic seed sourced from the OS clock. The TS
        // implementation uses Math.random() * 0xffffffff; we use nanos which
        // is good enough for non-cryptographic gameplay.
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0xdead_beef);
        Self::new(nanos)
    }

    /// Float in [0, 1).
    pub fn next_float(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        let v = (t ^ (t >> 14)) as f64;
        v / 4_294_967_296.0
    }

    /// Integer in [0, max).
    pub fn next_int(&mut self, max_exclusive: u32) -> u32 {
        (self.next_float() * (max_exclusive as f64)) as u32
    }

    /// Uniformly pick an element from a non-empty slice.
    #[allow(dead_code)]
    pub fn pick<'a, T>(&mut self, arr: &'a [T]) -> &'a T {
        assert!(!arr.is_empty(), "Rng.pick on empty array");
        &arr[self.next_int(arr.len() as u32) as usize]
    }

    /// Returns a new shuffled copy (Fisher-Yates).
    #[allow(dead_code)]
    pub fn shuffle<T: Clone>(&mut self, arr: &[T]) -> Vec<T> {
        let mut out = arr.to_vec();
        for i in (1..out.len()).rev() {
            let j = self.next_int((i + 1) as u32) as usize;
            out.swap(i, j);
        }
        out
    }
}
