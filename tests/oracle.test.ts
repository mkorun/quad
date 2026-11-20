import { describe, expect, it } from 'bun:test'
import { violationsFor, matchesExpectedViolations } from '../oracle/compare.ts'
import type { BrowserDocument } from '../oracle/browser.ts'

const document = (normalForm: string, text: string): BrowserDocument => ({
	normalForm, normalFormWithoutComments: normalForm, text, textWithoutComments: text, comments: [],
})

describe('last review: negative oracle pairs identify their violation', () => {
	it('rejects a DOM corruption in place of the named rendered-text violation', () => {
		const input = document('same DOM', 'a b')
		const expected = violationsFor(input, document('same DOM', 'ab'), false, [])
		expect(matchesExpectedViolations(expected, violationsFor(input, document('different DOM', 'a b'), false, []))).toBe(false)
		expect(matchesExpectedViolations(expected, violationsFor(input, document('same DOM', 'ab'), false, []))).toBe(true)
	})

	it('rejects additional corruption even after the first recorded difference in the same property', () => {
		const input = document('original', 'text')
		const expected = violationsFor(input, document('changed prefix; intact suffix', 'text'), false, [])
		const found = violationsFor(input, document('changed prefix; corrupt suffix', 'text'), false, [])
		expect(matchesExpectedViolations(expected, found)).toBe(false)
	})

	it('rejects an additional failed check and a negative pair that now passes', () => {
		const input = document('original', 'text')
		const expected = violationsFor(input, document('changed', 'text'), false, [])
		expect(matchesExpectedViolations(expected, violationsFor(input, document('changed', 'changed text'), false, []))).toBe(false)
		expect(matchesExpectedViolations(expected, [])).toBe(false)
	})

	it('keeps a missing processing-instruction node visible with stripComments', () => {
		const input = document('instruction node present', 'ab')
		const output = document('instruction node absent', 'ab')
		expect(violationsFor(input, output, true, []).map(({ check }) => check)).toEqual(['DOM'])
	})

})
