# Runbook: endurecimento da VM (ISMF-11)

VM Oracle (Ubuntu 22.04 arm64, IP privado `10.0.0.24`, interface `enp0s6`) partilhada com outros projetos em Docker. O nginx de borda `imovelsearcher-proxy` (projeto `imovel_checker`) atende `ism-tst.valtre.com.br` e `ism-hml.valtre.com.br` em 80/443 e chega ao ISM por `http://10.0.0.24:85` (TST) e `:86` (HML).

Regra deste runbook: só mexe no que é do ISM ou é do host (SSH). Não altera portas nem contentores de outros projetos.

## Estado em 2026-10-09 (só leitura)

| Item | Estado |
|------|--------|
| Security List / NSG da OCI | De fora, só 22, 80 e 443 respondem. 85, 86, 5434, 6379, 1433, 5436, 5050, 3011, 3012, 5003, 5005, 5006, 5010, 5011, 3005, 5002 e 111 estão filtradas. |
| Firewall do host | `ufw` inativo, mas a imagem da Oracle traz `iptables` + `netfilter-persistent` (`/etc/iptables/rules.v4`): INPUT aceita 22, 80, 443, 3005, 5002, loopback e ligações estabelecidas, e rejeita o resto. FORWARD com política DROP. `DOCKER-USER` vazia. Sem IPv6 global. |
| Portas do ISM | Postgres `127.0.0.1:5434` (TST) e `127.0.0.1:5435` (HML); Redis só em rede interna; API sem porta publicada; web `0.0.0.0:85` (TST) e `0.0.0.0:86` (HML), precisa de ficar acessível ao proxy. |
| SSH | Só chave (`passwordauthentication no`, `kbdinteractiveauthentication no`). `permitrootlogin without-password`, mas o `authorized_keys` do root só imprime "login as ubuntu". `maxauthtries 6`, `x11forwarding yes`. Utilizadores com chave: `ubuntu`, `opc`, `root`. Nos últimos 7 dias só `ubuntu` entrou (403 logins). |
| Ataques | 3282 linhas de falha/preauth no log do `ssh` nas últimas 24 h. |
| fail2ban | Não instalado. |
| Patches | `unattended-upgrades` ativo. |

Portas publicadas em `0.0.0.0` por outros projetos (protegidas hoje só pela Security List): 5436 (Postgres `treino`), 6379 (`siga-redis`), 1433 (`siga-sqlserver`), 5050 (pgAdmin), 3011, 3012, 5003, 5005, 5006, 5010, 5011. Não são do ISM; ver "Opcional" no fim.

O `docker-compose.yml` do ISM não precisa de mudança: Postgres e Redis já não estão expostos. A web não pode ir para `127.0.0.1`, porque o proxy é um contentor e chega por `10.0.0.24`. Publicar só em `10.0.0.24` não muda a exposição (o IP público da OCI é NAT para esse IP). A alternativa sem porta publicada seria ligar o serviço `web` à rede `proxy-network` e o proxy usar `ism-tst-web-1:80`, mas isso muda a configuração do nginx de outro projeto.

## Porque não `ufw enable`

1. As portas publicadas pelo Docker (`ports:`) são DNAT para a chain FORWARD. O `ufw` filtra a INPUT, por isso não as protege.
2. A imagem Ubuntu da Oracle gere o firewall por `iptables`/`netfilter-persistent`, com regras `InstanceServices` (iSCSI do volume de boot, metadados). A Oracle avisa que alterar ou remover essas regras pode deixar a instância sem arrancar. Ligar o `ufw` por cima mete um segundo gestor de regras na mesma máquina.

O equivalente ao `ufw default deny incoming; allow 22,80,443` já existe na INPUT. O que faltava é a camada da FORWARD para as portas do ISM (passo 2).

## Antes de começar

- Manter uma sessão SSH aberta durante todo o runbook. Testar cada mudança numa segunda sessão.
- Ter acesso à Cloud Shell / consola serial da instância na OCI como plano B.
- Guardar o estado atual:

