import { addDaysTo, mondayOf } from './dates'
import type { Quirofano, TaskKind, Tasks } from './types'

/**
 * Semanas (lunes) en que falta la tarea: desde la primera semana cargada de esa tarea hasta la semana de `today`,
 * sin ninguna entrada. Sin entradas no se marca nada (no hay desde cuándo llevar la cuenta) y las semanas futuras
 * todavía no faltan.
 */
export function missingTaskWeeks(tasks: Tasks, kind: TaskKind, today: string): string[] {
  const done = new Set(Object.values(tasks).filter((t) => t.kind === kind).map((t) => t.week))
  const weeks = [...done].sort()
  if (weeks.length === 0) return []
  const missing: string[] = []
  for (let w = weeks[0], last = mondayOf(today); w <= last; w = addDaysTo(w, 7)) if (!done.has(w)) missing.push(w)
  return missing
}

/** Quién viene preseleccionado para la Curva de `week`: quien tuvo quirófano la semana anterior. */
export const curvaDefault = (quirofano: Quirofano, week: string): string | null => quirofano[addDaysTo(week, -7)] ?? null
