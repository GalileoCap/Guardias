import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { dataOf, defaultSettings, emptyData, normalize, removePersonFrom, taskKey } from './data'
import { isoOf } from './dates'
import { GROUP } from './group'
import { withAdvance, withExtension } from './hours'
import type { AppData, Person, Settings, TaskKind } from './types'

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
  /** También quita la extensión y el adelanto del día */
  removeShift: (date: string) => void
  /** Hasta qué hora 'HH:MM' del día siguiente se extiende la guardia de `date`; null = termina a las 8:30 */
  setExtension: (date: string, end: string | null) => void
  /** A qué hora 'HH:MM' del día anterior arranca la guardia de `date`; null = a su hora. Reemplaza a la extensión de la anterior. */
  setAdvance: (date: string, start: string | null) => void
  /** week = lunes de la semana. personId null = sin asignar */
  setQuirofano: (week: string, personId: string | null) => void
  /** Anota que `personId` hizo la tarea el día `date`; reemplaza a quien estuviera anotado: hay una por tarea y día. */
  setTask: (kind: TaskKind, date: string, personId: string) => void
  /** Anota varias de una vez: fecha → persona */
  setTasks: (kind: TaskKind, assignments: Record<string, string>) => void
  removeTask: (kind: TaskKind, date: string) => void
  /** Días de la semana en que toca la tarea en `month` ('YYYY-MM'). null = sin configuración propia: hereda del mes anterior */
  setTaskDays: (kind: TaskKind, month: string, days: number[] | null) => void
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
      tasks: {},
      taskDays: {},
      extensions: {},
      advances: {},
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
          return { shifts: rest, ...withAdvance(withExtension(s, date, null), date, null) }
        }),
      setExtension: (date, end) => set((s) => withExtension(s, date, end)),
      setAdvance: (date, start) => set((s) => withAdvance(s, date, start)),
      setQuirofano: (week, personId) =>
        set((s) => {
          const { [week]: _, ...rest } = s.quirofano
          return { quirofano: personId ? { ...rest, [week]: personId } : rest }
        }),
      setTask: (kind, date, personId) => set((s) => ({ tasks: { ...s.tasks, [taskKey(kind, date)]: { kind, date, personId } } })),
      setTasks: (kind, assignments) =>
        set((s) => ({
          tasks: {
            ...s.tasks,
            ...Object.fromEntries(Object.entries(assignments).map(([date, personId]) => [taskKey(kind, date), { kind, date, personId }])),
          },
        })),
      removeTask: (kind, date) =>
        set((s) => {
          const { [taskKey(kind, date)]: _, ...rest } = s.tasks
          return { tasks: rest }
        }),
      setTaskDays: (kind, month, days) =>
        set((s) => {
          const { [`${kind}:${month}`]: _, ...rest } = s.taskDays
          return { taskDays: days ? { ...rest, [`${kind}:${month}`]: [...days].sort((a, b) => a - b) } : rest }
        }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      importData: (data) => set({ ...emptyData(), ...dataOf(data), settings: { ...defaultSettings, ...data.settings } }),
      reset: () => set(emptyData()),
    }),
    {
      // en un grupo compartido, esto es solo la copia local (sin conexión) de los datos del servidor
      name: GROUP ? `guardias-g-${GROUP}` : 'guardias-v1',
      version: 1,
      // los ajustes pasan por normalize: los nuevos toman su valor por defecto con datos viejos
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppData>
        // lo guardado antes de que las tareas fueran una por día tiene otras claves: se vuelven a armar
        // y los ajustes viejos (el interruptor del quirófano) se migran al modo
        const clean = normalize({ people: [], shifts: {}, tasks: p.tasks, settings: p.settings })
        return { ...current, ...p, tasks: clean?.tasks ?? {}, settings: clean?.settings ?? current.settings }
      },
      partialize: (s) => dataOf(s),
    },
  ),
)
