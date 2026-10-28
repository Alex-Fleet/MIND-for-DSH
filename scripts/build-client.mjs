import fs from 'node:fs'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  logLevel: 'silent',
})

const body = result.outputFiles[0]?.text
if (body === undefined) throw new Error('esbuild produced no client bundle')

const wrapped = `window.__ModuleLoader__.load({
  id: "mind-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  }
});
`

fs.mkdirSync('lib', { recursive: true })
fs.writeFileSync('lib/client.js', wrapped, 'utf8')
console.log(`[mind-dsh] wrote lib/client.js (${Buffer.byteLength(wrapped)} bytes)`)
