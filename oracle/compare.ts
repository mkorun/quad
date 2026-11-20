import type { BrowserDocument } from './browser.ts'

export interface Violation {
	check: 'DOM' | 'rendered text' | 'comments outside verbatim content'
	before: string
	after: string
}

// Keep the complete observations for each failed check. Matching only the first difference (or only the check
// name) would let an additional corruption elsewhere in a known-failing document pass unnoticed.
export const violationsFor = (input: BrowserDocument, output: BrowserDocument, stripComments: boolean, keeps: string[]): Violation[] => {
	const found: Violation[] = []
	const compare = (check: Violation['check'], before: string, after: string) => {
		if (before !== after) found.push({ check, before, after })
	}
	compare('DOM', input[stripComments ? 'normalFormWithoutComments' : 'normalForm'], output[stripComments ? 'normalFormWithoutComments' : 'normalForm'])
	compare('rendered text', input[stripComments ? 'textWithoutComments' : 'text'], output[stripComments ? 'textWithoutComments' : 'text'])
	if (stripComments) compare('comments outside verbatim content', JSON.stringify(keeps), JSON.stringify(output.comments))
	return found
}

export const matchesExpectedViolations = (expected: unknown, found: Violation[]): boolean =>
	found.length > 0 && JSON.stringify(expected) === JSON.stringify(found)
