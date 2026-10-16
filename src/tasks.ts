import { addDaysTo, mondayOf } from './dates'
import type { Quirofano, TaskKind, Tasks } from './types'

/** Las tareas que se anotan, en el orden en que se muestran. */
export const TASK_KINDS: { key: TaskKind; label: string; short: string }[] = [
  { key: 'curva', label: 'Curva', short: 'Cu' },
  { key: 'campo', label: 'Campo', short: 'Ca' },
]

/**
 * Lunes de las semanas terminadas (su domingo es anterior a `today`) sin ninguna anotación de la tarea, desde la
 * semana de la primera anotación. Sin anotaciones no hay desde cuándo llevar la cuenta, así que no se marca nada.
 */
export function missingTaskWeeks(tasks: Tasks, kind: TaskKind, today: string): string[] {
  const done = new Set(Object.values(tasks).filter((t) => t.kind === kind).map((t) => mondayOf(t.date)))
  if (done.size === 0) return []
  const missing: string[] = []
  for (let w = [...done].sort()[0]; addDaysTo(w, 6) < today; w = addDaysTo(w, 7)) if (!done.has(w)) missing.push(w)
  return missing
}

/** Quién viene preseleccionado para la Curva de `date`: quien tuvo quirófano la semana anterior a la de esa fecha. */
export const curvaDefault = (quirofano: Quirofano, date: string): string | null => quirofano[addDaysTo(mondayOf(date), -7)] ?? null
