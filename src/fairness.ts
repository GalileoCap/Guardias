import { addDaysTo, dayOfWeek, daysBetween, mondayOf, toDay } from './dates'
import type { HolidayLookup } from './holidays'
import type { Person, Quirofano, Settings, Shifts } from './types'

export type ShiftCategory = 'total' | 'saturday' | 'sunday' | 'holiday'
export type Category =
  | ShiftCategory
  | 'freeWeekends'
  | 'consecutive'
  | 'backToBack'
  | 'sandwich'
  | 'freeLongWeekends'

/** Métricas que se muestran y puntúan. `worse: 'low'` = en esa métrica lo malo es tener menos (el resto: lo malo es tener más). */
export const CATEGORIES: {
  key: Category
  label: string
  short: string
  hint: string
  worse?: 'low'
}[] = [
  { key: 'total', label: 'Total', short: 'Total', hint: 'Guardias en total' },
  { key: 'saturday', label: 'Sábados', short: 'Sáb', hint: 'Guardias en sábado' },
  { key: 'sunday', label: 'Domingos', short: 'Dom', hint: 'Guardias en domingo' },
  { key: 'holiday', label: 'Feriados', short: 'Feriados', hint: 'Guardias en feriado' },
  {
    key: 'freeWeekends',
    label: 'Findes libres',
    short: 'Libres',
    hint: 'Findes (sábado y domingo) con guardias cargadas en los que no tuvo ninguna',
    worse: 'low',
  },
  {
    key: 'consecutive',
    label: 'Findes seguidos',
    short: 'Findes seg.',
    hint: 'Veces que trabajó un finde justo después de haber trabajado el anterior',
  },
  {
    key: 'backToBack',
    label: 'Guardias seguidas',
    short: 'Seguidas',
    hint: 'Veces que tuvo guardia dos días corridos',
  },
  {
    key: 'sandwich',
    label: 'Sanguchito',
    short: 'Sanguchito',
    hint: 'Veces que tuvo guardia, un día libre y otra guardia (tres días: Guardia, No guardia, Guardia)',
  },
  {
    key: 'freeLongWeekends',
    label: 'Findes largos libres',
    short: 'Largos libres',
    hint: 'Findes largos (con feriado el viernes o el lunes) con guardias cargadas en los que no tuvo ninguna',
    worse: 'low',
  },
]

/**
 * Las "cosas malas": lo ideal es que no haya ninguna, así que se miden por cantidad (no por reparto parejo: una sola,
 * aunque sea de una persona, ya es peor que ninguna). En este orden de prioridad, de peor a menos grave.
 */
export const BAD_CATEGORIES: Category[] = ['backToBack', 'sandwich', 'consecutive']
const isBad = (key: Category) => BAD_CATEGORIES.includes(key)

/** Lunes de la semana de `date` ('YYYY-MM-DD'), que es la clave de `quirofano` y de cada finde. */
export const weekOf = mondayOf

const shiftWeek = addDaysTo
const isWeekendDay = (date: string) => {
  const day = dayOfWeek(date)
  return day === 0 || day === 6
}

/**
 * `busyWeekends` es el dato base de freeWeekends y de las sugerencias; `quirofano` se registra
 * (y se usa para sugerir quirofanero) pero no entra en la justicia. Ninguno de los dos se muestra en la tabla.
 */
export type Counts = Record<Category, number> & {
  busyWeekends: number
  /** Findes largos con guardias cargadas (el mismo número para todos) */
  longWeekends: number
  quirofano: number
  /** Guardias que tuvo en un buen lugar alrededor de su quirófano (ver `PRE_QUIROFANO_OFFSETS`): es algo bueno */
  preQuirofano: number
  /** Menor cantidad de días entre dos guardias suyas (null si tiene menos de dos) */
  minGap: number | null
}
const emptyCounts = (): Counts => ({
  total: 0,
  saturday: 0,
  sunday: 0,
  holiday: 0,
  quirofano: 0,
  preQuirofano: 0,
  freeWeekends: 0,
  consecutive: 0,
  backToBack: 0,
  sandwich: 0,
  freeLongWeekends: 0,
  busyWeekends: 0,
  longWeekends: 0,
  minGap: null,
})

