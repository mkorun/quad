import { describe, expect, it } from 'bun:test'
import htmlFmt from '../index.ts'
// The six common names whose decoded characters can permit a wrap. Other names stay uncertain.
const entities = [
	{ name: 'lt', codepoint: 60, semicolonOptional: true },
	{ name: 'gt', codepoint: 62, semicolonOptional: true },
	{ name: 'amp', codepoint: 38, semicolonOptional: true },
	{ name: 'quot', codepoint: 34, semicolonOptional: true },
	{ name: 'apos', codepoint: 39, semicolonOptional: false },
	{ name: 'nbsp', codepoint: 160, semicolonOptional: true },
]

describe('common named references at a wrap', () => {
	for (const { name, codepoint, semicolonOptional } of entities) {
		for (const suffix of semicolonOptional ? [';', ''] : [';']) {
			const reference = '&' + name + suffix
			it(`decodes ${reference} at either edge, also across inline tags`, () => {
				const contents = [
					`aaaaaaaaaaaaaaaaaaaa${reference} b`,
					`aaaaaaaaaaaaaaaaaaaa ${reference}!`,
					`<span>aaaaaaaaaaaaaaaaaaaa${reference}</span> <span>b</span>`,
					`aaaaaaaaaaaaaaaaaaaa <span>${reference}!</span>`,
				]
				for (const content of contents) {
					const output = htmlFmt(`<p>${content}</p>`, { lineWrap: 20 })
					const expectedContent = content.replace(' ', '\n  ')
					expect(output).toBe(`<p>\n  ${expectedContent}\n</p>`)
					const numeric = `&#${codepoint};`
					expect(output.replaceAll(reference, numeric)).toBe(
						htmlFmt(`<p>${content.replaceAll(reference, numeric)}</p>`, { lineWrap: 20 }),
					)
					expect(htmlFmt(output, { lineWrap: 20 })).toBe(output)
				}
			})
		}
		if (!semicolonOptional) {
			it(`keeps the conservative rule for &${name} without its required semicolon`, () => {
				const content = `aaaaaaaaaaaaaaaaaaaa&${name} b`
				expect(htmlFmt(`<p>${content}</p>`, { lineWrap: 20 })).toContain(content)
			})
		}
	}
	it('keeps other names conservative, including the five U+200B names and common prefixes', () => {
		for (const name of ['copy', 'LT', 'AMP', 'ltimes', 'amplify', 'unknown',
			'ZeroWidthSpace', 'NegativeVeryThinSpace', 'NegativeThinSpace', 'NegativeMediumSpace', 'NegativeThickSpace']) {
			for (const suffix of [';', '']) {
				const reference = '&' + name + suffix
				for (const content of [
					`aaaaaaaaaaaaaaaaaaaa${reference} b`,
					`aaaaaaaaaaaaaaaaaaaa ${reference}b`,
					`<span>aaaaaaaaaaaaaaaaaaaa${reference}</span> <span>b</span>`,
					`aaaaaaaaaaaaaaaaaaaa <span>${reference}b</span>`,
				]) {
					expect(htmlFmt(`<p>${content}</p>`, { lineWrap: 20 })).toContain(content)
				}
			}
		}
	})
	it('uses the literal trailing character after a decoded reference', () => {
		for (const reference of ['&lt;', '&ZeroWidthSpace;']) {
			const text = `aaaaaaaaaaaaaaaaaaaa${reference}x`
			expect(htmlFmt(`<p>${text} b</p>`, { lineWrap: 20 })).toContain(text + '\n')
		}
	})
})


describe('release review: encoded whitespace at a word edge', () => {
	for (const code of [32, 9, 10, 13, 12]) {
		for (const reference of [`&#${code};`, `&#${code}`, `&#x${code.toString(16)}`]) {
			it(`keeps the space next to ${reference}, including the mirror and inline tags`, () => {
				const long = 'aaaaaaaaaaaaaaaaaaaa'
				const contents = [
					`${long}&#8203;${reference} b`,
					`${long}\u200b${reference} b`,
					`${long} ${reference}&#8203;b`,
					`${long} <span>${reference}&#8203;b</span>`,
					`${long}<wbr>${reference} b`,
					`<span>${long}&#8203;</span>${reference} b`,
					`${long}&#8203;<i>${reference}</i> b`,
					`${long}&#8203;&Tab; b`,
				]
				for (const content of contents) {
					const output = htmlFmt(`<p>${content}</p>`, { lineWrap: 20 })
					expect(output).toBe(`<p>\n  ${content}\n</p>`)
					expect(htmlFmt(output, { lineWrap: 20 })).toBe(output)
				}
			})
		}
	}
})


it('release review: decodes the last reference of a word with two references', () => {
	const content = 'AT&amp;T-aaaaaaaaaaaaaaa&#8203; b'
	const output = htmlFmt(`<p>${content}</p>`, { lineWrap: 20 })
	expect(output).toBe(`<p>\n  ${content}\n</p>`)
	expect(htmlFmt(output, { lineWrap: 20 })).toBe(output)
})
