import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useMemo } from 'react'
import { rankQuirofano } from '../fairness'
import { useHolidayLookup, useQuirofano } from '../hooks'
import { useStore } from '../store'

const fmt = (d: Date) => format(d, "d 'de' MMM", { locale: es })

export default function QuirofanoDialog({ week, onClose }: { week: string; onClose: () => void }) {
  const { people, quirofano: manualMap, settings, setQuirofano } = useStore()
  const quirofano = useQuirofano() // lo cargado a mano + lo autocompletado por el orden
  const holiday = useHolidayLookup()
  const manual = manualMap[week] ?? null
  const current = quirofano[week] ?? null
  const start = parseISO(week)

  const candidates = useMemo(
    () => rankQuirofano(week, people, quirofano, settings, holiday),
    [week, people, quirofano, settings, holiday],
  )

  const assign = (personId: string | null) => {
    setQuirofano(week, personId)
    onClose()
  }

  return (
    <dialog className="modal modal-open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-bold">Quirófano</h3>
        <p className="text-sm text-base-content/70">
          Semana del {fmt(start)} al {fmt(addDays(start, 6))}
          {!manual && current && <span className="badge badge-ghost badge-sm ml-2">Automático según el orden</span>}
        </p>

        <p className="mt-4 mb-2 text-sm text-base-content/70">
          {candidates.length === 0
            ? 'No hay personas activas.'
            : candidates[0].expected
              ? 'Quién va de quirofanero (la primera es la que sigue en el orden):'
              : 'Quién va de quirofanero (la primera es la más justa):'}
        </p>
        <ul className="flex flex-col gap-1">
          {candidates.map((c, i) => (
            <li key={c.person.id}>
              <button
                className={`btn btn-block h-auto justify-start gap-3 whitespace-normal py-2 text-left font-normal ${
                  current === c.person.id ? 'btn-primary' : 'btn-ghost border-base-300'
                }`}
                onClick={() => assign(c.person.id)}
              >
                <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: c.person.color }} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    {c.person.name}
                    {c.expected ? (
                      <span className="badge badge-success badge-sm">Le toca por el orden</span>
                    ) : (
                      i === 0 && <span className="badge badge-success badge-sm">Recomendada</span>
                    )}
                    {(c.adjacent.before || c.adjacent.after) && (
                      <span className="badge badge-warning badge-sm">
                        {c.adjacent.before ? 'semana anterior' : 'semana siguiente'}
                      </span>
                    )}
                  </span>
                  <span className="text-xs opacity-70">
                    {c.count} semana{c.count === 1 ? '' : 's'} de quirófano
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-base-content/50">Los números no cuentan esta semana.</p>

        <div className="modal-action justify-between">
          {manual ? (
            <button className="btn btn-sm btn-error btn-soft" onClick={() => assign(null)}>
              Volver al orden automático
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