```sh
sudo iptables-save > ~/antes-iptables-$(date +%F).rules
sudo sshd -T > ~/antes-sshd-$(date +%F).txt
```

## Passo 1. Security List / NSG da OCI (consola, sem tocar na VM)

Consola OCI → Compute → instância → VNIC principal → Subnet → Security Lists, e também Network Security Groups da VNIC.

Entrada esperada, e nada além disso:

| Origem | Protocolo/porta | Motivo |
|--------|-----------------|--------|
| 0.0.0.0/0 | TCP 80, 443 | nginx de borda |
| 0.0.0.0/0 (ver nota) | TCP 22 | SSH do deploy (GitHub Actions) e da equipa |
| 0.0.0.0/0 | ICMP tipo 3 código 4 | path MTU (regra padrão da OCI) |
| 10.0.0.0/16 (VCN) | ICMP tipo 3 | regra padrão da OCI |

Nota sobre a 22: os runners do GitHub Actions não têm IP fixo, por isso restringir a origem quebra o deploy. Alternativas (decisão): runner self-hosted na VM ou Tailscale, e então fechar a 22 só para IPs da equipa. Até lá, SSH só por chave + fail2ban (passos 3 e 4).

Com a CLI:

```sh
oci network security-list get --security-list-id <ocid> --query 'data."ingress-security-rules"'
oci network nsg rules list --nsg-id <ocid> --direction INGRESS
```

Verificação de fora (outra máquina):

```sh
nmap -Pn -p- --open 137.131.172.202     # esperado: 22, 80, 443
```

Rollback: repor a regra removida na consola.

## Passo 2. Fechar 85/86 ao exterior na `DOCKER-USER`

Defesa em profundidade: se alguém abrir a 85/86 na Security List, o ISM continua acessível só pelo proxy (com TLS).

`scripts/vm-docker-user.sh` insere, para cada porta, uma regra que descarta ligações novas vindas de `enp0s6` cujo destino original era 85 ou 86. O proxy entra por uma bridge do Docker, não por `enp0s6`, e não é afetado. Não toca noutras portas.

```sh
cd ~/ism-hml
sudo install -m 755 -o root -g root scripts/vm-docker-user.sh /usr/local/sbin/ism-docker-user.sh
sudo install -m 644 -o root -g root scripts/systemd/ism-docker-user.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ism-docker-user.service
sudo iptables -S DOCKER-USER     # duas regras DROP com comentário ism-hardening
```

Verificar:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://ism-tst.valtre.com.br/    # 200, igual a antes
curl -sS -o /dev/null -w '%{http_code}\n' https://ism-hml.valtre.com.br/    # 200, igual a antes
```

Não correr `netfilter-persistent save` depois: gravaria também as chains dinâmicas do Docker e do fail2ban em `rules.v4`. A persistência é o serviço systemd, que reaplica as regras sempre que o Docker arranca.

Rollback:

```sh
sudo systemctl disable --now ism-docker-user.service   # o ExecStop remove as regras
sudo rm /etc/systemd/system/ism-docker-user.service /usr/local/sbin/ism-docker-user.sh
sudo systemctl daemon-reload
```

Se o proxy deixar de chegar ao ISM (502), o rollback acima resolve na hora.

## Passo 3. SSH

`scripts/vm/sshd-ism.conf` vai para `/etc/ssh/sshd_config.d/10-ism.conf`. O `sshd` usa o primeiro valor que lê, e `10-` vem antes de `60-cloudimg-settings.conf`.

Conteúdo: `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `MaxAuthTries 3`, `LoginGraceTime 30`, `X11Forwarding no`, `AllowUsers ubuntu`.

Decisão antes de aplicar: o utilizador `opc` tem chave instalada. Com `AllowUsers ubuntu` deixa de entrar. Se alguém o usa, trocar para `AllowUsers ubuntu opc`.

```sh
cd ~/ism-hml
sudo install -m 644 -o root -g root scripts/vm/sshd-ism.conf /etc/ssh/sshd_config.d/10-ism.conf
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|maxauthtries|x11forwarding|allowusers) '
```

Numa segunda sessão, sem fechar a primeira:

