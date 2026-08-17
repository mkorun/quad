// Differential test: quad's output and js-beautify's output must be semantically identical —
// same elements in the same order, same attributes, same text/comment content — even though the
// two tools format (indentation, line-wrapping) differently on purpose. This is the automated
// guarantee that quad's normalization never silently drops or alters DOM-relevant content;
// layout differences are expected and are not what this test checks. See extract.ts for exactly
// what's compared and why (including the documented script/style exclusion — js-beautify
// actively restructures JS/CSS, quad documents preserving it verbatim, so comparing that content
// against js-beautify isn't meaningful).
//
// Fixtures are either the same real-article fixture already embedded for the crash-resistance
// tests, or purpose-built synthetic pages exercising quad's documented feature set (void
// elements, inline elements, raw content, SVG, attribute quoting, tag-name casing, ...). No
// external/private content — this suite runs the same for anyone who clones the repo.

import { describe, it, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { html as jsBeautify } from 'js-beautify'
import htmlFmt from '../index.ts'
import { extractEvents, type SemanticEvent } from './extract.ts'

const JSB_OPTS = { indent_size: 2, wrap_line_length: 120, end_with_newline: false }

const fixturesDir = join(import.meta.dir, 'fixtures')
const sharedFixture = join(import.meta.dir, '../tests/fixtures/hmd-testseite.html')

const SAMPLES: [string, string][] = [
	['hmd-testseite (shared with crash-resistance tests)', sharedFixture],
	...readdirSync(fixturesDir)
		.filter(f => f.endsWith('.html'))
		.map((f): [string, string] => [f, join(fixturesDir, f)]),
]

const describeEvent = (e: SemanticEvent): string => {
	if (e.type === 'open') return `<${e.tag} ${e.attrs.map(([n, v]) => `${n}="${v}"`).join(' ')}>`
	if (e.type === 'close') return `</${e.tag}>`
	if (e.type === 'comment') return `<!-- ${e.value} -->`
	return JSON.stringify(e.value)
}

describe('semantic extractor regressions', () => {

	it('distinguishes whitespace adjacent to inline void and phrasing elements', async () => {
		expect(await extractEvents('<body><p>a<img src="x">b</p></body>')).not.toEqual(
			await extractEvents('<body><p>a <img src="x">b</p></body>'),
		)
		expect(await extractEvents('<body><p><em>x</em>y</p></body>')).not.toEqual(
			await extractEvents('<body><p><em>x</em>\ny</p></body>'),
		)
		expect(await extractEvents('<body><p>a<!-- c --><em>b</em></p></body>')).not.toEqual(
			await extractEvents('<body><p>a <!-- c --><em>b</em></p></body>'),
		)
	})

	it('does not throw on out-of-range numeric character references', async () => {
		await expect(extractEvents('<body><p>&#x110000;</p></body>')).resolves.toBeArray()
		expect(await extractEvents('<body><p>&#0;</p></body>')).toEqual(
			await extractEvents('<body><p>\uFFFD</p></body>'),
		)
	})

})

describe('quad vs. js-beautify — semantic equality', () => {

	for (const [name, path] of SAMPLES) {
		it(`${name}: identical DOM-relevant content`, async () => {
			const html = readFileSync(path, 'utf-8')
			const quadOut = htmlFmt(html)
			const jsbOut = jsBeautify(html, JSB_OPTS)

			const quadEvents = await extractEvents(quadOut)
			const jsbEvents = await extractEvents(jsbOut)

			if (quadEvents.length !== jsbEvents.length) {
				const minLen = Math.min(quadEvents.length, jsbEvents.length)
				let divergeAt = minLen
				for (let i = 0; i < minLen; i++) {
					if (JSON.stringify(quadEvents[i]) !== JSON.stringify(jsbEvents[i])) { divergeAt = i; break }
				}
				const context = (arr: SemanticEvent[], at: number) =>
					arr.slice(Math.max(0, at - 2), at + 3).map(describeEvent).join('\n  ')
				throw new Error(
					`Event count differs: quad=${quadEvents.length} js-beautify=${jsbEvents.length}, ` +
					`first divergence near index ${divergeAt}\nquad:\n  ${context(quadEvents, divergeAt)}\n` +
					`js-beautify:\n  ${context(jsbEvents, divergeAt)}`,
				)
			}

			for (let i = 0; i < quadEvents.length; i++) {
				const q = quadEvents[i]!
				const j = jsbEvents[i]!
				if (JSON.stringify(q) !== JSON.stringify(j)) {
					throw new Error(
						`Divergence at event ${i}:\n  quad:        ${describeEvent(q)}\n  js-beautify: ${describeEvent(j)}`,
					)
				}
			}

			expect(quadEvents.length).toBeGreaterThan(0)
		})

		it(`${name}: quad output is idempotent`, () => {
			const html = readFileSync(path, 'utf-8')
			const once = htmlFmt(html)
			expect(htmlFmt(once)).toBe(once)
		})
	}

})
