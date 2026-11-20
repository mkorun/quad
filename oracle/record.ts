// Writes outputs-0.1.5.json: what a build of quad 0.1.5 gives for every case of cases.ts.
//
//   mkdir /tmp/quad-0.1.5 && git show 1efb52c:dist/index.js > /tmp/quad-0.1.5/index.js
//   bun oracle/record.ts /tmp/quad-0.1.5/index.js

import { join, resolve } from 'node:path'
import { falseAlarms, findings } from './cases.ts'

const [modulePath, ...rest] = process.argv.slice(2)
if (modulePath === undefined || rest.length > 0) {
	console.error('usage: bun oracle/record.ts <index.js of a build of quad 0.1.5>')
	process.exit(2)
}
const oldHtmlFmt: unknown = (await import(resolve(modulePath))).default
if (typeof oldHtmlFmt !== 'function') throw new Error(`${modulePath} has no default export that is a function`)

const outputs: Record<string, string> = {}
for (const { id, input, options } of [...falseAlarms, ...findings]) {
	if (id in outputs) throw new Error(`two cases are called ${JSON.stringify(id)}`)
	outputs[id] = oldHtmlFmt(input, options)
}
await Bun.write(join(import.meta.dir, 'outputs-0.1.5.json'), JSON.stringify(outputs, null, '\t') + '\n')
console.log(`${Object.keys(outputs).length} outputs written`)
