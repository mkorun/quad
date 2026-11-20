// The properties the gate checks without a parser or a browser (README "The contract").

import type { HtmlFmtOptions } from '../index.ts'
import type { Fact } from './generator.ts'

// hadley's two calls, then the rest of the gate's matrix
export const optionSets: HtmlFmtOptions[] = [
	{},
	{ stripComments: true },
	{ lineWrap: 40, indentation: '    ' },
	{ lineWrap: 20 },
	{ indentation: '\t' },
]

// The size the output may not pass: every line's left margin is at most lineWrap / 2
export const outputBound = (input: string, lineWrap: number): number => input.length * (lineWrap / 4 + 7) + 2 * lineWrap

// The number of spaces and tabs each line starts with
export const leftMargins = (text: string): number[] => text.split('\n').map(line => /^[ \t]*/.exec(line)![0].length)

// Says why a left margin of `output` is wider than the contract allows, or null. A margin quad wrote is at most
// lineWrap / 2; a wider one must be a line of the input, copied with a verbatim region.
export const marginViolation = (input: string, output: string, lineWrap: number): string | null => {
	const allowed = Math.max(Math.floor(lineWrap / 2), ...leftMargins(input))
	const widest = Math.max(...leftMargins(output))
	return widest > allowed ? `a left margin of ${widest}, allowed are ${allowed}` : null
}

const isWhitespace = (code: number): boolean => code === 32 || code === 10 || code === 9 || code === 13

// Says where `output` is not the document's facts in their order, with between them what each gap asks for and
// nothing else, or null. With `stripComments` the comments are not in the output.
export const factViolation = (output: string, facts: Fact[], stripComments: boolean): string | null => {
	let position = 0
	for (const [index, fact] of facts.entries()) {
		if (stripComments && fact.comment) continue
		const gapStart = position
		while (fact.gap !== 'glued' && position < output.length && isWhitespace(output.charCodeAt(position))) position++
		const at = `fact ${index} ${JSON.stringify(fact.text)} (${fact.gap}) at ${position}: `
		if (fact.gap === 'apart' && position === gapStart) return at + 'no whitespace before it'
		if (!output.startsWith(fact.text, position)) return at + 'found ' + JSON.stringify(output.slice(gapStart, position + 40))
		position += fact.text.length
	}
	while (position < output.length && isWhitespace(output.charCodeAt(position))) position++
	return position === output.length ? null : `after the last fact: ${JSON.stringify(output.slice(position, position + 40))}`
}
