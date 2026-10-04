// Genera server/shared.js a partir de src/data.ts (la lógica de fusión que comparten cliente y servidor), borrando los tipos.
// Así el servidor corre con JavaScript puro, sin el soporte de TypeScript de Node (que suma ~25 MB de RAM).
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const src = fs.readFileSync('src/data.ts', 'utf8')
fs.writeFileSync('server/shared.js', `// GENERADO por scripts/build-server.mjs desde src/data.ts: no editar\n${stripTypeScriptTypes(src)}`)
