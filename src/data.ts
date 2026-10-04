// Lógica de datos compartida entre el cliente y el servidor (server/index.mjs la importa tal cual,
// Node ≥ 22.18 ejecuta TypeScript borrando los tipos). Solo sintaxis "borrable": nada de enums ni imports de paquetes.
import type { AppData, Person, Quirofano, Settings, Shifts } from './types'

export const defaultSettings: Settings = {
  quirofanoOrder: [],
  autoHolidays: true,
  customHolidays: [],
  countFrom: null,
}

export const emptyData = (): AppData => ({ people: [], shifts: {}, quirofano: {}, settings: { ...defaultSettings } })

/** Cambios entre dos versiones. Se aplican por clave (no pisan lo que otra persona cambió en otro día/persona). */
export type Patch = {
  people?: { upsert: Person[]; remove: string[] }
  shifts?: { set: Shifts; del: string[] }
  quirofano?: { set: Quirofano; del: string[] }
  settings?: Partial<Settings>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Obj => (isObj(v) ? v : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Valida y limpia datos de afuera (archivo importado, request). null si no tienen la forma mínima. */
export function normalize(raw: unknown): AppData | null {
  if (!isObj(raw) || !Array.isArray(raw.people) || !isObj(raw.shifts)) return null
  const people: Person[] = []
  const seen = new Set<string>()
  for (const p of raw.people) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || seen.has(p.id)) continue
    seen.add(p.id)
    people.push({ id: p.id, name: p.name.slice(0, 80), color: typeof p.color === 'string' ? p.color : '#ec4899', active: p.active !== false })
  }
  const shifts: Shifts = {}
  for (const [d, v] of Object.entries(raw.shifts)) if (DATE.test(d) && (v === null || typeof v === 'string')) shifts[d] = v
  const quirofano: Quirofano = {}
  for (const [d, v] of Object.entries(obj(raw.quirofano))) if (DATE.test(d) && typeof v === 'string') quirofano[d] = v
  const s = obj(raw.settings)
  const settings: Settings = {
    quirofanoOrder: arr(s.quirofanoOrder).filter((x): x is string => typeof x === 'string'),
    autoHolidays: typeof s.autoHolidays === 'boolean' ? s.autoHolidays : defaultSettings.autoHolidays,
    customHolidays: arr(s.customHolidays)
      .filter((h): h is Obj => isObj(h) && typeof h.date === 'string' && DATE.test(h.date))
      .map((h) => ({ date: h.date, name: typeof h.name === 'string' ? h.name.slice(0, 80) : 'Feriado' })),
    countFrom: typeof s.countFrom === 'string' && DATE.test(s.countFrom) ? s.countFrom : null,
  }
  return { people, shifts, quirofano, settings }
}

/** Quita referencias a personas que ya no existen (p. ej. alguien la borró mientras otra persona le asignaba una guardia). */
function dropDangling(d: AppData): AppData {
  const ids = new Set(d.people.map((p) => p.id))
  return {
    people: d.people,
    shifts: Object.fromEntries(Object.entries(d.shifts).map(([k, v]) => [k, v !== null && !ids.has(v) ? null : v])),
    quirofano: Object.fromEntries(Object.entries(d.quirofano).filter(([, v]) => ids.has(v))),
    settings: { ...d.settings, quirofanoOrder: d.settings.quirofanoOrder.filter((id) => ids.has(id)) },
  }
}

export function applyPatch(doc: AppData, patch: Patch): AppData {
  const people = new Map(doc.people.map((p) => [p.id, p]))
  for (const id of arr(patch.people?.remove)) people.delete(id as string)
  for (const p of arr(patch.people?.upsert)) if (isObj(p) && typeof p.id === 'string') people.set(p.id, p as Person)

  const shifts: Shifts = { ...doc.shifts }
  for (const [d, v] of Object.entries(obj(patch.shifts?.set))) if (DATE.test(d)) shifts[d] = v
  for (const d of arr(patch.shifts?.del)) delete shifts[d as string]

  const quirofano: Quirofano = { ...doc.quirofano }
  for (const [d, v] of Object.entries(obj(patch.quirofano?.set))) if (DATE.test(d)) quirofano[d] = v
  for (const d of arr(patch.quirofano?.del)) delete quirofano[d as string]

  const merged = { people: [...people.values()], shifts, quirofano, settings: { ...doc.settings, ...obj(patch.settings) } }
  return dropDangling(normalize(merged) ?? doc)
}

function mapDiff<V>(base: Record<string, V>, cur: Record<string, V>): { set: Record<string, V>; del: string[] } | null {
  const set: Record<string, V> = {}
  for (const [k, v] of Object.entries(cur)) if (!(k in base) || base[k] !== v) set[k] = v
  const del = Object.keys(base).filter((k) => !(k in cur))
  return Object.keys(set).length || del.length ? { set, del } : null
}

/** Qué cambió de `base` a `cur`; null si nada. */
export function diff(base: AppData, cur: AppData): Patch | null {
  const patch: Patch = {}

  const baseById = new Map(base.people.map((p) => [p.id, p]))
  const curIds = new Set(cur.people.map((p) => p.id))
  const upsert = cur.people.filter((p) => !same(baseById.get(p.id), p))
  const remove = base.people.filter((p) => !curIds.has(p.id)).map((p) => p.id)
  if (upsert.length || remove.length) patch.people = { upsert, remove }

  const shifts = mapDiff(base.shifts, cur.shifts)
  if (shifts) patch.shifts = shifts
  const quirofano = mapDiff(base.quirofano, cur.quirofano)
  if (quirofano) patch.quirofano = quirofano

  const settings: Obj = {}
  for (const k of Object.keys(cur.settings) as (keyof Settings)[]) {
    if (!same(base.settings[k], cur.settings[k])) settings[k] = cur.settings[k]
  }
  if (Object.keys(settings).length) patch.settings = settings

  return Object.keys(patch).length ? patch : null
}