```sh
ssh -i <chave> ubuntu@137.131.172.202 true && echo ok
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password ubuntu@137.131.172.202   # tem de recusar
```

Com `MaxAuthTries 3`, um cliente com muitas chaves no agente pode ser recusado antes de chegar à certa. Usar `-o IdentitiesOnly=yes -i <chave>`.

Depois, disparar um deploy de teste (push em `develop`) e confirmar que o GitHub Actions entra.

Rollback (pela sessão que ficou aberta, ou pela consola serial):

```sh
sudo rm /etc/ssh/sshd_config.d/10-ism.conf && sudo systemctl reload ssh
```

## Passo 4. fail2ban

```sh
sudo apt-get update && sudo apt-get install -y fail2ban
cd ~/ism-hml
sudo install -m 644 -o root -g root scripts/vm/fail2ban-sshd.local /etc/fail2ban/jail.d/ism-sshd.local
sudo fail2ban-client -t
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

Jail `sshd`: 5 falhas em 10 min dão 1 h de ban, que cresce em reincidência até 1 semana. `10.0.0.0/24` e loopback nunca são banidos. O deploy do GitHub Actions usa chave válida e não gera falhas. O fail2ban acrescenta a sua chain no topo da INPUT; não mexe na FORWARD nem nas regras da Oracle.

Desbanir um IP: `sudo fail2ban-client set sshd unbanip <ip>`.

Rollback:

```sh
sudo systemctl disable --now fail2ban
sudo apt-get remove -y fail2ban
sudo rm -f /etc/fail2ban/jail.d/ism-sshd.local
```

## Passo 5. Patches

Já ativo. Conferir de vez em quando:

```sh
systemctl is-active unattended-upgrades
cat /etc/apt/apt.conf.d/20auto-upgrades
ls /var/run/reboot-required 2>/dev/null && echo "reboot pendente"
```

Depois de um reboot o volume LUKS do ISM fica fechado: é preciso um deploy (ou `scripts/lgpd-volume-luks.sh`) para o Postgres voltar. O backup diário falha e o alerta avisa (ver `docs/backup.md`).

## Verificação final (critérios do card)

| Critério | Comando | Esperado |
|----------|---------|----------|
| Só 80 e 443 (e 22) de fora | `nmap -Pn -p- --open 137.131.172.202` | 22, 80, 443 |
| SSH por senha recusado | `ssh -o PubkeyAuthentication=no ...` | `Permission denied (publickey)` |
| fail2ban ativo | `sudo fail2ban-client status sshd` | jail ativa |
| Deploy continua a funcionar | push em `develop` | workflow verde |
| Proxy continua a servir o ISM | `curl https://ism-tst.valtre.com.br/` | 200 |

## Opcional (precisa de acordo dos outros projetos)

Uma regra na `DOCKER-USER` que deixe passar de `enp0s6` só 80 e 443 protegeria todas as portas `0.0.0.0` da máquina, mesmo que alguém as abra na Security List:

```sh
# NÃO aplicar sem falar com os donos dos outros projetos. Ordem final: RETURN 80, RETURN 443, DROP.
sudo iptables -I DOCKER-USER 1 -i enp0s6 -m conntrack --ctstate NEW --ctdir ORIGINAL -m comment --comment vm-borda -j DROP
sudo iptables -I DOCKER-USER 1 -i enp0s6 -p tcp -m conntrack --ctorigdstport 443 --ctdir ORIGINAL -m comment --comment vm-borda -j RETURN
sudo iptables -I DOCKER-USER 1 -i enp0s6 -p tcp -m conntrack --ctorigdstport 80 --ctdir ORIGINAL -m comment --comment vm-borda -j RETURN
```

Rollback: `sudo iptables -S DOCKER-USER | grep vm-borda | sed 's/^-A/-D/' | xargs -L1 sudo iptables`.

Antes, cada projeto teria de confirmar que não depende de acesso externo direto (ex.: pgAdmin na 5050, SQL Server na 1433). Melhor ainda: esses compose passarem a publicar em `127.0.0.1:` como o Postgres do ISM.