/** Categorías a las que suma una guardia en esa fecha (siempre incluye 'total'). */
export function categoriesOf(date: string, holiday: HolidayLookup): ShiftCategory[] {
  const cats: ShiftCategory[] = ['total']
  const day = dayOfWeek(date)
  if (day === 6) cats.push('saturday')
  if (day === 0) cats.push('sunday')
  if (holiday(date)) cats.push('holiday')
  return cats
}

export function inWindow(date: string, settings: Settings) {
  return !settings.countFrom || date >= settings.countFrom
}

/**
 * Días (desde el lunes de su semana de quirófano) en los que sí conviene tener guardia: su viernes, de lunes a viernes
 * de la semana anterior y el domingo previo. El sábado anterior no.
 */
export const QUIROFANO_PREFER_OFFSETS = [4, -7, -6, -5, -4, -3, -1]

/** ¿Tiene guardia el sábado o el domingo de la semana `week` (lunes)? */
const busyOn = (shifts: Shifts, week: string, personId: string) =>
  shifts[shiftWeek(week, 5)] === personId || shifts[shiftWeek(week, 6)] === personId

/**
 * Recuerda el último resultado de `fn` mientras los argumentos sean los mismos (por identidad). La tabla de balance,
 * los avisos del calendario y `shiftProblems` piden lo mismo con el mismo estado: así lo calculan una sola vez.
 */
function memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; value: R } | undefined
  return (...args) => {
    if (last && last.args.every((a, i) => Object.is(a, args[i]))) return last.value
    const value = fn(...args)
    last = { args, value }
    return value
  }
}

/** Contadores por persona (solo gente activa, dentro de la ventana de conteo). */
function countShifts(
  people: Person[],
  shifts: Shifts,
  quirofano: Quirofano,
  settings: Settings,
  holiday: HolidayLookup,
): Record<string, Counts> {
  const counts: Record<string, Counts> = {}
  const busy: Record<string, Set<string>> = {}
  const dates: Record<string, string[]> = {}
  for (const p of people) {
    if (!p.active) continue
    counts[p.id] = emptyCounts()
    busy[p.id] = new Set()
    dates[p.id] = []
  }
  // findes con al menos una guardia cargada (asignada o no): sobre ellos se miden "libres"
  const plannedWeekends = new Set<string>()

  for (const [date, personId] of Object.entries(shifts)) {
    if (!inWindow(date, settings)) continue
    if (isWeekendDay(date)) {
      plannedWeekends.add(weekOf(date))
      if (personId && busy[personId]) busy[personId].add(weekOf(date))
    }
    if (!personId || !counts[personId]) continue
    for (const c of categoriesOf(date, holiday)) counts[personId][c]++
    dates[personId].push(date)
  }

  for (const [id, own] of Object.entries(dates)) {
    own.sort()
    for (let i = 1; i < own.length; i++) {
      const gap = daysBetween(own[i], own[i - 1])
      if (gap === 1) counts[id].backToBack++
      if (gap === 2) counts[id].sandwich++
      counts[id].minGap = counts[id].minGap === null ? gap : Math.min(counts[id].minGap, gap)
    }
  }

  // Findes largos: el viernes o el lunes es feriado. El bloque es sábado + domingo + esos feriados.
  const longCandidates = new Set<string>()
  for (const date of Object.keys(shifts)) {
    if (!inWindow(date, settings)) continue
    const day = dayOfWeek(date)
    if (day === 5 || day === 6 || day === 0) longCandidates.add(weekOf(date))
    else if (day === 1) longCandidates.add(shiftWeek(weekOf(date), -7))
  }
  let longWeekends = 0
  const busyLong: Record<string, number> = {}
  for (const id of Object.keys(counts)) busyLong[id] = 0
  for (const week of longCandidates) {
    const fri = shiftWeek(week, 4)
    const mon = shiftWeek(week, 7)
    if (!holiday(fri) && !holiday(mon)) continue
    const block = [...(holiday(fri) ? [fri] : []), shiftWeek(week, 5), shiftWeek(week, 6), ...(holiday(mon) ? [mon] : [])]
    const loaded = block.filter((d) => d in shifts && inWindow(d, settings))
    if (loaded.length === 0) continue
    longWeekends++
    for (const id of Object.keys(counts)) if (loaded.some((d) => shifts[d] === id)) busyLong[id]++
  }
  for (const id of Object.keys(counts)) {
    counts[id].longWeekends = longWeekends
    counts[id].freeLongWeekends = longWeekends - busyLong[id]
  }

  for (const [id, weeks] of Object.entries(busy)) {
    counts[id].busyWeekends = weeks.size
    counts[id].freeWeekends = plannedWeekends.size - weeks.size
    for (const w of weeks) if (weeks.has(shiftWeek(w, -7))) counts[id].consecutive++
  }

  for (const [week, personId] of Object.entries(quirofano)) {
    // la semana cuenta si termina (domingo) dentro de la ventana
    if (!counts[personId] || !inWindow(shiftWeek(week, 6), settings)) continue
    counts[personId].quirofano++
    for (const offset of QUIROFANO_PREFER_OFFSETS) {
      // la semana anterior es "pre" solo si no es también de quirófano suya
      if (offset < 0 && quirofano[shiftWeek(week, -7)] === personId) continue
      const date = shiftWeek(week, offset)
      if (shifts[date] === personId && inWindow(date, settings)) counts[personId].preQuirofano++
    }
  }
  return counts
}

