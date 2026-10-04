import type { Settings } from './types'
// Feriados nacionales de Argentina ('YYYY-MM-DD' -> nombre), generados con `npm run holidays` (ver scripts/build-holidays.mjs)
import nationalHolidays from './holidays-ar.json'

const national: Record<string, string> = nationalHolidays

export type HolidayLookup = (date: string) => string | undefined

export function makeHolidayLookup(settings: Settings): HolidayLookup {
  const custom = new Map(settings.customHolidays.map((h) => [h.date, h.name]))
  return (date) => custom.get(date) ?? (settings.autoHolidays ? national[date] : undefined)
}
