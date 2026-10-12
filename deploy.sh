#!/usr/bin/env bash
# Compila y publica en Opalstack: sube dist/, server/ y las unidades de systemd, reinicia la app y verifica que responda.
# Los datos (~/apps/guardias/data) no se tocan, y antes de subir se baja un backup a ./backups/ (si falla, no se despliega). Variables opcionales: DEPLOY_HOST, DEPLOY_DIR, DEPLOY_URL.
set -euo pipefail
cd "$(dirname "$0")"

HOST=${DEPLOY_HOST:-opal}
APP=${DEPLOY_DIR:-apps/guardias}
URL=${DEPLOY_URL:-https://guardias.smplworks.net}

# Una sola conexión SSH para todo: el servidor corta las conexiones nuevas seguidas
SSH_OPTS="-o ControlMaster=auto -o ControlPath=/tmp/ssh-guardias-%C -o ControlPersist=60"
ssh_() { ssh $SSH_OPTS "$HOST" "$@"; }
trap 'ssh $SSH_OPTS -O exit "$HOST" 2>/dev/null || true' EXIT

echo "→ Compilando"
npm run build

echo "→ Conectando a $HOST"
for i in 1 2 3 4 5 6; do
  ssh_ true 2>/dev/null && break
  [ "$i" = 6 ] && { echo "✗ No pude conectar por SSH." >&2; exit 1; }
  echo "  (conexión rechazada, reintento en 15 s)"
  sleep 15
done

echo "→ Backup de los datos de producción"
mkdir -p backups
backup="backups/guardias-data-$(date +%Y%m%d-%H%M%S).tar.gz"
ssh_ "tar -czf - -C ~/$APP data" > "$backup"
tar -tzf "$backup" > /dev/null || { echo "✗ El backup quedó dañado: $backup" >&2; exit 1; }
echo "  $backup ($(ls "$backup" | wc -l | tr -d ' ') archivo, $(du -h "$backup" | cut -f1))"

echo "→ Subiendo"
rsync -a --delete -e "ssh $SSH_OPTS" dist/ "$HOST:$APP/myproject/dist/"
rsync -a -e "ssh $SSH_OPTS" server/index.mjs server/shared.js "$HOST:$APP/myproject/server/"

echo "→ Reiniciando"
# systemd retiene el puerto y levanta el servicio con el primer pedido: se instalan las unidades, se baja el servicio y la verificación de abajo lo vuelve a despertar
ssh_ "mkdir -p ~/.config/systemd/user" && rsync -a -e "ssh $SSH_OPTS" deploy/guardias.socket deploy/guardias.service "$HOST:.config/systemd/user/"
# si quedó el proceso del esquema anterior (daemonize), tiene el puerto y se baja antes de que systemd lo tome
ssh_ "cd ~/$APP && if [ -e tmp/node.pid ] && pgrep -F tmp/node.pid > /dev/null; then pkill -g \$(cat tmp/node.pid); sleep 2; rm -f tmp/node.pid; fi"
ssh_ "systemctl --user daemon-reload && systemctl --user enable --now guardias.socket && systemctl --user stop guardias.service"

echo "→ Verificando $URL"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null "$URL/"; then ok=1; break; fi
  sleep 1
done
[ "${ok:-}" = 1 ] || { echo "✗ No responde. Revisá ~/logs/apps/guardias/error.log en el servidor." >&2; exit 1; }

# el JS que referencia el index publicado tiene que existir (si no, quedó un dist a medias)
asset=$(curl -fsS "$URL/" | grep -o 'assets/[^"]*\.js' | head -1)
curl -fsS -o /dev/null "$URL/$asset"
echo "✓ Publicado ($asset)"