/** Igual que `countShifts`, pero compartiendo el resultado entre quienes piden lo mismo (ver `memoLast`). `rankCandidates` y similares usan la versión sin memoria: cada llamada lleva datos distintos. */
export const computeCounts = memoLast(countShifts)

/**
 * Qué tan parejo está el reparto (0..1) frente al mejor reparto posible con números enteros.
 * 1 = tan parejo como se puede (todos con floor o ceil del promedio); 0 = una sola persona hace todo.
 * null = no hay datos para opinar.
 */
export function evenness(values: number[]): number | null {
  const n = values.length
  const total = values.reduce((a, b) => a + b, 0)
  if (n < 2 || total === 0) return null
  const mean = total / n
  const dev = values.reduce((a, v) => a + Math.abs(v - mean), 0)
  const r = total % n
  const q = Math.floor(total / n)
  const minDev = r * (q + 1 - mean) + (n - r) * (mean - q)
  const maxDev = (2 * total * (n - 1)) / n
  if (maxDev - minDev < 1e-9) return 1
  return Math.max(0, Math.min(1, 1 - (dev - minDev) / (maxDev - minDev)))
}

/**
 * `parts` es cuánto peor (+) o mejor (−) le va a una persona que al promedio en cada columna, de −1 a +1
 * (+1 = el doble de carga que el promedio o más). `justice` (0..1) es qué tan cerca está del mejor reparto
 * posible: 1 = en todas las columnas con puntaje está en el piso o el techo del promedio, que es lo más
 * parejo que se puede con números enteros.
 */
export type Burden = { justice: number; parts: Record<Category, number> }

export type Fairness = {
  perCategory: Record<Category, number | null>
  overall: number | null
  means: Counts
  burden: Record<string, Burden>
}

/**
 * Puntaje (0..1) de cada columna y promedio de cada una. Las columnas "de reparto" miden qué tan parejo está (ver
 * `evenness`); las "cosas malas" (`BAD_CATEGORIES`) miden cuántas hay: 1 = ninguna, 0 = una por persona o más.
 */
function categoryScores(rows: Counts[]) {
  const perCategory = {} as Record<Category, number | null>
  const means = emptyCounts()
  const anyWeekendWork = rows.some((r) => r.busyWeekends > 0)
  const anyWork = rows.some((r) => r.total > 0)
  const anyLongWeekend = rows.some((r) => r.longWeekends > 0)
  for (const { key } of CATEGORIES) {
    const values = rows.map((r) => r[key])
    const sum = values.reduce((a, b) => a + b, 0)
    means[key] = values.length ? sum / values.length : 0
    // Todos en 0 "seguidos" / "sanguchito" (o todos ocupados en todos los findes) es un reparto perfecto, no "sin datos".
    const hasData =
      key === 'sandwich' || key === 'backToBack'
        ? anyWork
        : key === 'freeLongWeekends'
          ? anyLongWeekend
          : key === 'consecutive' || key === 'freeWeekends'
            ? anyWeekendWork
            : false
    if (isBad(key)) {
      perCategory[key] = hasData && values.length ? 1 - Math.min(1, sum / values.length) : null
      continue
    }
    perCategory[key] = evenness(values)
    if (perCategory[key] === null && rows.length > 1 && hasData) perCategory[key] = 1
  }
  return { perCategory, means }
}

