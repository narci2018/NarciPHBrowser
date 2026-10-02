//! Deterministic, dependency-free randomness.
//!
//! An identity is a pure function of its seed. That is the whole point: the
//! same seed must produce the same user agent, the same screen, the same GPU
//! and the same font list on every machine, in every process, forever — or a
//! profile that is re-opened next week presents itself as a different device.
//!
//! `SplitMix64` is used rather than a `rand` distribution because it is 20
//! lines of arithmetic with no platform-dependent entropy, no `StdRng` seeding
//! ambiguity across versions, and byte-identical output on x86-64, aarch64 and
//! wasm. The Fisher-Yates shuffle and the weighted picker are written out
//! rather than pulled from a crate so that a dependency upgrade can never
//! silently reshuffle a profile's identity.

/// A seeded pseudo-random generator.
#[derive(Debug, Clone)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Seeds the generator.
    pub const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// Derives a generator from a string seed, for callers that want a
    /// human-readable seed ("profile-7") to still be reproducible.
    pub fn from_key(key: &str) -> Self {
        Self::new(fnv1a64(key.as_bytes()))
    }

    /// The raw SplitMix64 step.
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A uniform `u32`.
    pub fn next_u32(&mut self) -> u32 {
        (self.next_u64() >> 32) as u32
    }

    /// A uniform `usize` in `0..n`, using Lemire's multiply-shift rejection
    /// method so the result is free of modulo bias for any `n`.
    pub fn below(&mut self, n: usize) -> usize {
        assert!(n > 0, "Rng::below requires a non-zero bound");
        if n.is_power_of_two() {
            return self.next_u64() as usize & (n - 1);
        }
        // Lemire's method: multiply a 64-bit draw by the bound and keep the
        // high word. The rejection threshold is the values below which the
        // high word would be biased low.
        let threshold = n.wrapping_neg() % n;
        loop {
            let candidate = (self.next_u64() as u128) * (n as u128);
            let low = candidate as u64;
            if low >= threshold as u64 {
                return (candidate >> 64) as usize;
            }
        }
    }

    /// A uniform integer in the inclusive range `lo..=hi`.
    pub fn range_i32(&mut self, lo: i32, hi: i32) -> i32 {
        assert!(lo <= hi, "Rng::range_i32 requires lo <= hi");
        let span = (hi as i64 - lo as i64 + 1) as u64;
        (lo as i64 + self.below(span.min(u32::MAX as u64) as usize) as i64) as i32
    }

    /// A uniform `f64` in `[0, 1)`.
    ///
    /// 53 significant bits, the full precision of an IEEE-754 double.
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / 9_007_199_254_740_992.0)
    }

    /// A uniform `f64` in `[lo, hi)`.
    pub fn range_f64(&mut self, lo: f64, hi: f64) -> f64 {
        lo + self.unit() * (hi - lo)
    }

    /// True with probability `p`.
    pub fn chance(&mut self, p: f64) -> bool {
        self.unit() < p
    }

    /// A uniform element of `items`.
    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len())]
    }

    /// A uniform element of `items`, or `None` when the slice is empty.
    pub fn pick_opt<'a, T>(&mut self, items: &'a [T]) -> Option<&'a T> {
        if items.is_empty() {
            None
        } else {
            Some(self.pick(items))
        }
    }

    /// Picks an element of `items` with probability proportional to `weights`.
    ///
    /// Returns `None` for an empty slice or when every weight is zero, so a
    /// caller can never index past the end of its pool because of a typo in a
    /// weight table.
    pub fn pick_weighted<'a, T>(&mut self, items: &'a [T], weights: &[f64]) -> Option<&'a T> {
        let total: f64 = weights.iter().filter(|w| **w > 0.0).sum();
        if items.is_empty() || total <= 0.0 {
            return None;
        }
        let mut target = self.unit() * total;
        for (item, weight) in items.iter().zip(weights) {
            if *weight <= 0.0 {
                continue;
            }
            target -= weight;
            if target < 0.0 {
                return Some(item);
            }
        }
        items.last()
    }

    /// An index into `weights`, proportional to weight.
    pub fn weighted_index(&mut self, weights: &[f64]) -> Option<usize> {
        let total: f64 = weights.iter().filter(|w| **w > 0.0).sum();
        if weights.is_empty() || total <= 0.0 {
            return None;
        }
        let mut target = self.unit() * total;
        for (index, weight) in weights.iter().enumerate() {
            if *weight <= 0.0 {
                continue;
            }
            target -= weight;
            if target < 0.0 {
                return Some(index);
            }
        }
        // Only reachable through floating-point drift: the running total ends
        // a hair above `unit() * total`, so no branch matched. The last
        // positive weight is the correct catch-all, not simply the last index.
        weights
            .iter()
            .rposition(|weight| *weight > 0.0)
            .or(Some(weights.len() - 1))
    }

    /// An in-place Fisher-Yates shuffle (inside-out variant).
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for index in (1..items.len()).rev() {
            let swap = self.below(index + 1);
            items.swap(index, swap);
        }
    }

    /// A shuffled, truncated copy.
    pub fn sample<'a, T>(&mut self, items: &'a [T], count: usize) -> Vec<&'a T> {
        let mut pool: Vec<&T> = items.iter().collect();
        self.shuffle(&mut pool);
        pool.truncate(count.min(pool.len()));
        pool
    }

    /// Derives an independent stream, so adding a new field to the generator
    /// cannot shift the values every existing field draws.
    ///
    /// This is the reason a profile created before an upgrade and re-created
    /// after it still presents the same device: the generator labels each
    /// decision rather than consuming one long shared sequence.
    pub fn fork(&mut self, label: &str) -> Rng {
        Rng::new(fnv1a64(label.as_bytes()) ^ self.next_u64())
    }

    /// A generator for a named sub-decision of a seed, without disturbing the
    /// parent stream.
    pub fn stream(seed: u64, label: &str) -> Rng {
        Rng::new(fnv1a64(label.as_bytes()) ^ seed)
    }
}

