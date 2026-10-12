// Servidor mínimo y sin dependencias: sirve el frontend compilado (dist/) y guarda cada grupo como un JSON en disco.
//   GET  /api/g/:id[?since=N]   -> {rev, data} | 304 si no hay revisión nueva | 404
//   PUT  /api/g/:id             -> crea el grupo con {data} (409 si ya existe)
//   POST /api/g/:id/patch       -> aplica {patch} sobre la versión actual y devuelve {rev, data}
// Variables: PORT (3000), HOST (127.0.0.1), DATA_DIR (./data), DIST_DIR (./dist), MAX_GROUPS (200),
//   IDLE_MS (0): si es mayor que 0, el proceso sale solo tras ese tiempo sin pedidos
// Si systemd entrega el socket (LISTEN_FDS), escucha ahí y se ignoran PORT y HOST.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { applyPatch, normalize } from './shared.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '127.0.0.1'
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'))
const DIST_DIR = path.resolve(process.env.DIST_DIR ?? path.join(root, 'dist'))
const MAX_GROUPS = Number(process.env.MAX_GROUPS ?? 200)
const IDLE_MS = Number(process.env.IDLE_MS ?? 0)
const MAX_BODY = 512 * 1024

const ID = /^[A-Za-z0-9_-]{16,64}$/
fs.mkdirSync(DATA_DIR, { recursive: true })

// ---- almacenamiento: un archivo por grupo. Todo es síncrono, así que no hay carreras entre pedidos. ----
const file = (id) => path.join(DATA_DIR, `${id}.json`)

function readGroup(id) {
  try {
    return JSON.parse(fs.readFileSync(file(id), 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

function writeGroup(id, doc) {
  const tmp = `${file(id)}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(doc))
  fs.renameSync(tmp, file(id)) // atómico: nunca queda un archivo a medias
}

// ---- helpers HTTP ----
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req, res) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        if (size - c.length <= MAX_BODY) {
          res.setHeader('Connection', 'close')
          reject(new HttpError(413, 'Demasiado grande'))
        }
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new HttpError(400, 'JSON inválido'))
      }
    })
    req.on('error', reject)
  })
}

// ---- API ----
async function api(req, res, url) {
  const m = url.pathname.match(/^\/api\/g\/([^/]+)(\/patch)?$/)
  if (!m || !ID.test(m[1])) throw new HttpError(404, 'No existe')
  const [, id, isPatch] = m

  if (req.method === 'GET' && !isPatch) {
    const doc = readGroup(id)
    if (!doc) throw new HttpError(404, 'Grupo inexistente')
    if (url.searchParams.get('since') === String(doc.rev)) {
      res.writeHead(304, { 'Cache-Control': 'no-store' })
      return res.end()
    }
    return json(res, 200, { rev: doc.rev, data: doc.data })
  }

  if (req.method === 'PUT' && !isPatch) {
    const data = normalize((await readBody(req, res)).data)
    if (!data) throw new HttpError(400, 'Datos inválidos')
    if (readGroup(id)) throw new HttpError(409, 'Ya existe')
    if (fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).length >= MAX_GROUPS) throw new HttpError(403, 'Límite de grupos')
    const doc = { rev: 1, data }
    writeGroup(id, doc)
    return json(res, 201, doc)
  }

  if (req.method === 'POST' && isPatch) {
    const { patch } = await readBody(req, res)
    if (typeof patch !== 'object' || patch === null) throw new HttpError(400, 'Parche inválido')
    const doc = readGroup(id)
    if (!doc) throw new HttpError(404, 'Grupo inexistente')
    const data = applyPatch(doc.data, patch)
    if (JSON.stringify(data) !== JSON.stringify(doc.data)) {
      doc.rev += 1
      doc.data = data
      writeGroup(id, doc)
    }
    return json(res, 200, { rev: doc.rev, data: doc.data })
  }

  throw new HttpError(405, 'Método no permitido')
}

// ---- frontend estático. `npm run build` deja .br/.gz al lado de cada archivo; acá solo se sirven (cero CPU de compresión). ----
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método no permitido')
  let rel
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    throw new HttpError(400, 'URL inválida')
  }
  let target = path.join(DIST_DIR, rel)
  if (target !== DIST_DIR && !target.startsWith(DIST_DIR + path.sep)) throw new HttpError(403, 'Prohibido')

  let stat = fs.statSync(target, { throwIfNoEntry: false })
  if (!stat?.isFile()) {
    // Cualquier ruta sin extensión cae en la app; un archivo con extensión que no existe es un 404
    if (path.extname(rel)) throw new HttpError(404, 'No existe')
    target = path.join(DIST_DIR, 'index.html')
    stat = fs.statSync(target, { throwIfNoEntry: false })
    if (!stat) throw new HttpError(404, 'Falta dist/: ejecutá npm run build')
  }

  const headers = {
    'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream',
    'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    ETag: `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`,
    Vary: 'Accept-Encoding',
  }
  if (req.headers['if-none-match'] === headers.ETag) {
    res.writeHead(304, headers)
    return res.end()
  }

  const accept = req.headers['accept-encoding'] ?? ''
  let source = target
  for (const [enc, ext] of [['br', '.br'], ['gzip', '.gz']]) {
    if (accept.includes(enc) && fs.existsSync(target + ext)) {
      source = target + ext
      headers['Content-Encoding'] = enc
      break
    }
  }
  headers['Content-Length'] = fs.statSync(source).size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  pipeline(fs.createReadStream(source), res, () => {})
}

// ---- apagado por inactividad: con IDLE_MS > 0 el proceso sale solo tras ese tiempo sin pedidos (systemd lo vuelve a levantar) ----
let idleTimer
function stop() {
  server.close(() => process.exit(0))
  server.closeIdleConnections()
  setTimeout(() => process.exit(0), 1000).unref()
}
function touch() {
  if (!IDLE_MS) return
  clearTimeout(idleTimer)
  idleTimer = setTimeout(stop, IDLE_MS)
}

const server = http.createServer(async (req, res) => {
  touch()
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer') // la URL lleva el id del grupo
  res.setHeader('X-Robots-Tag', 'noindex')
  try {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.startsWith('/api/')) await api(req, res, url)
    else serveStatic(req, res, url)
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e)
    if (!res.headersSent) json(res, e.status ?? 500, { error: e.status ? e.message : 'Error interno' })
  }
})

server.requestTimeout = 15_000
server.headersTimeout = 10_000
server.keepAliveTimeout = 5_000
// Con activación por socket, systemd entrega el socket ya abierto como descriptor 3
const fromSystemd = Number(process.env.LISTEN_FDS) >= 1 && process.env.LISTEN_PID === String(process.pid)
const listening = () => {
  touch()
  console.log(fromSystemd ? `guardias en el socket de systemd (datos: ${DATA_DIR})` : `guardias en http://${HOST}:${PORT} (datos: ${DATA_DIR})`)
}
if (fromSystemd) server.listen({ fd: 3 }, listening)
else server.listen(PORT, HOST, listening)

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, stop)
