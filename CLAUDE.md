# Guardias

Agenda de guardias para residentes: calendario, tabla de justicia y recomendaciones. React 19, Vite, TypeScript, zustand, FullCalendar, DaisyUI. Sincronización opcional contra `server/index.mjs`. Se responde, se comenta y se commitea en español.

Las reglas globales de `~/.claude/CLAUDE.md` rigen acá. Lo que sigue las completa.

## Gates

- `npm run build` (tsc sobre `src/` incluidos los tests, vite, precompresión y servidor) termina sin errores ni warnings. Un warning de Vite se arregla en el código o la config de build, sin subir el límite.
- `npm test` (vitest) pasa entero y cada test tiene tope de 3 s en `vite.config.ts`. Un test que no entre en ese tope es un hallazgo: se acepta con su razón escrita al lado, no se sube el tope. Los de `src/fairness.test.ts` y `src/search.test.ts` se escribieron a ciegas, desde las firmas y sus comentarios.
- Un fix de un defecto entra con un test que fallaba antes. Un cambio visual o de interacción se prueba manejando la app (`.claude/launch.json`: `guardias` para desarrollo, `guardias-dist` para el build compilado) y se dice qué escenarios corrieron.

## Justicia y recomendaciones

- `src/fairness.ts` define el puntaje (`scoreShifts`, `compareScores`) y `src/search.ts` lo maximiza con un evaluador incremental sobre arreglos tipados. Los dos tienen que dar exactamente el mismo puntaje para cualquier calendario. Quien cambie una categoría, un peso o el orden de comparación en uno cambia el otro en el mismo commit. El test diferencial de `src/search.test.ts` (200 calendarios aleatorios para grupos de 3 y de 4) lo comprueba.
- Los datos viven en `localStorage` bajo `guardias-v1` (zustand persist) y, con `?group=`, en el servidor. Un cambio en la forma de lo guardado necesita migración.

## Deploy

- Se despliega solo con `./deploy.sh` (host `opal`, https://guardias.smplworks.net) y solo cuando se pide. El script baja antes un backup de los datos de producción a `backups/` (ignorada por git) y aborta si falla. Ningún otro camino de deploy sin ese backup.
- Detalles de operación en `DEPLOY.md`.

## Git

- El dueño autorizó expresamente que Claude maneje el repo y pushee a `origin` (`git@github.com:GalileoCap/Guardias.git`, rama `main`) después de commitear, sin pedir permiso cada vez. Esto reemplaza para este proyecto la regla global "publicar es del dueño". Un push nunca implica deploy.
- `CLAUDE.local.md` queda sin commitear.