export function computeFairness(counts: Record<string, Counts>): Fairness {
  const rows = Object.values(counts)
  const { perCategory, means } = categoryScores(rows)
  const scores = Object.values(perCategory).filter((v): v is number => v !== null)
  const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  // La diferencia contra el promedio se mide en "promedios" (con un piso de 1 para métricas casi siempre en 0).
  const burden: Record<string, Burden> = {}
  const withData = CATEGORIES.filter((c) => perCategory[c.key] !== null)
  for (const [id, c] of Object.entries(counts)) {
    const parts = {} as Record<Category, number>
    const off = {} as Record<Category, number>
    for (const { key, worse } of CATEGORIES) {
      const scale = Math.max(means[key], 1)
      parts[key] = Math.max(-1, Math.min(1, ((worse === 'low' ? -1 : 1) * (c[key] - means[key])) / scale))
      // en las cosas malas no hay "piso o techo del promedio" que valga: cada una cuenta
      const gap = isBad(key) ? c[key] : Math.max(0, Math.floor(means[key] + 1e-9) - c[key], c[key] - Math.ceil(means[key] - 1e-9))
      off[key] = Math.min(1, gap / scale)
    }
    const avg = (m: Record<Category, number>) =>
      withData.length ? withData.reduce((a, { key }) => a + m[key], 0) / withData.length : 0
    burden[id] = { justice: 1 - avg(off), parts }
  }
  return { perCategory, overall, means, burden }
}

// ---------------------------------------------------------------------------
// Puntaje de un reparto (lo que se maximiza al recomendar)
// ---------------------------------------------------------------------------

/**
 * Un reparto es mejor que otro si, en este orden: tiene menos guardias seguidas, menos sanguchitos, menos findes
 * seguidos (`bad`, en el orden de `BAD_CATEGORIES`); y si empatan, si está
 * más parejo en las columnas de reparto (`fair`) sumando un premio por cada guardia bien ubicada alrededor del
 * quirófano (`pre`); y si siguen empatados, si las guardias de cada persona quedan más separadas (`spacing`).
 */
export type Score = { bad: number[]; fair: number; pre: number; spacing: number }

/** Cuánto vale cada guardia bien ubicada alrededor del quirófano, en puntos de "qué tan parejo" (0..1) */
export const PRE_QUIROFANO_BONUS = 0.03
/** El espaciado entre guardias no suma más allá de estos días */
export const SPACING_CAP_DAYS = 14

export function scoreOf(counts: Record<string, Counts>): Score {
  const rows = Object.values(counts)
  const { perCategory } = categoryScores(rows)
  const shares = CATEGORIES.filter((c) => !isBad(c.key))
    .map((c) => perCategory[c.key])
    .filter((v): v is number => v !== null)
  return {
    bad: BAD_CATEGORIES.map((key) => rows.reduce((sum, r) => sum + r[key], 0)),
    fair: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 1,
    pre: rows.reduce((sum, r) => sum + r.preQuirofano, 0),
    spacing: rows.reduce((sum, r) => sum + Math.min(r.minGap ?? SPACING_CAP_DAYS, SPACING_CAP_DAYS), 0),
  }
}

/** > 0 si `a` es un mejor reparto que `b`, < 0 si es peor, 0 si empatan. */
export function compareScores(a: Score, b: Score): number {
  for (let i = 0; i < a.bad.length; i++) if (a.bad[i] !== b.bad[i]) return b.bad[i] - a.bad[i]
  const fair = a.fair + PRE_QUIROFANO_BONUS * a.pre - (b.fair + PRE_QUIROFANO_BONUS * b.pre)
  if (Math.abs(fair) > 1e-9) return fair
  return a.spacing - b.spacing
}

