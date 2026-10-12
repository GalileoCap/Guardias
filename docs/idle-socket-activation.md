# Proceso que duerme sin pedidos (systemd socket activation)

Lo hicimos en `guardias` el 2026-10-12, en el mismo host de Opalstack (`ssh opal`, usuario 1211). Este documento cuenta qué se hizo, qué aprendimos y qué hay que comprobar antes de copiarlo a otra app. Commit de referencia: `cce8035`.

## Objetivo y resultado

Bajar la memoria que `guardias` ocupa en la cuenta cuando nadie la usa. Antes: un Node residente de 60 a 67 MB las 24 horas. Ahora: cero procesos. systemd retiene el puerto, levanta el servicio con el primer pedido (~0,1 s de arranque, ~1 s en total desde afuera) y el servicio sale solo tras 5 minutos sin pedidos. Verificado en producción: se apagó a los 5 minutos y el pedido siguiente lo despertó con 200.

## Las cinco piezas

1. El proceso sale solo. Variable `IDLE_MS` (0 = desactivado). Cada pedido reinicia un `setTimeout`. Al vencer cierra el servidor, cierra las conexiones keep-alive ociosas y sale con código 0. Ver `touch()` y `stop()` en `server/index.mjs`.
2. El proceso acepta el socket de systemd. Si `LISTEN_FDS >= 1` y `LISTEN_PID` es su pid, hace `server.listen({ fd: 3 })` y ignora PORT y HOST. Si no, escucha como siempre, así que desarrollo y Docker no cambian.
3. Una unidad `.socket` en `~/.config/systemd/user/` con `ListenStream=127.0.0.1:<puerto del panel>`. Es el único que queda residente y es el propio `systemd --user`, que ya corría.
4. Una unidad `.service` sin `Restart=`. Si saliera con Restart, no se apagaría nunca. Lleva `Requires=` y `After=` del socket, `WorkingDirectory`, `Environment=IDLE_MS=...` y los logs con `StandardOutput=append:` y `StandardError=append:` (systemd 252 lo soporta). Ver `deploy/guardias.socket` y `deploy/guardias.service`.
5. Se saca lo que revivía el proceso. Había un cron cada 10 minutos que ejecutaba el `start` del panel. Si queda, el proceso se reinicia apenas se apaga y no se ahorra nada. Se quitó solo esa línea del crontab (compartido con otras apps), con copia previa.

## Condiciones del host (ya comprobadas)

- AlmaLinux 9.8, systemd 252, `systemctl --user` funciona por SSH.
- `Linger=yes` para el usuario, así que las unidades sobreviven a la sesión y arrancan con el servidor.
- El usuario no puede leer el journal. Por eso los logs van a archivos en `~/logs/apps/<app>/`.
- El proxy de Opalstack apunta a `127.0.0.1:<puerto>`. Con el socket de systemd en ese puerto no cambia nada del lado del panel.

## Cómo se probó (conviene repetirlo igual)

1. Test del apagado, escrito a ciegas: `server/idle.test.mjs` levanta el servidor con `IDLE_MS=300`, comprueba que sale con código 0, que cada pedido reinicia el reloj y que sin `IDLE_MS` no sale. Fallaba antes de implementar.
2. Prueba del socket real en un puerto lateral del servidor, con unidades de prueba (`guardias-test.socket` y `.service` en el puerto 12499, `IDLE_MS=5000`, datos descartables): pedido en frío arranca el servicio, pedidos seguidos lo mantienen, a los 7 s sin pedidos queda `inactive` con el socket `active`, el pedido siguiente lo vuelve a levantar. Se borraron las unidades al terminar. Esto se hizo antes de tocar producción.
3. Corte en producción con backup previo de los datos (`deploy.sh` ya lo hace), en este orden: quitar la línea del cron, bajar el proceso viejo (daemonize) justo antes de que systemd tome el puerto, instalar unidades, `enable --now` del socket, bajar el servicio y verificar con un pedido que lo despierta.
4. Dejar el `start` y el `stop` del panel como wrappers de `systemctl --user`, con los originales guardados (`start.daemonize`, `stop.daemonize`), para que nadie levante el proceso viejo a mano y choque con el puerto.

Marcha atrás: restaurar el crontab desde la copia, `systemctl --user disable --now <app>.socket` y ejecutar el `start` original.

## Antes de copiarlo a Ainas: preguntas que hay que contestar leyendo su repo

No miré Ainas. Por el listado de procesos de la cuenta, corre en contenedores de podman sin privilegios (`ainas_backend_1` con uvicorn de ~150 MB, `ainas_db_1`, `ainas_nginx_1`), distinto de un Node suelto. Eso cambia varias cosas:

- Qué conviene dormir. El backend es el que pesa. Una base de datos apagada y encendida con cada pedido puede tardar segundos y exponerse a recuperación de arranque, así que probablemente la base y nginx se queden y solo duerma el backend. Hay que medir la memoria de cada contenedor antes de decidir.
- Cuánto tarda en arrancar el backend en frío. Si son varios segundos, el primer pedido después de una pausa va a tardar eso. Revisar los timeouts del frontend y del proxy.
- Quién más necesita el backend despierto. El cron diario de las 03:22 corre `deploy/backup.sh`. Si ese script habla con el backend o con la base, hay que ver qué pasa cuando está dormido. Lo mismo para tareas programadas dentro del backend, websockets, colas o cualquier trabajo en segundo plano: el apagado por inactividad solo vale si la app no hace nada cuando nadie la llama.
- Cómo entra el socket a un contenedor. Con podman rootless la activación por socket pasa por una unidad que lanza `podman run` y reenvía el descriptor, y la app dentro tiene que aceptar `LISTEN_FDS` (uvicorn tiene `--fd`). No lo probé con podman, hay que verificarlo en un puerto lateral antes de cambiar nada.
- Estado en memoria. `guardias` guarda todo en archivos y el servidor no recuerda nada entre pedidos. Si Ainas guarda sesiones, cachés o conexiones abiertas en memoria, el apagado las pierde.
- Lo que revive procesos. Buscar cualquier cron, `restart: always` o política de reinicio de podman que levante los contenedores otra vez.

## Reglas para trabajar en la cuenta compartida

- Producción se toca después de la prueba en puerto lateral, con backup bajado y solo si el dueño lo pidió. Una unidad de prueba se borra al terminar.
- El crontab es compartido con otras apps: guardar copia y quitar solo la línea propia.
- No tocar los contenedores ni los datos de `guardias`, ni al revés.
