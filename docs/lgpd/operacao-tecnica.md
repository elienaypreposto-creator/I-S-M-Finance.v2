# Operação técnica de exportação e eliminação

Isto é runtime. Os modelos de contrato, política e incidente estão nos outros ficheiros desta pasta e não são executados pela API.

As rotas exigem superadmin (`withSuperadmin`), depois de `withAuth`. A leitura e a escrita usam a role `ism_admin` (`withBypassRls`). A transação do pedido continua em `ism_app` e não serve: essa role não vê outra empresa e não atualiza `logs_auditoria`.

## Exportar

1. `GET /api/admin/empresas/:id/export`
2. Resposta 202: `{ job_id, status: "processando" }`.
3. `GET /api/admin/empresas/:id/export?job_id=...` até `status: "pronto"` com `url` e `expira_em`.
4. `GET /api/admin/exportacoes/:token` devolve o JSON. O token dura 15 minutos e continua a exigir sessão de superadmin.

O job vive na memória do processo e o ficheiro em diretório temporário do sistema. Mais de uma instância da API não partilha o link.

O pacote não reconstrói o OFX. Agrupa `extrato_linhas` por extrato em `extratos_arquivos`.

## Eliminar

Duas chamadas. A segunda não parte sem a primeira.

1. `POST /api/admin/empresas/:id/eliminacao`
   Devolve `desafio` (10 minutos) e pede a razão social exata.
2. `DELETE /api/admin/empresas/:id`
   Corpo: `{ "desafio": "...", "confirmacao": "Razão social exata" }`.

Erro de digitação não gasta o desafio. Trocar o id da empresa também não. Desafio expirado responde 410.

Efeito, na mesma transação de `ism_admin`:

- Anonimiza `logs_auditoria` e `logs_auditoria_arquivo` da empresa. Não apaga. Zera ip, user agent, request id, usuário, token e detalhes. Grava `{ "anonimizado": true }`. O `empresa_id` fica.
- Apaga o domínio, filhos antes dos pais. Em `lancamentos`, anula `lancamento_origem_id` antes do `DELETE`.
- Usuário que só pertencia a essa empresa, e não é superadmin, perde nome, contacto e senha. O e-mail passa a `eliminado-{id}@invalid.local`. A sessão é revogada.
- Insere uma linha de auditoria `lgpd.eliminacao` já anonimizada, para o facto da operação continuar visível.
- Regista o operador em `logs_sistema` (`ator_usuario_id`, `empresa_id`), fora das tabelas do tenant.
- Apaga a linha em `empresas`.

A migração `0024_lgpd_auditoria_sem_fk_empresa` remove a FK de `logs_auditoria` para `empresas`. Sem ela o `DELETE` da empresa falha, porque a linha anonimizada ainda aponta o inteiro. A API responde 409 nesse caso.

## Conferir isolamento

Teste sem banco (entra no `pnpm test` da API): desafio, lista de tabelas e ordem das FKs.

Teste com banco, manual:

```text
ISM_LGPD_TEST=1
```

no ambiente que já aplicou a migração 0024. O teste cria uma empresa, uma filial, um log com IP e um usuário exclusivo, elimina, e exige zero linhas com aquele `empresa_id` fora da auditoria em que `anonimizadas = total`.

Depois de um restore de backup (procedimento já existente, não refeito aqui):

```text
psql "$DATABASE_URL" -v empresa_id=123 -f scripts/lgpd-verificar-eliminacao.sql
```

## Retenção

`startRetencaoLgpdJob` corre no mesmo arranque que o job de arquivo de auditoria: processo local, ou produção com `RUN_LOCAL=true`. Extrato com `periodo_fim` (ou `created_at`) anterior a 5 anos recebe `arquivado_em`. Lançamento não é apagado por este job.