/** Puntaje de un reparto completo. */
export function scoreShifts(people: Person[], shifts: Shifts, quirofano: Quirofano, settings: Settings, holiday: HolidayLookup): Score {
  return scoreOf(countShifts(people, shifts, quirofano, settings, holiday))
}

// ---------------------------------------------------------------------------
// Guardias que perjudican
// ---------------------------------------------------------------------------

/**
 * Para cada guardia asignada, los motivos por los que empeora la justicia (ver las columnas de la tabla):
 * guardias seguidas, sanguchito, finde seguido o ser un sábado /
 * domingo / feriado de más para quien ya tiene más que el promedio. Solo aparecen las fechas con algún motivo.
 */
export function shiftProblems(
  people: Person[],
  shifts: Shifts,
  quirofano: Quirofano,
  settings: Settings,
  holiday: HolidayLookup,
): Record<string, string[]> {
  const counts = computeCounts(people, shifts, quirofano, settings, holiday)
  const { means } = computeFairness(counts)
  const problems: Record<string, string[]> = {}
  const add = (date: string, text: string) => {
    const list = (problems[date] ??= [])
    if (!list.includes(text)) list.push(text)
  }
  const dm = (date: string) => `${+date.slice(8, 10)}/${+date.slice(5, 7)}`
  const labelOf = (key: Category) => CATEGORIES.find((c) => c.key === key)!.label

  const own: Record<string, string[]> = {}
  for (const [date, id] of Object.entries(shifts)) {
    if (!id || !counts[id] || !inWindow(date, settings)) continue
    ;(own[id] ??= []).push(date)
    for (const cat of categoriesOf(date, holiday)) {
      if (cat === 'total') continue
      // alguien tiene que hacerlos: solo se marca lo que pasa el techo del promedio
      if (counts[id][cat] > Math.ceil(means[cat] - 1e-9)) {
        add(date, `${labelOf(cat)} de más: tiene ${counts[id][cat]} (promedio ${means[cat].toFixed(1)})`)
      }
    }
  }

  for (const dates of Object.values(own)) {
    dates.sort()
    for (let i = 1; i < dates.length; i++) {
      const gap = daysBetween(dates[i], dates[i - 1])
      if (gap === 1) {
        add(dates[i - 1], `Guardias seguidas: también tiene la del ${dm(dates[i])}`)
        add(dates[i], `Guardias seguidas: también tiene la del ${dm(dates[i - 1])}`)
      }
      if (gap === 2) {
        add(dates[i - 1], `Sanguchito con la guardia del ${dm(dates[i])}`)
        add(dates[i], `Sanguchito con la guardia del ${dm(dates[i - 1])}`)
      }
    }
    const weekends = new Map<string, string[]>()
    for (const d of dates) if (isWeekendDay(d)) weekends.set(weekOf(d), [...(weekends.get(weekOf(d)) ?? []), d])
    for (const [week, ds] of weekends) {
      const before = weekends.get(shiftWeek(week, -7))
      if (!before) continue
      for (const d of ds) add(d, 'Finde seguido: también trabajó el finde anterior')
      for (const d of before) add(d, 'Finde seguido: también trabajó el finde siguiente')
    }
  }

  return problems
}

// ---------------------------------------------------------------------------
// Sugerencias
// ---------------------------------------------------------------------------

export type Candidate = {
  person: Person
  /** Cuánto lleva cada categoría sin contar esta fecha */
  counts: Counts
  /** Días hasta la guardia suya anterior / siguiente más cercana (null si no tiene) */
  gaps: { before: number | null; after: number | null }
  /** Solo para sábados y domingos */
  weekend: { alreadyBusy: boolean; streaks: number } | null
  /** Sanguchitos (guardia, libre, guardia) que se armarían al asignarle este día */
  newSandwich: number
  /** 'prefer': la semana anterior a su quirófano, el domingo previo o su viernes. */
  around: 'prefer' | null
  /** Cómo queda el reparto completo si se le asigna este día */
  score: Score
}

