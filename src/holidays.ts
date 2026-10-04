import Holidays from 'date-holidays'
import type { Settings } from './types'

const ar = new Holidays('AR')
const byYear = new Map<number, Map<string, string>>()

function autoHolidaysOf(year: number): Map<string, string> {
  let map = byYear.get(year)
  if (!map) {
    map = new Map()
    for (const h of ar.getHolidays(year)) {
      if (h.type === 'public') map.set(h.date.slice(0, 10), h.name)
    }
    byYear.set(year, map)
  }
  return map
}

export type HolidayLookup = (date: string) => string | undefined

export function makeHolidayLookup(settings: Settings): HolidayLookup {
  const custom = new Map(settings.customHolidays.map((h) => [h.date, h.name]))
  return (date) =>
    custom.get(date) ?? (settings.autoHolidays ? autoHolidaysOf(Number(date.slice(0, 4))).get(date) : undefined)
}
