# Evidência do reajuste de 2026-10-09

## Código (esta estação)

`pnpm run typecheck` terminou sem erro.

`pnpm --filter @workspace/api-server exec tsx --test src/domains/lgpd/lgpd-empresa.test.ts src/utils/permissoes-grant.test.ts` : 20 testes, 0 falhas.

`pnpm exec drizzle-kit check --config ./drizzle.config.ts` em `lib/db`, com `DATABASE_URL` fictícia só para carregar a config: `Everything's fine`.

O `[db:migrate]` passa a imprimir `[db:migrate] Aplicada: <tag>` para cada hash novo em `drizzle.__drizzle_migrations`. Sem migration nova, imprime `Nenhuma migration nova.`

## Execução na VM

O run https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/37982854289 não executou o script (`script_path` ignorado pelo ssh-action v1.0.3).

O run https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38405083479 executou o script e falhou no fim (`EVIDENCIA_FIM falha=1`). O que esse log já prova:

- TST, antes do DELETE: `filial-sul-teste` ficou `ativa=f` e `dpa=f`. `ism` permaneceu `ativa=t` e `dpa=t`. O `CHECK empresas_ativa_exige_dpa` foi criado em TST e em HML (`UPDATE 1` em TST, `UPDATE 0` em HML).
- `EXPORT_DOWNLOAD_HTTP=200`, `EXPORT_BYTES=493018`, `DELETE_HTTP=200`, `DELETE_ELIMINADA=1`. Depois do DELETE, TST só tem a empresa `ism`.
- `luksChangeKey --new-keyfile` não existe nesse `cryptsetup` (`--new-keyfile: unknown option`). O script mesmo assim substituiu `pg-luks.key`. O header LUKS não mudou; o ficheiro deixou de abrir o volume. A montagem antiga `/var/lib/ism/mnt` continuava montada (`LEGACY_MNT=montada`). Não reiniciar a VM antes do run de reparo: o volume segue aberto, mas um `luksOpen` com o ficheiro atual falha.

## Reparo (run 38406268258)

https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38406268258 terminou `success` (`EVIDENCIA_FIM falha=0`). O passo «Exigir os três marcadores» passou. Artefato: `lgpd-evidencia-vm`.

- TST e HML: só a empresa `ism`, `ativa=t`, `dpa=t`. `filial-sul-teste` ausente (`EXPORT_DELETE_JA_REGISTADO=38405083479`).
- Em TST e em HML: `LUKS_KEYFILE_ABRE_ANTES=0`, `LUKS_CHAVE_SUBSTITUIDA`, `LUKS_KEYFILE_ABRE=1`, `LUKS_OWNER_ABRE=0`, `LUKS_KEY_IGUAL_OWNER=0`. `MNT_ATIVA` nos dois. `LEGACY_MNT=ausente` e `LEGACY_MAP=ausente`.
