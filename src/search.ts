import { addDaysTo, dayOfWeek, mondayOf, toDay } from './dates'
import {
  PRE_QUIROFANO_BONUS,
  QUIROFANO_AVOID_OFFSETS,
  QUIROFANO_PREFER_OFFSETS,
  SPACING_CAP_DAYS,
  categoriesOf,
  inWindow,
  rankCandidates,
} from './fairness'
import type { HolidayLookup } from './holidays'
import type { Person, Quirofano, Settings, Shifts } from './types'

// ---------------------------------------------------------------------------
// Evaluador rápido del puntaje (`Score` de fairness.ts) sobre enteros
// ---------------------------------------------------------------------------
//
// `scoreShifts` recuenta todo desde cero con textos y objetos, y eso alcanza para evaluar un reparto. Para buscar el mejor
// hay que evaluar decenas de miles, así que acá el problema se compila una vez a arreglos de enteros (cada fecha
// cargada es un "casillero") y, al cambiar quién tiene un casillero, solo se vuelven a contar las dos personas
// afectadas. Tiene que dar exactamente el mismo puntaje que `scoreShifts`: es lo que se verifica al probarlo.

// Posiciones de cada contador dentro de la fila de una persona
const TOTAL = 0
const SAT = 1
const SUN = 2
const HOL = 3
const BUSY_WEEKENDS = 4
const CONSECUTIVE = 5
const BACK_TO_BACK = 6
const SANDWICH = 7
const IN_QUIROFANO = 8
const PRE = 9
const SPACING = 10
const BUSY_LONG = 11
const ROW = 12
// Columnas de reparto parejo; las primeras cuatro (total, sábado, domingo, feriado) son las primeras de la fila
const SHARE_COLUMNS = 6

// Puntaje como números para comparar rápido: las cosas malas (en el orden de BAD_CATEGORIES), el reparto + premio, y el espaciado
const SCORE_SIZE = 6
const FAIR_AT = 4
const SPACING_AT = 5

/** Igual que `compareScores(a, b) > 0` */
function better(a: Float64Array, b: Float64Array) {
  for (let i = 0; i < FAIR_AT; i++) if (a[i] !== b[i]) return a[i] < b[i]
  const fair = a[FAIR_AT] - b[FAIR_AT]
  if (Math.abs(fair) > 1e-9) return fair > 0
  return a[SPACING_AT] > b[SPACING_AT]
}

/** Igual que `evenness`, con -1 en lugar de null */
function evenness(values: Float64Array, n: number) {
  let total = 0
  for (let i = 0; i < n; i++) total += values[i]
  if (n < 2 || total === 0) return -1
  const mean = total / n
  let dev = 0
  for (let i = 0; i < n; i++) dev += Math.abs(values[i] - mean)
  const r = total % n
  const q = Math.floor(total / n)
  const minDev = r * (q + 1 - mean) + (n - r) * (mean - q)
  const maxDev = (2 * total * (n - 1)) / n
  if (maxDev - minDev < 1e-9) return 1
  return Math.max(0, Math.min(1, 1 - (dev - minDev) / (maxDev - minDev)))
}

export type Search = {
  /** Cantidad de fechas a repartir */
  size: number
  /** Puntaje (en el formato interno) de repartir las fechas así: `assignment[i]` = índice de la persona de `free[i]` */
  scoreOf(assignment: ArrayLike<number>): Float64Array
  /** Mejor reparto que encuentra a partir de `initial` */
  optimize(initial: ArrayLike<number>, iterations: number, seed?: number): Int8Array
}

/**
 * Compila el problema: repartir `free` entre `active`, con el resto de `shifts` fijo. Todas las fechas de `free` tienen
 * que estar cargadas en `shifts`.
 */