/** Días hasta la guardia anterior y la siguiente de `personId` respecto de `date`. */
function gapsAround(date: string, shifts: Shifts, personId: string) {
  const t = toDay(date)
  let before: number | null = null
  let after: number | null = null
  for (const [d, p] of Object.entries(shifts)) {
    if (p !== personId || d === date) continue
    const diff = toDay(d) - t
    if (diff < 0 && (before === null || -diff < before)) before = -diff
    if (diff > 0 && (after === null || diff < after)) after = diff
  }
  return { before, after }
}

/** ¿Asignarle este día le genera alguno de los problemas que se avisan con badges amarillos? */
export const hasIssue = (c: Candidate) =>
  c.newSandwich > 0 ||
  c.gaps.before === 1 ||
  c.gaps.after === 1 ||
  (c.weekend?.streaks ?? 0) > 0

/**
 * Ordena las personas activas de mejor a peor candidata para tomar la guardia de `date`: gana quien deja el
 * mejor reparto en total (ver `Score`), que es exactamente lo que mide la tabla de justicia. Los datos de
 * `Candidate` (guardia ayer, sanguchito, finde seguido, cerca del quirófano) son solo la explicación que se muestra.
 */
export function rankCandidates(
  date: string,
  people: Person[],
  shifts: Shifts,
  quirofano: Quirofano,
  settings: Settings,
  holiday: HolidayLookup,
): Candidate[] {
  const withoutDate = { ...shifts }
  delete withoutDate[date]
  const counts = countShifts(people, withoutDate, quirofano, settings, holiday)
  const week = weekOf(date)
  return people
    .filter((p) => p.active)
    .map((person) => {
      const c = counts[person.id]
      const gaps = gapsAround(date, withoutDate, person.id)

      let weekend: Candidate['weekend'] = null
      if (isWeekendDay(date)) {
        const alreadyBusy = busyOn(withoutDate, week, person.id)
        const streaks = alreadyBusy
          ? 0
          : Number(busyOn(withoutDate, shiftWeek(week, -7), person.id)) + Number(busyOn(withoutDate, shiftWeek(week, 7), person.id))
        weekend = { alreadyBusy, streaks }
      }

      // sanguchitos que aparecen (antes-hoy, hoy-después) menos el (antes-después) que se parte en dos
      const { before, after } = gaps
      const newSandwich = Math.max(0, Number(before === 2) + Number(after === 2) - Number(before === 1 && after === 1))

      // Alrededor del quirófano (la semana empieza el lunes y el domingo cierra la anterior)
      const day = dayOfWeek(date)
      let around: Candidate['around'] = null
      if (quirofano[week] === person.id) around = day === 5 ? 'prefer' : null
      else if (quirofano[shiftWeek(week, 7)] === person.id && day !== 6) around = 'prefer'

      const score = scoreShifts(people, { ...withoutDate, [date]: person.id }, quirofano, settings, holiday)
      return { person, counts: c, gaps, weekend, newSandwich, around, score }
    })
    .sort((a, b) => compareScores(b.score, a.score))
}

// ---------------------------------------------------------------------------
// Quirófano (una persona por semana)
// ---------------------------------------------------------------------------

export type QuirofanoCandidate = {
  person: Person
  count: number
  /** Ya está de quirofanero la semana anterior / siguiente */
  adjacent: { before: boolean; after: boolean }
  /** Es a quien le toca según el orden de rotación */
  expected: boolean
  cost: number
}

/** Costo de repetir quirofanero dos semanas seguidas, en semanas de quirófano de diferencia */
const ADJACENT_PENALTY = 1.5

/** Rotación efectiva: el orden configurado (solo gente activa); si no hay ninguno, todas las activas en el orden de la lista. */
export function rotationOrder(people: Person[], settings: Settings): string[] {
  const active = new Set(people.filter((p) => p.active).map((p) => p.id))
  const configured = settings.quirofanoOrder.filter((id) => active.has(id))
  return configured.length ? configured : people.filter((p) => p.active).map((p) => p.id)
}

/** Lunes de referencia: sin ninguna semana cargada, la rotación arranca de acá, así no depende de qué mes se mire. */
const ROTATION_EPOCH = '2020-01-06'

