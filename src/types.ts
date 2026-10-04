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

export type CustomHoliday = { date: string; name: string }

export type Settings = {
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
  settings: Settings
}
