/**
 * Seedable PRNG (mulberry32). Deterministic given a seed, fast enough for
 * gameplay. NOT cryptographic.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Normalize to unsigned 32-bit.
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9; // golden-ratio fallback
  }

  /** Float in [0, 1). */
  nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). */
  nextInt(maxExclusive: number): number {
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  /** Uniformly pick an element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick on empty array");
    return arr[this.nextInt(arr.length)]!;
  }

  /** Returns a new shuffled copy of `arr` (Fisher-Yates). */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  static random(): Rng {
    return new Rng(Math.floor(Math.random() * 0xffffffff));
  }
}
