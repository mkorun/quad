// The browser oracle of the gate, called from check.sh:  bun oracle/check.ts
//
// It asks a browser whether quad kept its contract: for an input and its output the DOM must be equal in the normal
// form N and the rendered text must be equal (README "The contract"). It runs
//   - the oracle's own tests: the false alarms of cases.ts pass, the findings as 0.1.5 wrote them fail, and so do the
//     findings of the review of the rewrite as the rewrite wrote them then, and faults written by hand that the
//     oracle did not see when it was reviewed;
//   - the same findings, the fixtures of this repository and a sample of D1 with what quad writes now: all pass;
//   - the known differences of cases.ts with what quad writes now: each still fails;
//   - the list test: quad's block elements are the ones the browser's default stylesheet lays out as blocks.
// With stripComments the output must also have lost the comments outside verbatim content, all but the ones the
// case says it keeps; the comments inside verbatim content are part of the normal form and must be equal.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import htmlFmt from '../index.ts'
import { htmlElementNames, isBlockForQuad } from '../tests/element-names.ts'
import { conformingDocument, createRandom } from '../tests/generator.ts'
import { optionSets } from '../tests/properties.ts'
import { runInBrowser } from './browser.ts'
import {
	blindSpots, blocksNotShown, falseAlarms, findings, findingsInTheBrowser, knownDifferences, reviewFindings,
	type OracleCase,
} from './cases.ts'
import recorded from './outputs-0.1.5.json' with { type: 'json' }
import expectedViolations from './expected-violations.json' with { type: 'json' }
import { violationsFor, matchesExpectedViolations, type Violation } from './compare.ts'

const SEED = 20261119
const SAMPLE = 120

interface Pair {
	// Who wrote the output
	writer: string
	name: string
	input: string
	output: string
	stripComments: boolean
	// With stripComments, the comments outside verbatim content that the output must still have
	keeps: string[]
	expected: 'pass' | 'fail'
}

const root = join(import.meta.dir, '..')
const pairs: Pair[] = []
const add = (writer: string, { id, input, options, keeps = [] }: OracleCase, output: string, expected: 'pass' | 'fail') =>
	pairs.push({ writer, name: id, input, output, stripComments: options.stripComments === true, keeps, expected })
const QUAD_015 = "0.1.5's output", REVIEWED = "the reviewed rewrite's output", BY_HAND = 'a fault written by hand', NOW = "quad's output"
const now = (oracleCase: OracleCase): string => htmlFmt(oracleCase.input, oracleCase.options)

const outputOf015 = (id: string): string => {
	const output = (recorded as Record<string, string>)[id]
	if (output === undefined) throw new Error(`outputs-0.1.5.json has no output for ${JSON.stringify(id)}; write it with oracle/record.ts`)
	return output
}

for (const falseAlarm of falseAlarms) add(QUAD_015, falseAlarm, outputOf015(falseAlarm.id), 'pass')
for (const finding of findingsInTheBrowser) {
	if (!findings.some(({ id }) => id.startsWith(finding + ' '))) throw new Error(`cases.ts has no case for ${finding}`)
}
for (const finding of findings) {
	add(QUAD_015, finding, outputOf015(finding.id), 'fail')
	add(NOW, finding, now(finding), 'pass')
}
for (const finding of reviewFindings) {
	add(REVIEWED, finding, finding.before, 'fail')
	add(NOW, finding, now(finding), 'pass')
}
for (const blindSpot of blindSpots) {
	add(BY_HAND, blindSpot, blindSpot.faulty, 'fail')
	add(NOW, blindSpot, now(blindSpot), 'pass')
}
for (const known of knownDifferences) add(NOW, known, now(known), 'fail')

// The comments of the fixtures and of D1 are all of the kind stripComments removes: none is kept
const fixtures = [
	join(root, 'tests/fixtures/hmd-testseite.html'),
	...readdirSync(join(root, 'differential/fixtures')).sort().map(file => join(root, 'differential/fixtures', file)),
]
for (const path of fixtures) {
	const input = readFileSync(path, 'utf-8')
	const name = path.slice(root.length + 1)
	for (const options of optionSets) {
		const output = htmlFmt(input, options)
		if (output === input) {
			throw new Error(`${name} ${JSON.stringify(options)}: fixture expected to be formatted came back unchanged`)
		}
		add(NOW, { id: `${name} ${JSON.stringify(options)}`, input, options }, output, 'pass')
	}
}

