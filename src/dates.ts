// Aritmética de fechas 'YYYY-MM-DD' sobre números de día (días desde 1970-01-01, en UTC): sin objetos Date ni parseo
// de texto en cada cuenta. El cálculo de balances toca estas fechas miles de veces por cambio, y en un teléfono
// `parseISO`/`format` de date-fns eran lo más caro de todo; acá cada fecha se convierte una sola vez (queda en caché).
const DAY_MS = 864e5

const dayCache = new Map<string, number>()
/** Número de día de una fecha 'YYYY-MM-DD'. */
export function toDay(date: string): number {
  let n = dayCache.get(date)
  if (n === undefined) {
    n = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY_MS
    dayCache.set(date, n)
  }
  return n
}

const dateCache = new Map<number, string>()
/** Fecha 'YYYY-MM-DD' de un número de día. */
export function fromDay(day: number): string {
  let s = dateCache.get(day)
  if (s === undefined) {
    s = new Date(day * DAY_MS).toISOString().slice(0, 10)
    dateCache.set(day, s)
  }
  return s
}

/** 0 = domingo … 6 = sábado (el 1/1/1970 fue jueves). */
export const dayOfWeek = (date: string) => (((toDay(date) + 4) % 7) + 7) % 7

export const addDaysTo = (date: string, days: number) => fromDay(toDay(date) + days)

/** Días entre dos fechas (a − b). */
export const daysBetween = (a: string, b: string) => toDay(a) - toDay(b)

/** Lunes de la semana de `date`. */
export const mondayOf = (date: string) => fromDay(toDay(date) - ((dayOfWeek(date) + 6) % 7))

const pad = (n: number) => String(n).padStart(2, '0')
/** 'YYYY-MM-DD' de un Date en hora local (lo que FullCalendar entrega para cada celda). */
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
