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
  const weeks = new Map<string, { count: number; dates: Set<string> }>()
  for (const t of Object.values(tasks)) {
    if (t.kind !== kind) continue
    const monday = mondayOf(t.date)
    const week = weeks.get(monday) ?? { count: 0, dates: new Set<string>() }
    week.count++
    week.dates.add(t.date)
    weeks.set(monday, week)
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
    const shortfall = expected.length - (mine?.count ?? 0)
    for (const date of expected.filter((d) => !mine?.dates.has(d)).slice(0, Math.max(shortfall, 0))) {
      if (date >= today) pending.push(date)
      else if (counted) missing.push(date)
    }
  }
  const inRange = (d: string) => d >= from && d < to
  return { missing: missing.filter(inRange), pending: pending.filter(inRange) }
}

/** Quién viene preseleccionado para la Curva de `date`: quien tuvo quirófano la semana anterior a la de esa fecha. */
export const curvaDefault = (quirofano: Quirofano, date: string): string | null => quirofano[addDaysTo(mondayOf(date), -7)] ?? null