const random = createRandom(SEED)
for (let index = 0; index < SAMPLE; index++) {
	const input = conformingDocument(random).source
	for (const options of optionSets) add(NOW, { id: `D1 document ${index} ${JSON.stringify(options)}`, input, options }, htmlFmt(input, options), 'pass')
}

const documents = [...new Set(pairs.flatMap(pair => [pair.input, pair.output]))]
const indexOf = new Map(documents.map((document, index) => [document, index]))
const names = htmlElementNames()
const started = performance.now()
const result = await runInBrowser(documents, names)
const seconds = ((performance.now() - started) / 1000).toFixed(1)

const firstDifference = (a: string, b: string): string => {
	let at = 0
	while (at < a.length && at < b.length && a[at] === b[at]) at++
	return `at ${at}: ${JSON.stringify(a.slice(Math.max(0, at - 30), at + 50))} against ${JSON.stringify(b.slice(Math.max(0, at - 30), at + 50))}`
}

// Exact observations of the known negative pairs, computed here and recorded only by an explicit maintenance
// command. Review changes to this file: recording a new difference does not establish that it is acceptable.
const recordViolations = process.argv.includes('--record-violations')
const recordedViolations: Record<string, unknown> = expectedViolations
const observedViolations: Record<string, Violation[]> = {}

const failures: string[] = []
const counts = new Map<string, number>()
for (const pair of pairs) {
	const found = violationsFor(result.documents[indexOf.get(pair.input)!]!, result.documents[indexOf.get(pair.output)!]!, pair.stripComments, pair.keeps)
	const reason = found.map(({ check, before, after }) => check + ' ' + firstDifference(before, after)).join('; ')
	const group = `${pair.writer}, expected to ${pair.expected}`
	counts.set(group, (counts.get(group) ?? 0) + 1)
	const name = `${pair.writer}, ${pair.name}`
	if (pair.expected === 'pass' && found.length > 0) failures.push(`${name}: ${reason}`)
	if (pair.expected === 'fail') {
		if (name in observedViolations) throw new Error(`duplicate negative pair: ${name}`)
		observedViolations[name] = found
		if (found.length === 0) failures.push(`${name}: the oracle sees no difference`)
		if (!recordViolations) {
			const expected = recordedViolations[name]
			if (expected === undefined) throw new Error(`no expected violation for ${name}; review and record it with --record-violations`)
			if (!matchesExpectedViolations(expected, found)) failures.push(`${name}: differs from its recorded violations: ${reason}`)
		}
	}
	if (process.argv.includes('--verbose') && pair.expected === 'fail') console.log(`${name}: ${reason}`)
}

// The list test: a block for quad is a block for the browser or, where cases.ts says so, not shown at all; every
// other name sits in a line or is not shown
let blocks = 0
for (const name of names) {
	const found = result.displays[name]
	if (found === undefined) throw new Error(`the browser gave no display for <${name}>`)
	const expected = !isBlockForQuad(name) ? ['inline', 'hidden'] : blocksNotShown.includes(name) ? ['hidden'] : ['block']
	if (isBlockForQuad(name)) blocks++
	if (!expected.includes(found.box)) {
		failures.push(`<${name}> is ${isBlockForQuad(name) ? 'a block' : 'inline'} for quad, the browser gives it display: ${found.display}`)
	}
}
for (const name of blocksNotShown) {
	if (!names.includes(name) || !isBlockForQuad(name)) failures.push(`<${name}> in blocksNotShown of cases.ts is no block element of quad`)
}

console.log(`oracle: ${documents.length} documents in one browser, ${seconds} s`)
for (const [group, count] of counts) console.log(`oracle: ${count} pairs of ${group}`)
console.log(`oracle: ${names.length} element names against the default stylesheet, ${blocks} of them blocks for quad`)
if (failures.length > 0) {
	for (const failure of failures.slice(0, 40)) console.error('oracle: FAIL ' + failure)
	console.error(`oracle: ${failures.length} failures`)
	process.exit(1)
}
if (recordViolations) {
	writeFileSync(join(import.meta.dir, 'expected-violations.json'), JSON.stringify(observedViolations, null, '\t') + '\n')
	console.log('oracle: wrote expected-violations.json; review each recorded violation')
} else {
	for (const name of Object.keys(recordedViolations)) {
		if (!(name in observedViolations)) throw new Error(`recorded violation has no negative pair: ${name}`)
	}
}
console.log('oracle: all as expected')
