#!/usr/bin/env bash
# Instala (ou remove) o timer systemd do backup diário deste ambiente. Corre uma vez, na pasta do ambiente.
#   bash scripts/backup-instalar-timer.sh            instala/atualiza e ativa ism-backup@<ambiente>.timer
#   bash scripts/backup-instalar-timer.sh --remover  desativa o timer deste ambiente (os backups ficam)
# Não toca em cron, firewall nem em unidades de outros projetos.
set -euo pipefail

PROJETO="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
if ! [[ "$PROJETO" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "Nome de projeto inválido: '$PROJETO'." >&2
  exit 1
fi
[ -f scripts/backup-db.sh ] || { echo "Corra na pasta do ambiente (ex.: ~/ism-tst)." >&2; exit 1; }
[ "$PWD" = "$HOME/$PROJETO" ] || { echo "A unidade assume $HOME/$PROJETO; pasta atual: $PWD." >&2; exit 1; }
sudo -n true 2>/dev/null || { echo "sudo sem password é obrigatório." >&2; exit 1; }

TIMER="ism-backup@$PROJETO.timer"

if [ "${1:-}" = "--remover" ]; then
  sudo systemctl disable --now "$TIMER" || true
  echo "Timer $TIMER desativado. Unidades em /etc/systemd/system/ism-backup@.* ficam para os outros ambientes."
  exit 0
fi

for u in service timer; do
  sed -e "s|@@USER@@|$(id -un)|g" -e "s|@@HOME@@|$HOME|g" "scripts/systemd/ism-backup@.$u" \
    | sudo tee "/etc/systemd/system/ism-backup@.$u" >/dev/null
done

sudo install -d -m 750 -o root -g "$(id -gn)" /etc/ism-backup
CONF="/etc/ism-backup/$PROJETO.env"
if ! sudo test -f "$CONF"; then
  sudo install -m 640 -o root -g "$(id -gn)" scripts/systemd/backup.env.exemplo "$CONF"
  echo "Criado $CONF (tudo comentado). Preencha BACKUP_PUBKEY, BACKUP_DESTINO e BACKUP_PING_URL."
fi

sudo systemctl daemon-reload
sudo systemctl enable --now "$TIMER"
systemctl list-timers --no-pager "$TIMER"
echo "Para correr já: sudo systemctl start ism-backup@$PROJETO.service && journalctl -u ism-backup@$PROJETO -n 20"
