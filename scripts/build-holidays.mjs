// Genera src/holidays-ar.json con los feriados nacionales de Argentina (fecha -> nombre) que calcula date-holidays.
// La librería pesa ~2 MB con sus dependencias (moment-timezone, astronomia…): se usa solo acá, en desarrollo, y la app
// consulta el JSON resultante (unos 20 KB). Volver a correr con `npm run holidays` si se necesitan más años.
import fs from 'node:fs'
import Holidays from 'date-holidays'

const FROM = 2018
const TO = 2050
const ar = new Holidays('AR')
const out = {}
for (let year = FROM; year <= TO; year++) {
  for (const h of ar.getHolidays(year)) {
    if (h.type === 'public') out[h.date.slice(0, 10)] = h.name
  }
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
fs.writeFileSync('src/holidays-ar.json', JSON.stringify(sorted) + '\n')
console.log(`src/holidays-ar.json: ${Object.keys(sorted).length} feriados (${FROM}–${TO})`)