/**
 * A quién le toca la semana `week` según el orden: se toma la semana ya asignada más cercana (la anterior si
 * hay empate) y se avanza o retrocede en la rotación tantas semanas como las separen. Sin ninguna asignada,
 * se cuenta desde una semana de referencia fija.
 */
export function expectedQuirofanero(week: string, quirofano: Quirofano, order: string[]): string | null {
  const n = order.length
  if (n === 0) return null
  let anchor: { weeks: number; index: number } | null = null
  for (const [w, id] of Object.entries(quirofano)) {
    const index = order.indexOf(id)
    if (index < 0 || w === week) continue
    const weeks = Math.round(daysBetween(week, w) / 7)
    const closer = !anchor || Math.abs(weeks) < Math.abs(anchor.weeks) || (Math.abs(weeks) === Math.abs(anchor.weeks) && weeks > anchor.weeks)
    if (closer) anchor = { weeks, index }
  }
  if (!anchor) {
    const sinceEpoch = Math.round(daysBetween(week, ROTATION_EPOCH) / 7)
    return order[((sinceEpoch % n) + n) % n]
  }
  return order[(((anchor.index + anchor.weeks) % n) + n) % n]
}

/**
 * Ordena las personas activas para la semana `week` (lunes). Primero, si hay rotación, a quien le toca por
 * el orden; después, gana quien menos semanas lleva, evitando repetir seguidas.
 */
export function rankQuirofano(
  week: string,
  people: Person[],
  quirofano: Quirofano,
  settings: Settings,
  holiday: HolidayLookup,
): QuirofanoCandidate[] {
  const without = { ...quirofano }
  delete without[week]
  const counts = countShifts(people, {}, without, settings, holiday)
  const expectedId = expectedQuirofanero(week, without, rotationOrder(people, settings))
  const at = (offset: number) => without[addDaysTo(week, offset)]
  const t = toDay(week)
  return people
    .filter((p) => p.active)
    .map((person) => {
      const adjacent = { before: at(-7) === person.id, after: at(7) === person.id }
      let sinceLast = Infinity
      for (const [w, id] of Object.entries(without)) {
        if (id === person.id) sinceLast = Math.min(sinceLast, Math.abs(toDay(w) - t))
      }
      const count = counts[person.id].quirofano
      const expected = person.id === expectedId
      const cost =
        (expected ? -1000 : 0) + count + (adjacent.before || adjacent.after ? ADJACENT_PENALTY : 0) - Math.min(sinceLast, 120) / 1000
      return { person, count, adjacent, expected, cost }
    })
    .sort((a, b) => a.cost - b.cost)
}

/** Propone quirofanero para las semanas sin asignar de `weeks`, siguiendo el orden de rotación, en orden cronológico. */
export function suggestQuirofano(
  weeks: string[],
  people: Person[],
  quirofano: Quirofano,
  settings: Settings,
): Record<string, string> {
  const order = rotationOrder(people, settings)
  const working = { ...quirofano }
  const result: Record<string, string> = {}
  for (const week of [...weeks].sort()) {
    const next = expectedQuirofanero(week, working, order)
    if (!next) break
    working[week] = next
    result[week] = next
  }
  return result
}

/**
 * El quirófano de cada semana: lo cargado a mano más, en las semanas sin asignar, lo que corresponde por el
 * orden de rotación. Cubre desde la primera semana con guardias (o de `extraWeeks`) hasta una después de la última.
 */
const NO_QUIROFANO: Quirofano = {}
export const effectiveQuirofano = memoLast(function effectiveQuirofano(
  people: Person[],
  shifts: Shifts,
  quirofano: Quirofano,
  settings: Settings,
  extraWeeks: string[] = [],
): Quirofano {
  if (settings.mode !== 'r1') return NO_QUIROFANO
  const weeks = [...Object.keys(shifts).map(weekOf), ...extraWeeks].sort()
  if (weeks.length === 0) return quirofano
  const last = shiftWeek(weeks[weeks.length - 1], 7)
  const missing: string[] = []
  for (let w = weeks[0]; w <= last; w = shiftWeek(w, 7)) if (!(w in quirofano)) missing.push(w)
  return { ...suggestQuirofano(missing, people, quirofano, settings), ...quirofano }
})