export function createSearch(
  active: Person[],
  shifts: Shifts,
  quirofano: Quirofano,
  settings: Settings,
  holiday: HolidayLookup,
  free: string[],
): Search {
  const P = active.length
  const personIndex = new Map(active.map((p, i) => [p.id, i]))
  const keys = Object.keys(shifts).sort()
  const N = keys.length
  const slotOfDay = new Map<number, number>()
  const day = new Int32Array(N)
  const week = new Int32Array(N)
  const inside = new Uint8Array(N)
  const weekend = new Uint8Array(N)
  const kind = new Uint8Array(N) // 1 sábado, 2 domingo, 4 feriado
  const owner = new Int8Array(N).fill(-1)
  const firstMonday = toDay(mondayOf(keys[0]))
  const plannedWeeks = new Set<number>()
  keys.forEach((date, s) => {
    day[s] = toDay(date)
    slotOfDay.set(day[s], s)
    week[s] = Math.round((toDay(mondayOf(date)) - firstMonday) / 7)
    inside[s] = inWindow(date, settings) ? 1 : 0
    const dow = dayOfWeek(date)
    weekend[s] = dow === 0 || dow === 6 ? 1 : 0
    kind[s] = (dow === 6 ? 1 : 0) | (dow === 0 ? 2 : 0) | (holiday(date) ? 4 : 0)
    if (weekend[s] && inside[s]) plannedWeeks.add(week[s])
    const id = shifts[date]
    if (id && personIndex.has(id)) owner[s] = personIndex.get(id)!
  })
  const planned = plannedWeeks.size
  const freeSlots = Int32Array.from(free, (d) => slotOfDay.get(toDay(d))!)

  const longWeeks = new Set<string>()
  for (const date of keys) {
    if (!inWindow(date, settings)) continue
    const dow = dayOfWeek(date)
    if (dow === 5 || dow === 6 || dow === 0) longWeeks.add(mondayOf(date))
    else if (dow === 1) longWeeks.add(addDaysTo(mondayOf(date), -7))
  }
  // Findes largos (viernes o lunes feriado): `blockOf[s]` es el bloque al que pertenece el casillero (-1 = ninguno)
  const blockOf = new Int32Array(N).fill(-1)
  let longWeekends = 0
  for (const w of longWeeks) {
    const fri = addDaysTo(w, 4)
    const mon = addDaysTo(w, 7)
    if (!holiday(fri) && !holiday(mon)) continue
    const block = [...(holiday(fri) ? [fri] : []), addDaysTo(w, 5), addDaysTo(w, 6), ...(holiday(mon) ? [mon] : [])]
    const loaded = block.filter((d) => d in shifts && inWindow(d, settings))
    if (loaded.length === 0) continue
    for (const d of loaded) blockOf[slotOfDay.get(toDay(d))!] = longWeekends
    longWeekends++
  }
  const blockSeen = new Int32Array(longWeekends)
  let tick = 0

  // Cuántas veces cada casillero cuenta, para cada persona, alrededor de su quirófano (índice: persona * N + casillero)
  const avoid = new Uint8Array(P * N)
  const prefer = new Uint8Array(P * N)
  for (const [w, id] of Object.entries(quirofano)) {
    const p = personIndex.get(id)
    if (p === undefined || !inWindow(addDaysTo(w, 6), settings)) continue
    for (const offset of QUIROFANO_AVOID_OFFSETS) {
      const s = slotOfDay.get(toDay(addDaysTo(w, offset)))
      if (s !== undefined) avoid[p * N + s]++
    }
    for (const offset of QUIROFANO_PREFER_OFFSETS) {
      if (offset < 0 && quirofano[addDaysTo(w, -7)] === id) continue
      const date = addDaysTo(w, offset)
      const s = slotOfDay.get(toDay(date))
      if (s !== undefined && inWindow(date, settings)) prefer[p * N + s]++
    }
  }

  const rows = new Int32Array(P * ROW)
  const saved = new Int32Array(2 * ROW)

  /** Vuelve a contar todo de la persona `p` */
  function recount(p: number) {
    if (p < 0) return
    const at = p * ROW
    let total = 0, sat = 0, sun = 0, hol = 0, busy = 0, consecutive = 0, backToBack = 0, sandwich = 0
    let minGap = SPACING_CAP_DAYS
    let lastDay = -1
    let lastBusyWeek = -2
    let inQuirofano = 0
    let pre = 0
    let busyLong = 0
    tick++
    const from = p * N
    for (let s = 0; s < N; s++) {
      if (owner[s] !== p) continue
      inQuirofano += avoid[from + s]
      if (!inside[s]) continue
      pre += prefer[from + s]
      total++
      const k = kind[s]
      if (k & 1) sat++
      if (k & 2) sun++
      if (k & 4) hol++
      if (lastDay >= 0) {
        const gap = day[s] - lastDay
        if (gap === 1) backToBack++
        else if (gap === 2) sandwich++
        if (gap < minGap) minGap = gap
      }
      lastDay = day[s]
      if (weekend[s] && week[s] !== lastBusyWeek) {
        busy++
        if (week[s] === lastBusyWeek + 1) consecutive++
        lastBusyWeek = week[s]
      }
      const block = blockOf[s]
      if (block >= 0 && blockSeen[block] !== tick) {
        blockSeen[block] = tick
        busyLong++
      }
    }
    rows[at + TOTAL] = total
    rows[at + SAT] = sat
    rows[at + SUN] = sun
    rows[at + HOL] = hol
    rows[at + BUSY_WEEKENDS] = busy
    rows[at + CONSECUTIVE] = consecutive
    rows[at + BACK_TO_BACK] = backToBack
    rows[at + SANDWICH] = sandwich
    rows[at + IN_QUIROFANO] = inQuirofano
    rows[at + PRE] = pre
    rows[at + SPACING] = minGap
    rows[at + BUSY_LONG] = busyLong
  }
  const recountAll = () => {
    for (let p = 0; p < P; p++) recount(p)
  }

  const values = new Float64Array(P)
  /** Puntaje del reparto actual (ver `categoryScores` y `scoreOf` de fairness.ts) */
  function evaluate(out: Float64Array) {
    let backToBack = 0, sandwich = 0, consecutive = 0, inQuirofano = 0, pre = 0, spacing = 0
    let anyWeekendWork = false
    for (let p = 0; p < P; p++) {
      const at = p * ROW
      backToBack += rows[at + BACK_TO_BACK]
      sandwich += rows[at + SANDWICH]
      consecutive += rows[at + CONSECUTIVE]
      inQuirofano += rows[at + IN_QUIROFANO]
      pre += rows[at + PRE]
      spacing += rows[at + SPACING]
      if (rows[at + BUSY_WEEKENDS] > 0) anyWeekendWork = true
    }
    // Columnas de reparto, en el orden de CATEGORIES: total, sábados, domingos, feriados, findes libres, findes largos libres
    let shares = 0
    let count = 0
    for (let column = 0; column < SHARE_COLUMNS; column++) {
      let hasData = false
      if (column < 4) for (let p = 0; p < P; p++) values[p] = rows[p * ROW + column]
      else if (column === 4) {
        for (let p = 0; p < P; p++) values[p] = planned - rows[p * ROW + BUSY_WEEKENDS]
        hasData = anyWeekendWork
      } else {
        for (let p = 0; p < P; p++) values[p] = longWeekends - rows[p * ROW + BUSY_LONG]
        hasData = longWeekends > 0
      }
      let share = evenness(values, P)
      // si todos están igual, es un reparto perfecto (no "sin datos") siempre que haya algo que repartir
      if (share < 0 && P > 1 && hasData) share = 1
      if (share >= 0) {
        shares += share
        count++
      }
    }
    out[0] = backToBack
    out[1] = sandwich
    out[2] = consecutive
    out[3] = inQuirofano
    out[FAIR_AT] = (count ? shares / count : 1) + PRE_QUIROFANO_BONUS * pre
    out[SPACING_AT] = spacing
  }

  const current = new Float64Array(SCORE_SIZE)
  const trial = new Float64Array(SCORE_SIZE)
  const saveRows = (a: number, b: number) => {
    for (let i = 0; i < ROW; i++) {
      if (a >= 0) saved[i] = rows[a * ROW + i]
      if (b >= 0) saved[ROW + i] = rows[b * ROW + i]
    }
  }
  const restoreRows = (a: number, b: number) => {
    for (let i = 0; i < ROW; i++) {
      if (a >= 0) rows[a * ROW + i] = saved[i]
      if (b >= 0) rows[b * ROW + i] = saved[ROW + i]
    }
  }

  /** Le pasa el casillero `s` a la persona `to` si el reparto mejora */
  function tryMove(s: number, to: number) {
    const from = owner[s]
    saveRows(from, to)
    owner[s] = to
    recount(from)
    recount(to)
    evaluate(trial)
    if (better(trial, current)) {
      current.set(trial)
      return true
    }
    owner[s] = from
    restoreRows(from, to)
    return false
  }

  /** Intercambia quién tiene los casilleros `s` y `t` si el reparto mejora */
  function trySwap(s: number, t: number) {
    const a = owner[s]
    const b = owner[t]
    saveRows(a, b)
    owner[s] = b
    owner[t] = a
    recount(a)
    recount(b)
    evaluate(trial)
    if (better(trial, current)) {
      current.set(trial)
      return true
    }
    owner[s] = a
    owner[t] = b
    restoreRows(a, b)
    return false
  }

  const F = freeSlots.length
  /** Aplica mejoras (cambiar una guardia de persona o intercambiar dos) hasta que ninguna mejore el reparto */
  function descend() {
    for (let pass = 0; pass < 50; pass++) {
      let improved = false
      for (let i = 0; i < F; i++) {
        const s = freeSlots[i]
        for (let to = 0; to < P; to++) if (owner[s] !== to && tryMove(s, to)) improved = true
      }
      for (let i = 0; i < F; i++) {
        for (let j = i + 1; j < F; j++) {
          const a = owner[freeSlots[i]]
          const b = owner[freeSlots[j]]
          if (a >= 0 && b >= 0 && a !== b && trySwap(freeSlots[i], freeSlots[j])) improved = true
        }
      }
      if (!improved) break
    }
  }

  const load = (assignment: ArrayLike<number>) => {
    for (let i = 0; i < F; i++) owner[freeSlots[i]] = assignment[i]
    recountAll()
  }

  return {
    size: F,
    scoreOf(assignment) {
      load(assignment)
      const out = new Float64Array(SCORE_SIZE)
      evaluate(out)
      return out
    },
    optimize(initial, iterations, seed = 1) {
      let state = seed >>> 0
      const random = () => {
        // mulberry32: mismo resultado en cualquier navegador y en cada corrida
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const best = new Int8Array(F)
      const bestScore = new Float64Array(SCORE_SIZE)
      const snapshot = () => {
        for (let i = 0; i < F; i++) best[i] = owner[freeSlots[i]]
        bestScore.set(current)
      }
      load(initial)
      evaluate(current)
      descend()
      snapshot()
      for (let it = 0; it < iterations; it++) {
        load(best)
        if (it % 5 === 4) {
          // de vez en cuando, empezar de cero
          for (let i = 0; i < F; i++) owner[freeSlots[i]] = Math.floor(random() * P)
        } else {
          // si no, sacudir unas pocas guardias del mejor reparto
          const shaken = 1 + Math.floor(random() * Math.min(5, F))
          for (let k = 0; k < shaken; k++) owner[freeSlots[Math.floor(random() * F)]] = Math.floor(random() * P)
        }
        recountAll()
        evaluate(current)
        descend()
        if (!better(bestScore, current)) snapshot()
      }
      return best
    },
  }
}

// ---------------------------------------------------------------------------
// Recomendaciones
// ---------------------------------------------------------------------------

/**
 * Cuántas veces se sacude el mejor reparto buscando uno mejor (ver `Search.optimize`). Cada vuelta cuesta como el cuadrado
 * de las fechas a repartir (se prueba intercambiar cada par), así que se reparte un presupuesto fijo de trabajo (unos
 * 40 ms en una computadora por cada unidad de `effort`) entre más o menos vueltas. Es por cantidad y no por tiempo para que
 * el resultado sea siempre el mismo con los mismos datos.
 */
const SEARCH_BUDGET = 60000
const searchIterations = (size: number, effort: number) =>
  Math.max(8, Math.min(100 * effort, Math.round((effort * SEARCH_BUDGET) / (size * size))))

/**
 * Propone asignaciones para las guardias sin asignar de `dates`.
 * Primero los días más "pesados" (fin de semana / feriado), después los comunes, y en cada paso
 * elige a la mejor candidata teniendo en cuenta lo ya propuesto. Después busca un reparto mejor del conjunto
 * (cambiando y intercambiando guardias propuestas y las de `movable`, ya cargadas, que también se pueden reacomodar)
 * y se queda con el de mejor puntaje. Devuelve lo propuesto para `dates` y, de `movable`, solo lo que cambia.
 * `effort` es cuánto buscar: 1 para lo que se recalcula con cada cambio, más para cuando se pide expresamente.
 */
export function suggestAssignments(
  dates: string[],
  people: Person[],
  shifts: Shifts,
  quirofano: Quirofano,
  settings: Settings,
  holiday: HolidayLookup,
  movable: string[] = [],
  effort = 1,
): Record<string, string> {
  const working: Shifts = { ...shifts }
  const result: Record<string, string> = {}
  const ordered = [...dates].sort(
    (a, b) => categoriesOf(b, holiday).length - categoriesOf(a, holiday).length || a.localeCompare(b),
  )
  for (const date of ordered) {
    const best = rankCandidates(date, people, working, quirofano, settings, holiday)[0]
    if (!best) break
    working[date] = best.person.id
    result[date] = best.person.id
  }

  const active = people.filter((p) => p.active)
  const free = [...ordered, ...movable.filter((d) => working[d])]
  if (active.length > 1 && free.length > 0) {
    const search = createSearch(active, working, quirofano, settings, holiday, free)
    const index = new Map(active.map((p, i) => [p.id, i]))
    const start = free.map((d) => index.get(working[d]!) ?? -1)
    const found = search.optimize(start, searchIterations(free.length, effort))
    free.forEach((d, i) => {
      if (found[i] >= 0) working[d] = active[found[i]].id
    })
  }
  for (const date of free) if (working[date] && (dates.includes(date) || working[date] !== shifts[date])) result[date] = working[date]!
  return result
}
