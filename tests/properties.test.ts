// The generated part of the gate: fixed seeds, fixed counts, no clock and no browser. Every input of the three
// domains is formatted with each option set of the matrix; the stress families show how the output grows.

import { describe, it, expect } from 'bun:test'
import { createHash } from 'node:crypto'
import htmlFmt from '../index.ts'
import {
	arbitraryString, brokenDocument, conformingDocument, nestedInMath, nestedInPre, nestedInSvg, stressFamilies, type ConformingDocument,
} from './generator.ts'
import { createRandom } from './prng.ts'
import { factViolation, marginViolation, optionSets, outputBound } from './properties.ts'

const SEED = 20261119
const COUNTS = { D1: 400, D2: 400, D3: 1500 }

const random = createRandom(SEED)
const conforming: ConformingDocument[] = Array.from({ length: COUNTS.D1 }, () => conformingDocument(random))
const domains: Record<string, string[]> = {
	D1: conforming.map(document => document.source),
	D2: Array.from({ length: COUNTS.D2 }, () => brokenDocument(random)),
	D3: Array.from({ length: COUNTS.D3 }, () => arbitraryString(random)),
}

// Every violation of the properties that need no knowledge of the input: total, idempotent, the output bound
const violations = (inputs: string[]): string[] => {
	const found: string[] = []
	for (const [index, input] of inputs.entries()) {
		for (const options of optionSets) {
			const where = `input ${index} ${JSON.stringify(options)}: `
			let output: string
			try {
				output = htmlFmt(input, options)
			} catch (error) {
				found.push(where + 'throws ' + String(error))
				continue
			}
			if (htmlFmt(output, options) !== output) found.push(where + 'not idempotent')
			const lineWrap = options.lineWrap ?? 120
			if (output.length > outputBound(input, lineWrap)) found.push(where + `${output.length} characters from ${input.length}`)
			const margin = marginViolation(input, output, lineWrap)
			if (margin !== null) found.push(where + margin)
		}
	}
	return found
}

describe('the generator', () => {

	it('draws from Mulberry32 as a BigInt version of it does', () => {
		// With this seed the state passes 32 bits at the first step, where a version that does not wrap goes wrong
		for (const seed of [0, 1, SEED, 0xffffffff]) {
			const fast = createRandom(seed)
			let state = BigInt(seed)
			const mask = 0xffffffffn
			for (let draw = 0; draw < 50000; draw++) {
				state = (state + 0x6d2b79f5n) & mask
				let t = ((state ^ (state >> 15n)) * (1n | state)) & mask
				t = ((t + (((t ^ (t >> 7n)) * (61n | t)) & mask)) & mask) ^ t
				expect(fast.next()).toBe(Number((t ^ (t >> 14n)) & mask))
			}
		}
	})

	it('gives the same inputs on every run', () => {
		const digest = createHash('sha256')
		for (const name of Object.keys(domains)) for (const input of domains[name]!) digest.update(Buffer.from(input, 'utf16le')).update('\0\0\0')
		expect(digest.digest('hex')).toBe('645a11fe12f54b65c4377faaa437786ee53852179778ec79f4af161d8fac667a')
	})

	it('writes each category of the contract into D1', () => {
		const all = domains.D1!.join('\n').toLowerCase()
		for (const needle of ['<div', '<span', '<meta', '<title', '<textarea', '<script', '<style', '<xmp', '<iframe', '<noscript',
			'<plaintext', '<pre', '<listing', '<svg', '<math', '<br', '<!--', '<!doctype', '<my-element', '<table', '<select', '<template']) {
			expect(all).toContain(needle)
		}
	})

	it('last review: writes numeric and named wrap boundaries into D1 and the oracle sample', () => {
		const sample = domains.D1!.slice(0, 120).join('')
		for (const reference of ['&#8203;', '&#x200B;', '&ZeroWidthSpace;', '&#x4E00;', '&#19968;']) expect(sample).toContain(reference)
	})

	it('D1: metadata before body with head tags omitted must still be formatted', () => {
		const sample = conforming.slice(0, 120).filter(({ source }) =>
			!/<head[\s>]/i.test(source) && /<(?:title|meta|link|script|style|base)[\s>][^]*<body[\s>]/i.test(source),
		)
		expect(sample.length).toBeGreaterThan(0)
		for (const { source, facts } of sample) {
			// These facts reject preserving the original tag spelling and whitespace.
			expect(factViolation(source, facts, false)).not.toBeNull()
			for (const options of optionSets) {
				expect(factViolation(htmlFmt(source, options), facts, options.stripComments === true)).toBeNull()
			}
		}
	})

	it('puts verbatim regions inside each other into D1', () => {
		// The shapes of R-3 and R-4 (tests/findings.test.ts): on the documents without them the facts held
		for (const content of [...nestedInPre, ...nestedInSvg, ...nestedInMath]) {
			expect([content, domains.D1!.some(input => input.includes(content))]).toEqual([content, true])
		}
	})

	it('puts a doctype next to other markup that renders nothing, as all an element holds, into D2', () => {
		// The shape of R-1 (tests/findings.test.ts): on the inputs without it quad formatted the same twice
		const reached = domains.D2!.filter(input =>
			(input.match(/<div>(?:<[!?/][^<>]*>){2,}<\/div>/g) ?? []).some(element => element.includes('<!doctype') || element.includes('<!DOCTYPE')),
		)
		expect(reached.length).toBeGreaterThanOrEqual(10)
	})

})

describe('properties on the generated inputs', () => {

	for (const name of Object.keys(domains)) {
		it(`${name}: total, idempotent and within the output bound`, () => {
			expect(violations(domains[name]!)).toEqual([])
		})
	}

	it('D1: the output is the facts of the document, parted as the contract says', () => {
		const found: string[] = []
		for (const [index, document] of conforming.entries()) {
			for (const options of optionSets) {
				const violation = factViolation(htmlFmt(document.source, options), document.facts, options.stripComments === true)
				if (violation !== null) found.push(`input ${index} ${JSON.stringify(options)}: ${violation}`)
			}
		}
		expect(found).toEqual([])
	})

	it('D1: the facts catch a formatter that changes a token', () => {
		const { source, facts } = conforming[0]!
		const output = htmlFmt(source)
		expect(factViolation(output, facts, false)).toBeNull()
		expect(factViolation(output.replace(/"/, "'"), facts, false)).not.toBeNull()
		expect(factViolation(output + 'x', facts, false)).not.toBeNull()
		expect(factViolation('', facts, false)).not.toBeNull()
	})

})

describe('growth on the stress families', () => {

	// The bound is on size: the output of each family stays within the output bound at every size, so it grows
	// linearly. Time is bounded only by the timeout, set far above what the largest input takes.
	for (const [name, family] of Object.entries(stressFamilies)) {
		it(`${name}: the output stays within the bound at 2,000, 8,000 and 32,000`, () => {
			for (const size of [2000, 8000, 32000]) {
				const input = family(size)
				for (const options of optionSets) {
					const lineWrap = options.lineWrap ?? 120
					const output = htmlFmt(input, options)
					expect(output.length).toBeLessThanOrEqual(outputBound(input, lineWrap))
					expect(marginViolation(input, output, lineWrap)).toBeNull()
				}
			}
		}, 20000)
	}

})
