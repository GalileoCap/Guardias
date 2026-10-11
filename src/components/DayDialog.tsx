import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useMemo } from 'react'
import { CATEGORIES, categoriesOf, hasIssue, rankCandidates } from '../fairness'
import { useHolidayLookup, useIgnoreGhostClick, useProblems, useQuirofano } from '../hooks'
import { useStore } from '../store'

const days = (n: number) => (n === 1 ? '1 día' : `${n} días`)

function nearestLabel(before: number | null, after: number | null) {
  const nearest = Math.min(before ?? Infinity, after ?? Infinity)
  return Number.isFinite(nearest) ? ` · Más cercana: ${days(nearest)}` : ''
}

export default function DayDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const { people, shifts, settings, setShift, removeShift } = useStore()
  const ghostGuard = useIgnoreGhostClick()
  const quirofano = useQuirofano()
  const holiday = useHolidayLookup()
  const holidayName = holiday(date)
  const problems = useProblems()
  const myProblems = shifts[date] ? problems[date] : undefined
  const exists = date in shifts
  const current = shifts[date] ?? null

  const shown = useMemo(() => {
    const keys = categoriesOf(date, holiday)
    return CATEGORIES.filter((c) => keys.includes(c.key as never))
  }, [date, holiday])
  const isWeekend = [0, 6].includes(parseISO(date).getDay())

  const candidates = useMemo(
    () => rankCandidates(date, people, shifts, quirofano, settings, holiday),
    [date, people, shifts, quirofano, settings, holiday],
  )

  const assign = (personId: string | null) => {
    setShift(date, personId)
    onClose()
  }

  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" {...ghostGuard} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-bold first-letter:uppercase">{format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })}</h3>
        <div className="mt-1 flex flex-wrap gap-2">
          {holidayName && <span className="badge badge-error badge-soft">{holidayName}</span>}
          {isWeekend && <span className="badge badge-soft">Fin de semana</span>}
          {!exists && <span className="badge badge-ghost">Sin guardia cargada</span>}
        </div>

        {myProblems && (
          <div className="alert alert-warning alert-soft mt-3 py-2 text-sm">
            <ul className="list-inside list-disc">
              {myProblems.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 mb-2 text-sm text-base-content/70">
          {candidates.length === 0
            ? 'No hay personas activas.'
            : candidates.every(hasIssue)
              ? 'Ninguna opción es ideal. La primera es la que menos perjudica:'
              : 'A quién asignarle (la primera es la más justa):'}
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
                    {i === 0 &&
                      (hasIssue(c) ? (
                        <span className="badge badge-neutral badge-soft badge-sm">La menos mala</span>
                      ) : (
                        <span className="badge badge-success badge-sm">Recomendada</span>
                      ))}
                    {(c.gaps.before === 1 || c.gaps.after === 1) && (
                      <span className="badge badge-warning badge-sm">{c.gaps.before === 1 ? 'guardia ayer' : 'guardia mañana'}</span>
                    )}
                    {c.newSandwich > 0 && <span className="badge badge-warning badge-sm">sanguchito</span>}
                    {c.around === 'avoid' && <span className="badge badge-warning badge-sm">en su semana de quirófano</span>}
                    {c.around === 'prefer' && <span className="badge badge-info badge-soft badge-sm">cerca de su quirófano</span>}
                    {c.weekend && c.weekend.streaks > 0 && (
                      <span className="badge badge-warning badge-sm">
                        {c.weekend.streaks === 2 ? 'finde entre dos suyos' : 'finde seguido'}
                      </span>
                    )}
                  </span>
                  <span className="text-xs opacity-70">
                    {[
                      ...shown.map((cat) => `${cat.short} ${c.counts[cat.key]}`),
                      ...(isWeekend ? [`Libres ${c.counts.freeWeekends}`, `Seguidos ${c.counts.consecutive}`] : []),
                    ].join(' · ')}
                    {nearestLabel(c.gaps.before, c.gaps.after)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-base-content/50">Los números no cuentan esta fecha.</p>

        <div className="modal-action flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {exists && (
              <button
                className="btn btn-error btn-soft btn-sm"
                onClick={() => {
                  removeShift(date)
                  onClose()
                }}
              >
                Quitar guardia
              </button>
            )}
            {(!exists || current) && (
              <button className="btn btn-sm" onClick={() => assign(null)}>
                {exists ? 'Dejar sin asignar' : 'Agregar sin asignar'}
              </button>
            )}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
