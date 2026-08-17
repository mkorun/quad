// Reproducible performance comparison against js-beautify, the closest tool in the same weight
// class (see README "Design scope"). Uses only fixtures shipped in this repo — no external or
// private content — so the numbers here can be reproduced by anyone who clones it:
//
//   bun install && bun run bench

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import htmlFmtOld from '../index.ts'
import { html as jsBeautify } from 'js-beautify'

const nextPath = join(import.meta.dir, '../index.next.ts')
const hasNext = existsSync(nextPath)
const htmlFmtNext = hasNext ? (await import(nextPath)).default : null

const fixturesDir = join(import.meta.dir, '../differential/fixtures')
const sharedFixturePath = join(import.meta.dir, '../tests/fixtures/hmd-testseite.html')

const SAMPLES: Record<string, string> = {
	'hmd-testseite': readFileSync(sharedFixturePath, 'utf-8'),
}
for (const f of readdirSync(fixturesDir)) {
	if (f.endsWith('.html')) SAMPLES[f.replace(/\.html$/, '')] = readFileSync(join(fixturesDir, f), 'utf-8')
}

const ITERS = 500

const bench = (fn: () => void): number | string => {
	try {
		for (let i = 0; i < 20; i++) fn() // warmup
		const t0 = performance.now()
		for (let i = 0; i < ITERS; i++) fn()
		return (performance.now() - t0) / ITERS * 1000 // µs
	} catch (e: any) {
		return 'ERROR: ' + e.message.slice(0, 40)
	}
}

console.log('\nquad vs. js-beautify — reproducible benchmark (repo fixtures only)')
console.log('Bun v' + Bun.version + (hasNext ? ' · A/B: index.ts vs. index.next.ts' : '') + '\n')

const headerCols = hasNext
	? 'Sample                       quad (cur)      quad (next)     js-beautify'
	: 'Sample                       quad            js-beautify'
console.log('─'.repeat(headerCols.length))
console.log(headerCols)
console.log('─'.repeat(headerCols.length))

let totalOld = 0, totalNext = 0, totalJsb = 0, validCount = 0

const fmtCell = (v: number | string, width: number) =>
	(typeof v === 'number' ? v.toFixed(1) + ' µs' : v).padStart(width)

for (const [label, html] of Object.entries(SAMPLES)) {
	const qOld  = bench(() => htmlFmtOld(html))
	const qNext = hasNext ? bench(() => htmlFmtNext(html)) : null
	const jsb   = bench(() => jsBeautify(html, { indent_size: 2, wrap_line_length: 120, end_with_newline: false }))

	let row = label.padEnd(29) + fmtCell(qOld, 12)
	if (hasNext) row += fmtCell(qNext as number | string, 16)
	row += fmtCell(jsb, 16)

	if (typeof qOld === 'number' && typeof jsb === 'number') {
		totalOld += qOld; totalJsb += jsb; validCount++
		if (hasNext && typeof qNext === 'number') totalNext += qNext
	}
	console.log(row)
}

console.log('─'.repeat(headerCols.length))
if (validCount > 0) {
	let row = 'Ø'.padEnd(29) + fmtCell(totalOld / validCount, 12)
	if (hasNext) row += fmtCell(totalNext / validCount, 16)
	row += fmtCell(totalJsb / validCount, 16)
	console.log(row)
	console.log(`\nquad is ~${(totalJsb / totalOld).toFixed(1)}x faster than js-beautify on these fixtures.`)
}
console.log()
