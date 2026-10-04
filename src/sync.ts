import { create } from 'zustand'
import { applyPatch, diff, emptyData, normalize } from './data'
import { GROUP, newGroupId } from './group'
import { useStore } from './store'
import type { AppData } from './types'

/**
 * Sincronización con el servidor, solo en modo grupo (?group=<id>).
 *
 * El cliente recuerda la última versión que vio del servidor (`base`). Lo que cambió desde ahí (`diff`) se manda como
 * parche por clave: dos personas editando días distintos no se pisan. El servidor responde con el documento ya
 * fusionado. Sin cambios locales, solo pregunta cada tanto si hay una revisión nueva (barato: responde 304).
 */

export type SyncStatus = 'loading' | 'synced' | 'saving' | 'offline' | 'notfound'
export const useSyncStatus = create<{ status: SyncStatus }>(() => ({ status: 'loading' }))
const setStatus = (status: SyncStatus) => useSyncStatus.setState({ status })

const API = `${import.meta.env.BASE_URL}api/g`
const POLL_MS = 15_000
const PUSH_DELAY_MS = 700

const snap = (): AppData => {
  const { people, shifts, quirofano, settings } = useStore.getState()
  return { people, shifts, quirofano, settings }
}

type SyncState = { rev: number; base: AppData }
const KEY = `guardias-sync-${GROUP}`
const load = (): SyncState => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const base = normalize(s?.base)
    if (base && typeof s.rev === 'number') return { rev: s.rev, base }
  } catch { /* sin copia local utilizable */ }
  return { rev: 0, base: emptyData() }
}

let state: SyncState
let busy = false
let timer: ReturnType<typeof setTimeout> | undefined

const request = (path: string, init?: RequestInit) =>
  fetch(`${API}/${GROUP}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000), ...init })

async function tick() {
  if (busy || !GROUP) return
  busy = true
  clearTimeout(timer)
  try {
    const sent = snap()
    const patch = diff(state.base, sent)
    const res = patch
      ? await request('/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch }) })
      : await request(`?since=${state.rev}`)

    if (res.status === 404) return setStatus('notfound')
    if (res.status === 304) return setStatus('synced')
    if (!res.ok) throw new Error(String(res.status))

    const { rev, data } = (await res.json()) as { rev: number; data: AppData }
    const server = normalize(data)!
    // Lo que se editó mientras viajaba el pedido se reaplica sobre la versión nueva y sale en el próximo envío
    const pending = diff(sent, snap())
    state = { rev, base: server }
    localStorage.setItem(KEY, JSON.stringify(state))
    const next = pending ? applyPatch(server, pending) : server
    useStore.setState(next)
    setStatus(pending ? 'saving' : 'synced')
    if (pending) timer = setTimeout(tick, 0)
  } catch {
    setStatus('offline')
  } finally {
    busy = false
  }
}

export function startSync() {
  if (!GROUP) return
  state = load()
  useStore.subscribe(() => {
    if (useSyncStatus.getState().status === 'notfound') return
    if (diff(state.base, snap())) {
      setStatus('saving')
      clearTimeout(timer)
      timer = setTimeout(tick, PUSH_DELAY_MS)
    }
  })
  setInterval(() => document.visibilityState === 'visible' && tick(), POLL_MS)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick())
  addEventListener('online', tick)
  tick()
}

/** Crea un grupo nuevo en el servidor con estos datos y devuelve el enlace para compartirlo. */
export async function createGroup(data: AppData): Promise<string> {
  const id = newGroupId()
  const res = await fetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  if (!res.ok) throw new Error(res.status === 403 ? 'El servidor llegó a su límite de grupos.' : `Error ${res.status}`)
  const url = new URL(location.href)
  url.search = `?group=${id}`
  return url.toString()
}
