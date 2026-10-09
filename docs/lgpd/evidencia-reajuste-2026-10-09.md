# Evidência do reajuste de 2026-10-09

## Código (esta estação)

`pnpm run typecheck` terminou sem erro.

`pnpm --filter @workspace/api-server exec tsx --test src/domains/lgpd/lgpd-empresa.test.ts src/utils/permissoes-grant.test.ts` : 20 testes, 0 falhas.

`pnpm exec drizzle-kit check --config ./drizzle.config.ts` em `lib/db`, com `DATABASE_URL` fictícia só para carregar a config: `Everything's fine`.

O `[db:migrate]` passa a imprimir `[db:migrate] Aplicada: <tag>` para cada hash novo em `drizzle.__drizzle_migrations`. Sem migration nova, imprime `Nenhuma migration nova.`

## DPA e empresa ativa

A migração `0026_lgpd_empresa_ativa_exige_dpa` faz `ativa = false` onde `dpa_assinado_em` é nulo e cria `CHECK (ativa = false OR dpa_assinado_em IS NOT NULL)`. É o que tira `filial-sul-teste` do estado ativo sem inventar assinatura. Aplica no próximo `db:migrate` de TST e HML. Não foi executada contra esses bancos a partir desta estação.

O aceite que já existe no schema é o da empresa `slug=ism` (ISM Tecnologia), migração `0025`.

## Export e eliminação em ambiente

As rotas e a suíte local já estavam conferidas na verificação de 09/10. Esta estação não tem sessão nos hosts TST/HML, então não há log novo de `GET /admin/empresas/:id/export` nem de `DELETE` contra esses ambientes.

## LUKS

O workflow deixa de copiar `ISM_OWNER_PASSWORD` para a frase de unlock e não grava essa frase no `.env`. O secret esperado é `TST_LUKS_PASSPHRASE` ou `HML_LUKS_PASSPHRASE`, diferente da senha do banco. O script fecha a montagem antiga `/var/lib/ism/mnt` (mapper `ism-pgdata`) quando ela existir. Não apaga o ficheiro de imagem. A chave já gravada em `/var/lib/ism/<ambiente>/pg-luks.key` não é trocada automaticamente.
