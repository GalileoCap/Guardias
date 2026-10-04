import { CATEGORIES } from '../fairness'
import { useFairness } from '../hooks'
import { useStore } from '../store'

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

/** Rojo suave si le toca más que al promedio; más intenso cuanto más lejos. Lo demás no se pinta. */
function tint(burden: number) {
  if (burden < 0.05) return undefined
  return `color-mix(in oklab, var(--color-error) ${Math.round(Math.min(burden, 1) * 14)}%, transparent)`
}

/** Nivel de balance a partir del puntaje (0..1). El porcentaje exacto queda como tooltip. */
function level(v: number | null): { label: string; badge: string } {
  if (v === null) return { label: '—', badge: 'badge-ghost' }
  if (v >= 0.85) return { label: 'Balanceado', badge: 'badge-success' }
  if (v >= 0.6) return { label: 'Desbalanceado', badge: 'badge-warning' }
  return { label: 'Muy desbalanceado', badge: 'badge-error' }
}

function Level({ value, size = 'badge-sm' }: { value: number | null; size?: string }) {
  const { label, badge } = level(value)
  return (
    <span className={`badge ${badge} ${size} whitespace-nowrap font-medium`} title={value === null ? 'Sin datos' : pct(value)}>
      {label}
    </span>
  )
}

export default function FairnessBar({
  highlightId,
  onHighlight,
}: {
  highlightId: string | null
  onHighlight: (id: string | null) => void
}) {
  const people = useStore((s) => s.people).filter((p) => p.active)
  const { counts, fairness } = useFairness()

  if (people.length === 0) {
    return (
      <div className="alert alert-info">
        Todavía no hay personas. Agregalas en la pestaña <b>Configuración</b>.
      </div>
    )
  }

  const totalShifts = people.reduce((sum, p) => sum + counts[p.id].total, 0)
  // "Total" y la justicia por persona ya están en las tarjetas de arriba
  const columns = CATEGORIES.filter((c) => c.key !== 'total')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="card card-border bg-base-100 min-w-36 flex-1">
          <div className="card-body gap-1 p-3">
            <div className="text-xs uppercase tracking-wide text-base-content/60">Total</div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{totalShifts}</span>
              <span className="text-xs text-base-content/60">guardias</span>
            </div>
            <Level value={fairness.overall} />
          </div>
        </div>

        {people.map((p) => {
          const active = highlightId === p.id
          const worst = CATEGORIES.filter((c) => fairness.burden[p.id].parts[c.key] >= 0.05)
            .sort((a, b) => fairness.burden[p.id].parts[b.key] - fairness.burden[p.id].parts[a.key])
            .slice(0, 3)
            .map((c) => c.label)
          return (
            <button
              key={p.id}
              className={`card card-border bg-base-100 min-w-36 flex-1 cursor-pointer text-left transition hover:bg-base-200 ${
                active ? 'border-base-content ring-2 ring-base-content' : ''
              }`}
              title={
                (worst.length ? `Le pesa más: ${worst.join(', ')}` : 'Nada por encima del promedio') +
                ` · ${active ? 'Quitar resaltado' : 'Resaltar sus guardias'}`
              }
              onClick={() => onHighlight(active ? null : p.id)}
            >
              <div className="card-body gap-1 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="inline-block size-3 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">{counts[p.id].total}</span>
                  <span className="text-xs text-base-content/60">guardias</span>
                </div>
                <Level value={fairness.burden[p.id].justice} />
              </div>
            </button>
          )
        })}
      </div>

      <div className="card card-border bg-base-100 min-w-0 overflow-x-auto">
        <table className="table table-sm text-center">
          <thead>
            <tr>
              <th className="text-left">&nbsp;</th>
              {columns.map((c) => (
                <th key={c.key} title={c.hint} className="font-medium">
                  <div>{c.label}</div>
                  <div className="mt-1">
                    <Level value={fairness.perCategory[c.key]} size="badge-xs" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className={highlightId === p.id ? 'bg-base-200' : ''}>
                <td className="text-left whitespace-nowrap">
                  <button
                    className="flex cursor-pointer items-center gap-2 font-medium hover:underline"
                    title={highlightId === p.id ? 'Quitar resaltado' : `Resaltar las asignaciones de ${p.name}`}
                    onClick={() => onHighlight(highlightId === p.id ? null : p.id)}
                  >
                    <span className="inline-block size-3 rounded-full" style={{ background: p.color }} />
                    {p.name}
                  </button>
                </td>
                {columns.map((c) => {
                  const value = counts[p.id][c.key]
                  const delta = value - fairness.means[c.key]
                  return (
                    <td
                      key={c.key}
                      style={{ background: tint(fairness.burden[p.id].parts[c.key]) }}
                      title={
                        `Promedio: ${fairness.means[c.key].toFixed(1)}` +
                        (Math.abs(delta) < 0.05 ? '' : ` (${delta > 0 ? '+' : ''}${delta.toFixed(1)})`) +
                        (c.key === 'sandwich' && counts[p.id].minGap !== null
                          ? ` · Menor distancia entre guardias: ${counts[p.id].minGap} día(s)`
                          : '') +
                        (c.key === 'freeLongWeekends' ? ` · ${counts[p.id].longWeekends} finde(s) largo(s) con guardias cargadas` : '')
                      }
                    >
                      <span className="text-lg font-semibold">{value}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 pb-3 text-xs text-base-content/60">
          Rojo: le toca más que al promedio (en Findes libres, tener menos es lo peor).
        </p>
      </div>
    </div>
  )
}
