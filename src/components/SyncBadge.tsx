import { GROUP } from '../group'
import { useSyncStatus } from '../sync'

const LABELS = {
  loading: { text: 'Conectando…', cls: 'badge-ghost', tip: 'Buscando los datos del grupo' },
  synced: { text: 'Sincronizado', cls: 'badge-success', tip: 'Todo guardado en el servidor' },
  saving: { text: 'Guardando…', cls: 'badge-info', tip: 'Cambios pendientes de enviar' },
  offline: { text: 'Sin conexión', cls: 'badge-warning', tip: 'Los cambios quedan en este navegador y se reintenta solo' },
  notfound: { text: 'Grupo no encontrado', cls: 'badge-error', tip: 'Revisá el enlace: ese grupo no existe en el servidor' },
} as const

/** Estado de la sincronización; no aparece en modo local. */
export default function SyncBadge() {
  const status = useSyncStatus((s) => s.status)
  if (!GROUP) return null
  const { text, cls, tip } = LABELS[status]
  return (
    <span className={`badge ${cls} ml-auto whitespace-nowrap font-medium`} title={tip}>
      {text}
    </span>
  )
}
