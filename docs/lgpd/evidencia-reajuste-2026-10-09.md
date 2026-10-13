# Evidência do reajuste de 2026-10-09

## Código (esta estação)

`pnpm run typecheck` terminou sem erro.

`pnpm --filter @workspace/api-server exec tsx --test src/domains/lgpd/lgpd-empresa.test.ts src/utils/permissoes-grant.test.ts` : 20 testes, 0 falhas.

`pnpm exec drizzle-kit check --config ./drizzle.config.ts` em `lib/db`, com `DATABASE_URL` fictícia só para carregar a config: `Everything's fine`.

O `[db:migrate]` passa a imprimir `[db:migrate] Aplicada: <tag>` para cada hash novo em `drizzle.__drizzle_migrations`. Sem migration nova, imprime `Nenhuma migration nova.`

## Execução na VM (run 37982854289)

https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/37982854289 terminou `success` em `master` (`59bb7c3`) e não tocou TST nem HML. O `appleboy/ssh-action@v1.0.3` não reconhece `script_path`. O log mostra o aviso `Unexpected input(s) 'script_path'`, o bloco `======CMD======` vazio e `Successfully executed commands to all host`. Não há `EMPRESAS_DEPOIS`, `EXPORT_HTTP`, `DELETE_HTTP` nem `LUKS_KEY_IGUAL_OWNER`.

O deploy https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/37976158378 também é desse commit e não corre o script de evidência.

## DPA, export e LUKS — o que o próximo run tem de imprimir

O script aplica o SQL da `0026` (empresa sem `dpa_assinado_em` fica inativa, com `CHECK`) e em seguida chama export e eliminação de `filial-sul-teste`. Se essa empresa não existir, o script termina com erro (`ALVO_AUSENTE`), em vez de sair verde. A chave LUKS é trocada com `luksChangeKey` quando o ficheiro ainda é `ISM_OWNER_PASSWORD` ou `DB_PASSWORD`. O log precisa conter `EXPORT_DOWNLOAD_HTTP=200`, `DELETE_HTTP=200`, `DELETE_ELIMINADA=1` e `LUKS_KEY_IGUAL_OWNER=0` duas vezes (TST e HML).
