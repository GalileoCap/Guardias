import { addDaysTo, dayOfWeek, mondayOf } from './dates'
import type { Quirofano, TaskDays, TaskKind, Tasks } from './types'

/** Las tareas que se anotan, en el orden en que se muestran. */
export const TASK_KINDS: { key: TaskKind; label: string; short: string }[] = [
  { key: 'curva', label: 'Curva', short: 'Cu' },
  { key: 'campo', label: 'Campo', short: 'Ca' },
]

/** Días de la semana (0 = domingo) en que toca la tarea en `month` ('YYYY-MM'): los del último mes configurado hasta ese. */
export function taskWeekdays(taskDays: TaskDays, kind: TaskKind, month: string): number[] {
  let latest: string | null = null
  for (const key of Object.keys(taskDays)) {
    if (!key.startsWith(`${kind}:`)) continue
    const m = key.slice(kind.length + 1)
    if (m <= month && (latest === null || m > latest)) latest = m
  }
  return latest === null ? [] : taskDays[`${kind}:${latest}`]
}

/**
 * Qué falta anotar entre `from` (incluida) y `to` (excluida).
 *
 * Con días fijos, cada semana espera una anotación por cada día que toca (el mes de cada fecha define los suyos) y
 * cuenta cuántas hay en la semana, sin importar el día. A lo que falta se le asignan los primeros días que tocaban sin
 * anotación propia: `missing` si ya pasaron (antes de `today`), `pending` si todavía vienen. Sin días fijos, una
 * semana sin ninguna anotación falta cuando termina y se marca en su lunes. Nada anterior a la primera anotación de la
 * tarea falta: no hay desde cuándo llevar la cuenta.
 */
export function taskGaps(
  tasks: Tasks,
  taskDays: TaskDays,
  kind: TaskKind,
  today: string,
  from: string,
  to: string,
): { missing: string[]; pending: string[] } {
  const weeks = new Map<string, Set<string>>()
  for (const t of Object.values(tasks)) {
    if (t.kind !== kind) continue
    const monday = mondayOf(t.date)
    weeks.set(monday, (weeks.get(monday) ?? new Set<string>()).add(t.date))
  }
  const firstWeek = [...weeks.keys()].sort()[0] ?? null

  const weekdaysOf = new Map<string, number[]>()
  const expectedOn = (date: string) => {
    const month = date.slice(0, 7)
    let days = weekdaysOf.get(month)
    if (!days) weekdaysOf.set(month, (days = taskWeekdays(taskDays, kind, month)))
    return days.includes(dayOfWeek(date))
  }

  const missing: string[] = []
  const pending: string[] = []
  for (let w = mondayOf(from); w < to; w = addDaysTo(w, 7)) {
    const mine = weeks.get(w)
    const counted = firstWeek !== null && w >= firstWeek
    const expected = Array.from({ length: 7 }, (_, i) => addDaysTo(w, i)).filter(expectedOn)
    if (expected.length === 0) {
      if (counted && !mine && addDaysTo(w, 6) < today) missing.push(w)
      continue
    }
    const shortfall = expected.length - (mine?.size ?? 0)
    for (const date of expected.filter((d) => !mine?.has(d)).slice(0, Math.max(shortfall, 0))) {
      if (date >= today) pending.push(date)
      else if (counted) missing.push(date)
    }
  }
  const inRange = (d: string) => d >= from && d < to
  return { missing: missing.filter(inRange), pending: pending.filter(inRange) }
}

/**
 * A quién recomendar para el Campo de cada fecha de `dates`: la siguiente persona del orden de `order` (el de la
 * rotación del quirófano) después de quien hizo el Campo anterior, anotado o ya recomendado para una fecha previa, sin
 * contar a quien tiene el quirófano esa semana. Sin ningún Campo antes (o si quien lo hizo ya no está en el orden)
 * arranca por el primero. Una fecha sin nadie que pueda hacerlo queda sin recomendación.
 */
export function suggestCampo(dates: string[], tasks: Tasks, order: string[], quirofano: Quirofano): Record<string, string> {
  const events = Object.values(tasks)
    .filter((t) => t.kind === 'campo')
    .map((t) => ({ date: t.date, personId: t.personId }))
  const out: Record<string, string> = {}
  for (const date of [...new Set(dates)].sort()) {
    // Lo último que pasó antes de esta fecha; con la misma fecha manda lo anotado (viene primero en `events`)
    let prev: string | null = null
    let prevDate = ''
    for (const e of events) if (e.date < date && e.date > prevDate) [prev, prevDate] = [e.personId, e.date]
    const busy = quirofano[mondayOf(date)]
    const from = prev === null ? 0 : order.indexOf(prev) + 1
    const pick = Array.from({ length: order.length }, (_, i) => order[(from + i) % order.length]).find((id) => id !== busy)
    if (pick === undefined) continue
    out[date] = pick
    events.push({ date, personId: pick })
  }
  return out
}

/**
 * Lo que falta anotar del Campo entre `from` y `to` (como `taskGaps`) y a quién recomendar en cada fecha de eso y de
 * `extra`. La recomendación encadena desde el primer Campo anotado, no solo desde `from`: así el calendario y el
 * diálogo de un día dan lo mismo sin importar qué mes se esté viendo.
 */
export function campoPlan(
  tasks: Tasks,
  taskDays: TaskDays,
  today: string,
  from: string,
  to: string,
  order: string[],
  quirofano: Quirofano,
  extra: string[] = [],
): { missing: string[]; pending: string[]; suggestions: Record<string, string> } {
  const first = Object.values(tasks).filter((t) => t.kind === 'campo').map((t) => t.date).sort()[0]
  const all = taskGaps(tasks, taskDays, 'campo', today, first !== undefined && first < from ? first : from, to)
  const suggestions = suggestCampo([...all.missing, ...all.pending, ...extra], tasks, order, quirofano)
  const inRange = (d: string) => d >= from && d < to
  return { missing: all.missing.filter(inRange), pending: all.pending.filter(inRange), suggestions }
}

/** Quién viene preseleccionado para la Curva de `date`: quien tuvo quirófano la semana anterior a la de esa fecha. */
export const curvaDefault = (quirofano: Quirofano, date: string): string | null => quirofano[addDaysTo(mondayOf(date), -7)] ?? null
