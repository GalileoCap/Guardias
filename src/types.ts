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

/** Una vez que alguien hizo la tarea el día `date`. Puede haber varias por semana y no cuentan en la justicia. */
export type Task = { kind: TaskKind; date: string; personId: string }

/** id de la anotación -> anotación */
export type Tasks = Record<string, Task>

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
  settings: Settings
}
