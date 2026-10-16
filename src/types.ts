export type Person = {
  id: string
  name: string
  color: string
  active: boolean
}

/** 'YYYY-MM-DD' -> id de la persona asignada (null = hay guardia pero sin asignar) */
export type Shifts = Record<string, string | null>

/** 'YYYY-MM-DD' del lunes de la semana -> id de quien está de quirofanero */
export type Quirofano = Record<string, string>

export type TaskKind = 'curva' | 'campo'

/** Quién hizo la tarea el día `date`. No cuenta en la justicia. */
export type Task = { kind: TaskKind; date: string; personId: string }

/** Una Curva y un Campo por día como máximo: la clave es `taskKey(kind, date)` (ver data.ts) */
export type Tasks = Record<string, Task>

/**
 * Días de la semana (0 = domingo … 6 = sábado) en que toca cada tarea, por mes: 'curva:2026-10' -> [2, 4].
 * Un mes sin clave hereda del último mes anterior que la tenga; una lista vacía es explícita ("este mes no toca").
 */
export type TaskDays = Record<string, number[]>

export type CustomHoliday = { date: string; name: string }

export type Settings = {
  /** Usar el quirófano (el quirofanero de cada semana). Se apaga en los grupos que no hacen quirofanismo (p. ej. R2) */
  quirofanoEnabled: boolean
  /** Orden fijo de rotación del quirófano (ids de personas); al final vuelve al primero */
  quirofanoOrder: string[]
  /** Usar feriados nacionales de Argentina (librería date-holidays) */
  autoHolidays: boolean
  customHolidays: CustomHoliday[]
  /** Ignorar guardias anteriores a esta fecha al calcular el balance ('YYYY-MM-DD') */
  countFrom: string | null
}

export type AppData = {
  people: Person[]
  shifts: Shifts
  quirofano: Quirofano
  tasks: Tasks
  taskDays: TaskDays
  settings: Settings
}
