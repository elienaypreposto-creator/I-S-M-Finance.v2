# Minuta de acordo de tratamento (DPA)

Versão 1.0. Data do aceite do operador e da empresa `ism`: 2026-10-05. O texto pode ainda ser revisto por jurídico. O registo de aceite não está em branco: está na tabela abaixo e na coluna `empresas.dpa_assinado_em`.

## Partes

- Operador: ISM Tecnologia, canal do encarregado admin@ism.finance.
- Controlador do registo inicial: ISM Tecnologia, empresa `slug=ism` (a mesma entidade, como primeiro tenant do schema).
- Controlador seguinte: a empresa criada no cadastro, com o nome do representante gravado em `dpa_representante`.

## Objeto

O operador trata dados pessoais em nome do controlador para o uso do sistema financeiro multiempresa: cadastro de usuários autorizados, parceiros, contas, lançamentos, extratos e conciliação. O mapa está em `docs/lgpd-inventario.md`, versão 1.0, de 2026-10-05.

O operador não decide a finalidade do dado de negócio. Isola cada controlador dos demais (`empresa_id` e RLS).

## Instruções

O operador:

- trata só para prestar o serviço e cumprir obrigação legal de guarda fiscal enquanto o prazo do inventário não vence
- não usa o dado do controlador para outro controlador
- dá exportação e eliminação ao pedido do controlador, pelas rotas de superadmin descritas em `docs/lgpd/operacao-tecnica.md`
- na eliminação, anonimiza a auditoria em vez de apagá-la, para conservar o registo da operação sem dado pessoal
- avisa o controlador conforme o plano de incidente

## Suboperadores

Só entram suboperadores do caminho de deploy deste repositório. Não há base gerida fora da máquina do operador.

| Suboperador | O que trata | Onde está |
| --- | --- | --- |
| Máquina virtual Ubuntu do operador | Aplicação, Postgres 16 e Redis 7, no `docker compose` do deploy | `.github/workflows/main.yml` |
| Volume LUKS2 do Postgres | Dados em repouso do banco, ficheiro `/var/lib/ism/<ambiente>/pgdata.img` aberto antes do contentor | `scripts/lgpd-volume-luks.sh` |
| Redis no mesmo host | Sessão e limite de pedidos. Rede docker interna, sem porta publicada | `docker-compose.yml` |
| SMTP do ambiente | Correio transacional (senha temporária). Remetente `noreply@ism.finance`. O host é `SMTP_HOST` | `artifacts/api-server/src/services/email.service.ts` |

## Segurança

Acesso por papel, isolamento por empresa, auditoria append-only para a role da aplicação, backup de deploy cifrado (`scripts/lgpd-cifrar-backup.sh`), volume do Postgres em LUKS2. Sem o volume aberto, a API em produção não arranca.

## Fim do contrato

Pedido de exportação e, em seguida, eliminação. Prazos do inventário que sejam obrigação legal correm até o fim, mesmo depois do fim do contrato, salvo orientação jurídica em contrário.

## Aceite registado

A empresa só fica ativa com `dpa_representante` e `dpa_assinado_em` na linha de `empresas` (migração `0025_lgpd_dpa_empresa`). Criar empresa sem o nome do representante é recusado. Activar uma empresa sem esse registo também.

A empresa inicial do schema (`slug` `ism`, razão social ISM Tecnologia) é, ao mesmo tempo, a operação e o primeiro controlador. O aceite dela está na migração e nesta tabela.

| | Controlador | Operador |
| --- | --- | --- |
| Nome | ISM Tecnologia | ISM Tecnologia |
| Cargo | Administração da plataforma | Encarregado |
| Identificação | empresa `slug=ism` | admin@ism.finance / encarregado@ism.finance |
| Data | 2026-10-05 | 2026-10-05 |
| Registo | `empresas.dpa_assinado_em` | este ficheiro e a mesma coluna |

Empresas criadas depois repetem o aceite: o representante escreve o nome no cadastro e a API grava a data. Sem esse par, a linha não nasce ativa com valor jurídico de DPA por omissão.
