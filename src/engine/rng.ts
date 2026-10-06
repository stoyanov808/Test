/** Serializable xorshift32. State is advanced only by mathematical engine transitions. */
export interface RandomGenerator {
  state: number; next():number; integer(max:number):number; chance(probability:number):boolean;
}
export type RandomFactory=(state:number)=>RandomGenerator;
export const defaultRandomFactory:RandomFactory=state=>new SeededRandom(state);
export class SeededRandom implements RandomGenerator {
  state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 0x6d2b79f5; }
  next(): number {
    let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0; return this.state / 0x1_0000_0000;
  }
  integer(max: number): number { return Math.floor(this.next() * max); }
  chance(probability: number): boolean { return this.next() < probability; }
}
