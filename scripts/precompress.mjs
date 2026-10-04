// Deja una versión .br y otra .gz de cada archivo de texto de dist/, para que el servidor no comprima nada en caliente.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const dist = path.resolve('dist')
const COMPRESSIBLE = /\.(html|js|css|svg|json)$/

for (const entry of fs.readdirSync(dist, { recursive: true, withFileTypes: true })) {
  const file = path.join(entry.parentPath, entry.name)
  if (!entry.isFile() || !COMPRESSIBLE.test(file)) continue
  const buf = fs.readFileSync(file)
  if (buf.length < 1024) continue
  fs.writeFileSync(`${file}.gz`, zlib.gzipSync(buf, { level: 9 }))
  fs.writeFileSync(
    `${file}.br`,
    zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }),
  )
}
