// Mulberry32 (Tommy Ettinger, 2017), the one random source of the generator. The state is wrapped to 32 bits at every
// step, so the stream is the same however far a run goes; properties.test.ts checks it against a BigInt version.

export interface Random {
	// The next 32-bit value of the stream
	next(): number
	// An integer from 0 up to, not including, `limit`
	below(limit: number): number
	chance(probability: number): boolean
	pick<T>(list: readonly T[]): T
}

export const createRandom = (seed: number): Random => {
	let state = seed | 0
	const next = (): number => {
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return (t ^ (t >>> 14)) >>> 0
	}
	const below = (limit: number): number => Math.floor((next() / 4294967296) * limit)
	return {
		next,
		below,
		chance: probability => next() / 4294967296 < probability,
		pick: list => {
			if (list.length === 0) throw new Error('pick from an empty list')
			return list[below(list.length)]!
		},
	}
}
