import { describe, it, expect, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IDLE_MS = 300
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Procesos y carpetas de la prueba en curso, para limpiarlos siempre
let child = null
let dataDir = null

afterEach(() => {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  child = null
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  dataDir = null
})

function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer()
    s.once('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })
}

// Arranca el servidor y espera a que conteste. Con idleMs undefined no define IDLE_MS.
async function start(idleMs) {
  const port = await freePort()
  dataDir = mkdtempSync(join(tmpdir(), 'guardias-idle-'))
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir }
  delete env.IDLE_MS
  if (idleMs !== undefined) env.IDLE_MS = String(idleMs)
  const proc = spawn(process.execPath, ['server/index.mjs'], {
    cwd: REPO,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  child = proc
  let stderr = ''
  proc.stderr.on('data', (d) => { stderr += d })
  const exited = new Promise((ok) => {
    proc.once('exit', (code, signal) => ok({ code, signal, at: Date.now() }))
  })
  // Un 404 de un grupo inexistente prueba que el servidor atiende pedidos
  const ping = async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/g/aaaaaaaaaaaaaaaa`)
    await res.arrayBuffer()
    return res.status
  }
  const waitExit = (ms) => Promise.race([exited, sleep(ms).then(() => null)])
  const deadline = Date.now() + 1500
  for (;;) {
    try {
      expect(await ping()).toBe(404)
      break
    } catch (e) {
      if (proc.exitCode !== null || Date.now() > deadline) {
        throw new Error(`el servidor no contestó: ${e.message}\n${stderr}`)
      }
      await sleep(25)
    }
  }
  return { proc, ping, waitExit }
}

describe('apagado por inactividad', () => {
  it('sale solo tras IDLE_MS sin pedidos', async () => {
    const { ping, waitExit } = await start(IDLE_MS)
    expect(await ping()).toBe(404)
    const lastRequest = Date.now()
    const out = await waitExit(1000)
    expect(out, 'el proceso no salió en 1 s').not.toBeNull()
    expect(out.code).toBe(0)
    // Holgura de 100 ms por la precisión de los timers
    expect(out.at - lastRequest).toBeGreaterThanOrEqual(IDLE_MS - 100)
  })

  it('cada pedido reinicia el reloj', async () => {
    const { ping, waitExit } = await start(IDLE_MS)
    const statuses = []
    let exitedEarly = false
    waitExit(10 * 60 * 1000).then((o) => { if (o) exitedEarly = true })
    // Tres veces IDLE_MS de pedidos cada 150 ms
    const until = Date.now() + 3 * IDLE_MS
    let lastRequest = Date.now()
    while (Date.now() < until) {
      statuses.push(await ping())
      lastRequest = Date.now()
      expect(exitedEarly, 'salió con pedidos en curso').toBe(false)
      await sleep(150)
    }
    expect(statuses.length).toBeGreaterThanOrEqual(4)
    expect(statuses.every((s) => s === 404)).toBe(true)
    const out = await waitExit(1000)
    expect(out, 'el proceso no salió en 1 s tras el último pedido').not.toBeNull()
    expect(out.code).toBe(0)
    expect(out.at - lastRequest).toBeGreaterThanOrEqual(IDLE_MS - 100)
  })

  it('sin IDLE_MS no se apaga solo', async () => {
    const { proc, ping, waitExit } = await start(undefined)
    const out = await waitExit(800)
    expect(out).toBeNull()
    expect(proc.exitCode).toBeNull()
    expect(await ping()).toBe(404)
  })
})
