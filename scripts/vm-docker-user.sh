#!/usr/bin/env bash
# Bloqueia o acesso direto da internet às portas web publicadas pelo ISM (85 = TST, 86 = HML).
# O nginx de borda (imovelsearcher-proxy) continua a chegar a 10.0.0.24:85/86 pela rede do Docker.
# As portas publicadas pelo Docker passam pela chain FORWARD, não pela INPUT: ufw e INPUT não as filtram.
# A regra fica na DOCKER-USER, que o Docker não reescreve. Só toca nas portas do ISM. Ver docs/runbook-endurecimento-vm.md.
#
#   sudo bash scripts/vm-docker-user.sh aplicar | remover | status
set -euo pipefail

PORTAS="${ISM_PORTAS_WEB:-85 86}"
IFACE="${ISM_IFACE_EXTERNA:-$(ip route show default | awk 'NR==1 {print $5}')}"
TAG="ism-hardening"

[ -n "$IFACE" ] || { echo "Interface externa não encontrada (defina ISM_IFACE_EXTERNA)." >&2; exit 1; }
iptables -n -L DOCKER-USER >/dev/null 2>&1 || { echo "Chain DOCKER-USER não existe (Docker parado?)." >&2; exit 1; }

regra() { # porta
  echo "DOCKER-USER -i $IFACE -p tcp -m conntrack --ctorigdstport $1 --ctdir ORIGINAL -m comment --comment $TAG -j DROP"
}

case "${1:-status}" in
  aplicar)
    for p in $PORTAS; do
      # shellcheck disable=SC2046
      iptables -C $(regra "$p") >/dev/null 2>&1 || iptables -I $(regra "$p")
    done
    ;;
  remover)
    for p in $PORTAS; do
      # shellcheck disable=SC2046
      while iptables -C $(regra "$p") >/dev/null 2>&1; do iptables -D $(regra "$p"); done
    done
    ;;
  status) ;;
  *) echo "Uso: $0 aplicar|remover|status" >&2; exit 2 ;;
esac

iptables -S DOCKER-USER
