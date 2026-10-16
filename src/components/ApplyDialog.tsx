import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { BAD_CATEGORIES, CATEGORIES, type Score } from '../fairness'
import { useIgnoreGhostClick } from '../hooks'
import type { Person } from '../types'

export type Reshuffle = {
  /** Guardias ya cargadas que cambiarían de persona */
  changes: { date: string; from: Person; to: Person }[]
  /** Solo completar las sin asignar del mes */
  fillOnly: Record<string, string>
  /** Completar las sin asignar y además reacomodar las cargadas */
  reshuffle: Record<string, string>
  /** Cómo queda el reparto en cada caso */
  before: Score
  afterFill: Score
  afterReshuffle: Score
}

const labelOf = (key: string) => CATEGORIES.find((c) => c.key === key)!.label

/** Dos puntos de color con una flecha: de quién a quién. */
function Dot({ person }: { person: Person }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block size-3 rounded-full" style={{ background: person.color }} />
      {person.name}
    </span>
  )
}

/** Cantidad de cada cosa mala antes y después, y qué tan parejo queda el reparto. */
function Summary({ title, score, base }: { title: string; score: Score; base: Score }) {
  return (
    <div className="rounded-box border border-base-300 p-2 text-xs">
      <div className="mb-1 font-medium">{title}</div>
      <ul className="flex flex-col gap-0.5">
        {BAD_CATEGORIES.map((key, i) => (
          <li key={key} className="flex justify-between gap-2">
            <span className="opacity-70">{labelOf(key)}</span>
            <span className={score.bad[i] < base.bad[i] ? 'text-success' : score.bad[i] > base.bad[i] ? 'text-error' : ''}>
              {base.bad[i]} → {score.bad[i]}
            </span>
          </li>
        ))}
        <li className="flex justify-between gap-2">
          <span className="opacity-70">Reparto parejo</span>
          <span>
            {Math.round(base.fair * 100)}% → {Math.round(score.fair * 100)}%
          </span>
        </li>
      </ul>
    </div>
  )
}

/**
 * Se muestra cuando aplicar las recomendaciones podría mejorar el mes cambiando guardias que ya estaban cargadas:
 * por defecto no se toca nada de lo cargado.
 */
export default function ApplyDialog({
  data,
  taskCount,
  onFillOnly,
  onReshuffle,
  onClose,
}: {
  data: Reshuffle
  /** Curvas y Campos recomendados que se anotan con cualquiera de las dos opciones */
  taskCount: number
  onFillOnly: () => void
  onReshuffle: () => void
  onClose: () => void
}) {
  const ghostGuard = useIgnoreGhostClick()
  const fillCount = Object.keys(data.fillOnly).length
  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" {...ghostGuard} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-bold">¿Cambiar también guardias ya cargadas?</h3>
        <p className="mt-2 text-sm text-base-content/70">
          Reacomodando {data.changes.length === 1 ? 'una guardia que ya pusiste' : `${data.changes.length} guardias que ya pusiste`} el reparto del mes
          queda mejor. Si no querés tocar lo cargado, se completan solo las que están sin asignar.
        </p>

        <ul className="mt-3 flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
          {data.changes.map(({ date, from, to }) => (
            <li key={date} className="flex items-center gap-2">
              <span className="w-24 shrink-0 first-letter:uppercase">{format(parseISO(date), 'EEE d/M', { locale: es })}</span>
              <Dot person={from} />
              <span className="opacity-50">→</span>
              <Dot person={to} />
            </li>
          ))}
        </ul>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Summary title="Solo completar" score={data.afterFill} base={data.before} />
          <Summary title="Completar y reacomodar" score={data.afterReshuffle} base={data.before} />
        </div>

        <div className="modal-action flex-wrap justify-end gap-2">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-sm" disabled={fillCount + taskCount === 0} onClick={onFillOnly}>
            Solo completar ({fillCount + taskCount})
          </button>
          <button className="btn btn-sm btn-primary" onClick={onReshuffle}>
            Completar y reacomodar
          </button>
        </div>
      </div>
    </dialog>
  )
}
