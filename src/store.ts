import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultSettings, removePersonFrom } from './data'
import { isoOf } from './dates'
import { GROUP } from './group'
import type { AppData, Person, Settings } from './types'

export { defaultSettings }

export const PALETTE = [
  '#ec4899', '#a78bfa', '#f472b6', '#fb923c', '#60a5fa',
  '#34d399', '#e879f9', '#f87171', '#2dd4bf', '#c084fc',
]

type Actions = {
  addPerson: (name: string) => void
  updatePerson: (id: string, patch: Partial<Omit<Person, 'id'>>) => void
  removePerson: (id: string) => void
  /** Crea la guardia si no existe. personId null = sin asignar */
  setShift: (date: string, personId: string | null) => void
  setShifts: (assignments: Record<string, string | null>) => void
  removeShift: (date: string) => void
  /** week = lunes de la semana. personId null = sin asignar */
  setQuirofano: (week: string, personId: string | null) => void
  updateSettings: (patch: Partial<Settings>) => void
  importData: (data: AppData) => void
  reset: () => void
}

export const useStore = create<AppData & Actions>()(
  persist(
    (set) => ({
      people: [],
      shifts: {},
      quirofano: {},
      settings: defaultSettings,

      addPerson: (name) =>
        set((s) => {
          const id = crypto.randomUUID()
          const person = { id, name, color: PALETTE[s.people.length % PALETTE.length], active: true }
          // si ya hay un orden de quirófano definido, la persona nueva entra al final de la rotación
          const order = s.settings.quirofanoOrder
          return {
            people: [...s.people, person],
            settings: order.length ? { ...s.settings, quirofanoOrder: [...order, id] } : s.settings,
          }
        }),
      updatePerson: (id, patch) =>
        set((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removePerson: (id) => set((s) => removePersonFrom(s, id, isoOf(new Date()))),
      setShift: (date, personId) => set((s) => ({ shifts: { ...s.shifts, [date]: personId } })),
      setShifts: (assignments) => set((s) => ({ shifts: { ...s.shifts, ...assignments } })),
      removeShift: (date) =>
        set((s) => {
          const { [date]: _, ...rest } = s.shifts
          return { shifts: rest }
        }),
      setQuirofano: (week, personId) =>
        set((s) => {
          const { [week]: _, ...rest } = s.quirofano
          return { quirofano: personId ? { ...rest, [week]: personId } : rest }
        }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      importData: (data) => set({ people: data.people, shifts: data.shifts, quirofano: data.quirofano ?? {}, settings: { ...defaultSettings, ...data.settings } }),
      reset: () => set({ people: [], shifts: {}, quirofano: {}, settings: defaultSettings }),
    }),
    {
      // en un grupo compartido, esto es solo la copia local (sin conexión) de los datos del servidor
      name: GROUP ? `guardias-g-${GROUP}` : 'guardias-v1',
      version: 1,
      // merge profundo de settings: así los ajustes nuevos toman su valor por defecto con datos viejos
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppData>
        return { ...current, ...p, settings: { ...current.settings, ...p.settings } }
      },
      partialize: ({ people, shifts, quirofano, settings }) => ({ people, shifts, quirofano, settings }),
    },
  ),
)
