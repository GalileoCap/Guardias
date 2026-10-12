# Deploy

Un solo proceso Node sin dependencias (`server/index.mjs`) sirve el frontend y guarda cada grupo como un JSON en disco.
Mientras está activo usa ~60 MB (un Node vacío ya usa ~33). No hay base de datos ni procesos extra.

## Cómo se comparte

- Sin `?group=` la app funciona como antes: todo en `localStorage`, sin servidor.
- En Configuración → Datos → Compartir… se crea un grupo con los datos actuales y pasa a `?group=<id>`. El id (128 bits al azar) es el secreto: quien tenga el enlace edita.
- Cada cambio se manda como parche por clave (día, persona, ajuste) ~0,7 s después de editar, y el servidor lo fusiona con lo que haya. Dos personas editando días distintos no se pisan. En el mismo día gana el último.
- Cada pestaña consulta cada minuto, si está visible, si hay revisión nueva (responde 304, casi gratis) y al volver a primer plano.
- Sin conexión los cambios quedan en el navegador y salen solos al volver.

## Con Docker

```bash
docker compose up -d --build
```

Escucha en `127.0.0.1:3000` con tope de 64 MB y 0,25 CPU. Los datos van al volumen `guardias-data`. Ponelo detrás del proxy que ya tengas (HTTPS lo resuelve el proxy). Ejemplo en Caddy:

```
guardias.ejemplo.com {
    reverse_proxy 127.0.0.1:3000
}
```

La app usa rutas relativas, así que también anda bajo un subpath si el proxy lo quita (`handle_path /guardias/* { reverse_proxy ... }`).

## Sin Docker

Requiere Node ≥ 22.13 para compilar (el servidor ya compilado corre en cualquier Node moderno).

```bash
npm ci && npm run build
HOST=127.0.0.1 PORT=3000 DATA_DIR=/var/lib/guardias node --max-old-space-size=40 server/index.mjs
```

`npm run build` deja `dist/` (con `.br`/`.gz` ya comprimidos) y `server/shared.js` (la lógica de fusión compartida con el cliente, sin tipos).

## Variables

| Variable | Default | |
| --- | --- | --- |
| `PORT` | 3000 | |
| `HOST` | 127.0.0.1 | en Docker es 0.0.0.0 |
| `DATA_DIR` | `./data` | un `<id>.json` por grupo |
| `DIST_DIR` | `./dist` | |
| `MAX_GROUPS` | 200 | tope de grupos, para que nadie llene el disco |
| `IDLE_MS` | 0 | si es mayor que 0, el proceso sale solo tras ese tiempo sin pedidos |

Si systemd entrega el socket (`LISTEN_FDS`), el servidor escucha ahí y se ignoran `PORT` y `HOST`.

## En Opalstack

El proceso no queda residente. `systemd --user` retiene el puerto 12414 con `guardias.socket` y levanta `guardias.service` con el primer pedido (~0,1 s). El servicio sale solo tras 5 minutos sin pedidos (`IDLE_MS` en `deploy/guardias.service`) y no se reinicia hasta el pedido siguiente. Una pestaña abierta y visible consulta cada minuto, así que la mantiene despierta.

- `./deploy.sh` instala las unidades de `deploy/` en `~/.config/systemd/user/`, habilita el socket y baja el servicio para que la verificación lo despierte.
- Estado: `systemctl --user status guardias.socket guardias.service`.
- Los logs siguen en `~/logs/apps/guardias/`. El usuario no puede leer el journal.
- El cron `*/10` que ejecutaba `start` ya no existe: reviviría el proceso apenas se apagara. `start` y `stop` del panel solo manejan las unidades.

## Respaldo

Copiar `DATA_DIR` alcanza (archivos chicos, escritura atómica). También se puede exportar desde la app.
`./deploy.sh` baja antes de cada despliegue un backup de los datos de producción a `backups/` (ignorada por git).

## Desarrollo

`npm run dev:server` (API en :3002, datos en `.data/`) más `npm run dev` (el proxy de Vite manda `/api` a :3002).
