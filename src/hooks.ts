import { useMemo } from 'react'
import { computeCounts, computeFairness, effectiveQuirofano, shiftProblems } from './fairness'
import { makeHolidayLookup } from './holidays'
import { useStore } from './store'

export function useHolidayLookup() {
  const settings = useStore((s) => s.settings)
  return useMemo(() => makeHolidayLookup(settings), [settings])
}

/** El quirófano de cada semana (lo cargado a mano + lo autocompletado por el orden de rotación). */
export function useQuirofano(extraWeeks?: string[]) {
  const people = useStore((s) => s.people)
  const shifts = useStore((s) => s.shifts)
  const quirofano = useStore((s) => s.quirofano)
  const settings = useStore((s) => s.settings)
  return useMemo(
    () => effectiveQuirofano(people, shifts, quirofano, settings, extraWeeks),
    [people, shifts, quirofano, settings, extraWeeks],
  )
}

export function useFairness() {
  const people = useStore((s) => s.people)
  const shifts = useStore((s) => s.shifts)
  const quirofano = useQuirofano()
  const settings = useStore((s) => s.settings)
  const holiday = useHolidayLookup()
  return useMemo(() => {
    const counts = computeCounts(people, shifts, quirofano, settings, holiday)
    return { counts, fairness: computeFairness(counts) }
  }, [people, shifts, quirofano, settings, holiday])
}

/** Por fecha, los motivos por los que esa guardia perjudica la justicia (ver `shiftProblems`). */
export function useProblems() {
  const people = useStore((s) => s.people)
  const shifts = useStore((s) => s.shifts)
  const quirofano = useQuirofano()
  const settings = useStore((s) => s.settings)
  const holiday = useHolidayLookup()
  return useMemo(() => shiftProblems(people, shifts, quirofano, settings, holiday), [people, shifts, quirofano, settings, holiday])
}

/** Color de texto legible sobre un fondo hex. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111827' : '#ffffff'
}
