import { addDaysTo, dayOfWeek } from './dates'
import { inWindow } from './fairness'
import type { HolidayLookup } from './holidays'
import type { Person, Relays, Settings, Shifts } from './types'

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
 * de 24 h; un adelanto hace `start` negativo). Si la guardia del día anterior se extendió más allá de cuando empezaría
 * esta, esta arranca cuando aquella termina; si la siguiente se adelanta, esta termina cuando aquella arranca.
 */
export function shiftSpan(date: string, { extensions, advances }: Relays, holiday: HolidayLookup): { start: number; end: number } {
  const normal = minutesOf(isFullDay(date, holiday) ? NORMAL_END : WEEKDAY_START)
  const previous = extensions[addDaysTo(date, -1)]
  const next = advances[addDaysTo(date, 1)]
  return {
    start: date in advances ? minutesOf(advances[date]) - DAY : previous ? Math.max(normal, minutesOf(previous)) : normal,
    end: next ? minutesOf(next) : DAY + minutesOf(extensions[date] ?? NORMAL_END),
  }
}

/**
 * Horas extra de la guardia de `date`: lo que su extensión pasa de las 8:30 del día siguiente, más lo que su adelanto
 * arranca antes de las 8:30 del día de la guardia (de 8:30 a 16 de un día hábil es horario de trabajo).
 */
export const extraHours = (date: string, { extensions, advances }: Relays) =>
  ((date in extensions ? minutesOf(extensions[date]) - minutesOf(NORMAL_END) : 0) +
    (date in advances ? DAY + minutesOf(NORMAL_END) - minutesOf(advances[date]) : 0)) /
  60

/**
 * Horas de guardia de cada persona dentro de "contar desde": la duración de cada una de sus guardias, con su horario de
 * día hábil o de día entero y lo que corren las extensiones y los adelantos. Una guardia sin asignar no suma a nadie.
 */
export function shiftHoursByPerson(
  people: Person[],
  shifts: Shifts,
  relays: Relays,
  settings: Settings,
  holiday: HolidayLookup,
): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(people.map((p) => [p.id, 0]))
  for (const [date, personId] of Object.entries(shifts)) {
    if (!personId || !(personId in out) || !inWindow(date, settings)) continue
    const { start, end } = shiftSpan(date, relays, holiday)
    out[personId] += (end - start) / 60
  }
  return out
}

/** Extiende la guardia de `date` hasta `end` del día siguiente (null la deja terminar a las 8:30). Reemplaza al adelanto de la siguiente: es el mismo relevo. */
export function withExtension({ extensions, advances }: Relays, date: string, end: string | null): Relays {
  const { [date]: _, ...rest } = extensions
  if (!end) return { extensions: rest, advances }
  const { [addDaysTo(date, 1)]: __, ...others } = advances
  return { extensions: { ...rest, [date]: end }, advances: others }
}

/** Adelanta la guardia de `date` a `start` del día anterior (null la deja arrancar a su hora). Reemplaza a la extensión de la anterior. */
export function withAdvance({ extensions, advances }: Relays, date: string, start: string | null): Relays {
  const { [date]: _, ...rest } = advances
  if (!start) return { extensions, advances: rest }
  const { [addDaysTo(date, -1)]: __, ...others } = extensions
  return { extensions: others, advances: { ...rest, [date]: start } }
}

/** "18", "18:30" */
export const hourOf = (time: string) => `${+time.slice(0, 2)}${time.endsWith(':00') ? '' : time.slice(2)}`

/** "las 18", "las 18:30" */
export const atTime = (time: string) => `las ${hourOf(time)}`

/** "3,5 h" */
export const formatHours = (hours: number) => `${hours.toLocaleString('es-AR', { maximumFractionDigits: 2 })} h`
