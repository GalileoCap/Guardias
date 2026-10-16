// Íconos de Tabler (@tabler/icons-react). Cada nombre de la app apunta a un ícono de la librería: para cambiar uno
// alcanza con cambiarlo acá. Heredan el color del texto.
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconCalendar,
  IconChartLine,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconHeartRateMonitor,
  IconPlant2,
  IconStethoscope,
  IconX,
} from '@tabler/icons-react'

const ICONS = {
  calendar: IconCalendar,
  settings: IconAdjustmentsHorizontal,
  warning: IconAlertTriangle,
  close: IconX,
  check: IconCheck,
  up: IconChevronUp,
  down: IconChevronDown,
  left: IconChevronLeft,
  right: IconChevronRight,
  arrowUp: IconArrowUp,
  arrowDown: IconArrowDown,
  // Lo que se anota en el calendario
  guardia: IconStethoscope,
  quirofano: IconHeartRateMonitor,
  campo: IconPlant2,
  curva: IconChartLine,
} as const

export type IconName = keyof typeof ICONS

export default function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  const Component = ICONS[name]
  return <Component className={`inline-block shrink-0 ${className}`} aria-hidden="true" />
}
