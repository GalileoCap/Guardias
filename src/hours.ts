import { addDaysTo, dayOfWeek } from './dates'
import { inWindow } from './fairness'
import type { HolidayLookup } from './holidays'
import type { Extensions, Person, Settings, Shifts } from './types'

/** Minutos desde la medianoche de una hora 'HH:MM'. */
export const minutesOf = (time: string) => +time.slice(0, 2) * 60 + +time.slice(3, 5)

/** 'HH:MM' de una cantidad de minutos desde la medianoche (sin pasar de 24 h). */
export const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** Fin normal de toda guardia (del día siguiente) y comienzo en sábado, domingo y feriado. */
export const NORMAL_END = '08:30'
/** Comienzo en día hábil, terminado el horario de trabajo. */
export const WEEKDAY_START = '16:00'

const DAY = 24 * 60

/** Si la guardia de `date` dura el día entero (sábado, domingo o feriado) en lugar de empezar a la tarde. */
export const isFullDay = (date: string, holiday: HolidayLookup) => [0, 6].includes(dayOfWeek(date)) || !!holiday(date)

/**
 * Horario de la guardia de `date`, en minutos desde la medianoche de ese día (`end` cae al día siguiente, así que pasa
 * de 24 h). Si la guardia del día anterior se extendió más allá de cuando empezaría esta, esta arranca cuando aquella termina.
 */
export function shiftSpan(date: string, extensions: Extensions, holiday: HolidayLookup): { start: number; end: number } {
  const normal = minutesOf(isFullDay(date, holiday) ? NORMAL_END : WEEKDAY_START)
  const previous = extensions[addDaysTo(date, -1)]
  return {
    start: previous ? Math.max(normal, minutesOf(previous)) : normal,
    end: DAY + minutesOf(extensions[date] ?? NORMAL_END),
  }
}

/** Horas que la guardia de `date` se extiende más allá de las 8:30 (0 si no se extiende). */
export const extraHours = (date: string, extensions: Extensions) =>
  date in extensions ? (minutesOf(extensions[date]) - minutesOf(NORMAL_END)) / 60 : 0

/**
 * Horas extra de cada persona: la suma de las extensiones de sus guardias dentro de "contar desde", sin `exclude`.
 * Una guardia sin asignar no suma a nadie.
 */
export function extraHoursByPerson(
  people: Person[],
  shifts: Shifts,
  extensions: Extensions,
  settings: Settings,
  exclude?: string,
): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(people.map((p) => [p.id, 0]))
  for (const date of Object.keys(extensions)) {
    const personId = shifts[date]
    if (date === exclude || !personId || !(personId in out) || !inWindow(date, settings)) continue
    out[personId] += extraHours(date, extensions)
  }
  return out
}

/** "3,5 h" */
export const formatHours = (hours: number) => `${hours.toLocaleString('es-AR', { maximumFractionDigits: 2 })} h`