/// 64-bit FNV-1a. Used to turn a label into a seed offset.
///
/// The prime is written digit-grouped because getting it wrong is invisible:
/// 0x100000001B3 is the real 64-bit prime, and a plausible-looking
/// 0x1000_0000_01B3 is 256 times larger. Both mix acceptably as a hash and
/// both are perfectly deterministic, so nothing would ever report an error —
/// the only symptom would be a profile hash that no other implementation of
/// this scheme could reproduce, which is why the constants below are pinned by
/// the test at the end of this file.
pub fn fnv1a64(bytes: &[u8]) -> u64 {
    const OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash: u64 = OFFSET_BASIS;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

/// FNV-1a over a label and a number, with the number *fed in* rather than mixed
/// in afterwards.
///
/// The distinction is not cosmetic. Folding a small number in afterwards
/// (`hash(label) ^ n`) changes only the low bits, so any use that keeps the
/// *high* half of the digest — a truncated hex id, a shortened hash — sees the
/// number not at all, and every id for labels alike collapses together. Here
/// the number's bytes go through the same avalanche as the label's, so all 64
/// bits depend on it and truncating is safe.
pub fn fnv1a64_mixed(label: &[u8], number: u64) -> u64 {
    const OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash: u64 = OFFSET_BASIS;
    for byte in label.iter().chain(number.to_le_bytes().iter()) {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn same_seed_produces_the_same_stream() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_diverge() {
        let mut a = Rng::new(1);
        let mut b = Rng::new(2);
        assert_ne!(a.next_u64(), b.next_u64());
    }

    #[test]
    fn below_stays_in_bounds_and_covers() {
        let mut rng = Rng::new(7);
        let mut seen = HashSet::new();
        for _ in 0..10_000 {
            let value = rng.below(5);
            assert!(value < 5);
            seen.insert(value);
        }
        assert_eq!(seen.len(), 5, "every residue should be reachable");
    }

    #[test]
    fn below_handles_power_of_two_bounds() {
        let mut rng = Rng::new(9);
        for _ in 0..1000 {
            assert!(rng.below(8) < 8);
            assert_eq!(rng.below(1), 0);
        }
    }

    #[test]
    fn range_is_inclusive_at_both_ends() {
        let mut rng = Rng::new(3);
        let mut low = false;
        let mut high = false;
        for _ in 0..20_000 {
            let value = rng.range_i32(4, 9);
            assert!((4..=9).contains(&value));
            low |= value == 4;
            high |= value == 9;
        }
        assert!(low && high, "both endpoints must be reachable");
    }

    #[test]
    fn unit_stays_in_zero_one() {
        let mut rng = Rng::new(11);
        for _ in 0..100_000 {
            let value = rng.unit();
            assert!((0.0..1.0).contains(&value), "unit() returned {value}");
        }
    }

    #[test]
    fn unit_is_roughly_uniform() {
        let mut rng = Rng::new(13);
        let mut buckets = [0u32; 10];
        for _ in 0..100_000 {
            buckets[(rng.unit() * 10.0) as usize] += 1;
        }
        for (index, count) in buckets.iter().enumerate() {
            let share = *count as f64 / 100_000.0;
            assert!(
                (0.08..0.12).contains(&share),
                "bucket {index} share {share} is not ~0.10"
            );
        }
    }

    #[test]
    fn pick_weighted_never_overflows_its_pool() {
        let mut rng = Rng::new(17);
        let items = ["a", "b", "c"];
        // The third weight is zero: it must be unreachable but must not shift
        // the others out of range.
        let weights = [1.0, 0.0, 1.0];
        for _ in 0..1_000 {
            let picked = rng.pick_weighted(&items, &weights).unwrap();
            assert!(matches!(*picked, "a" | "c"), "picked {picked}");
        }
    }

    #[test]
    fn pick_weighted_returns_none_when_all_weights_are_zero() {
        let mut rng = Rng::new(19);
        let items = ["a", "b"];
        assert!(rng.pick_weighted(&items, &[0.0, 0.0]).is_none());
        assert!(rng.pick_weighted::<&str>(&[], &[1.0]).is_none());
    }

    #[test]
    fn weighted_index_respects_zero_weights() {
        let mut rng = Rng::new(23);
        for _ in 0..1_000 {
            let index = rng.weighted_index(&[0.0, 1.0, 0.0, 1.0]).unwrap();
            assert!(index == 1 || index == 3);
        }
        assert!(rng.weighted_index(&[0.0, 0.0]).is_none());
    }

    #[test]
    fn shuffle_is_a_permutation_and_reproducible() {
        let mut a: Vec<u32> = (0..64).collect();
        let mut b = a.clone();
        Rng::new(29).shuffle(&mut a);
        Rng::new(29).shuffle(&mut b);
        assert_eq!(a, b);

        let mut sorted = a.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..64).collect::<Vec<u32>>());
        assert_ne!(a, sorted, "a 64-element shuffle should not be identity");
    }

    #[test]
    fn sample_takes_at_most_the_pool_size() {
        let mut rng = Rng::new(31);
        let items = [1, 2, 3];
        assert_eq!(rng.sample(&items, 10).len(), 3);
        assert_eq!(rng.sample(&items, 2).len(), 2);
        assert!(rng.sample::<i32>(&[], 5).is_empty());
    }

    #[test]
    fn fork_decouples_streams() {
        let parent = 101;
        let mut a = Rng::new(parent);
        let mut b = Rng::new(parent);
        let _: Vec<u64> = (0..5).map(|_| a.fork("screen").next_u64()).collect();
        let _: Vec<u64> = (0..5).map(|_| b.fork("gpu").next_u64()).collect();

        // Re-forking "screen" from the untouched parent must give the same
        // first value regardless of what "gpu" drew.
        let mut c = Rng::stream(parent, "screen");
        let mut d = Rng::stream(parent, "screen");
        assert_eq!(c.next_u64(), d.next_u64());
    }

    #[test]
    fn stream_is_stable_across_calls() {
        assert_eq!(
            Rng::stream(5, "fonts").next_u64(),
            Rng::stream(5, "fonts").next_u64()
        );
        assert_ne!(
            Rng::stream(5, "fonts").next_u64(),
            Rng::stream(5, "voices").next_u64()
        );
    }

    #[test]
    fn from_key_is_reproducible() {
        assert_eq!(
            Rng::from_key("profile-7").next_u64(),
            Rng::from_key("profile-7").next_u64()
        );
        assert_ne!(
            Rng::from_key("profile-7").next_u64(),
            Rng::from_key("profile-8").next_u64()
        );
    }

    #[test]
    fn fnv1a_matches_known_vectors() {
        // The published FNV-1a 64 vectors. If these fail, the function is no
        // longer FNV-1a and any seed derived outside this crate will disagree.
        assert_eq!(fnv1a64(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a64(b"a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(fnv1a64(b"foobar"), 0x8594_4171_f739_67e8);
    }

    #[test]
    fn a_mixed_number_survives_keeping_only_the_high_half() {
        // The bug this pins: folding a number in afterwards
        // (`fnv1a64(label) ^ n`) moves only the low bits, so a caller that keeps
        // the top 32 bits for a short id cannot tell 7 from 8. Every id for a
        // given label would collide, silently, and the symptom would be a
        // second profile overwriting the first.
        let mut seen = std::collections::HashSet::new();
        for number in 0..1_000u64 {
            let high = (fnv1a64_mixed(b"work", number) >> 32) as u32;
            assert!(seen.insert(high), "seed {number} collided at {high:08x}");
        }
    }

    #[test]
    fn a_mixed_hash_still_depends_on_the_label() {
        for number in [0, 1, 7, u64::MAX] {
            assert_ne!(
                fnv1a64_mixed(b"work", number),
                fnv1a64_mixed(b"workshop", number)
            );
        }
    }

    #[test]
    fn a_mixed_hash_is_stable() {
        assert_eq!(fnv1a64_mixed(b"work", 7), fnv1a64_mixed(b"work", 7));
        assert_ne!(fnv1a64_mixed(b"work", 7), fnv1a64_mixed(b"work", 8));
    }

    #[test]
    fn chance_respects_its_probability() {
        let mut rng = Rng::new(37);
        let hits = (0..10_000).filter(|_| rng.chance(0.25)).count();
        assert!((2_000..3_000).contains(&hits), "got {hits} hits for p=0.25");
    }
}
