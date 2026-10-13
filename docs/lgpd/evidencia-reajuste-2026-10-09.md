# Evidência do reajuste de 2026-10-09

## Código (esta estação)

`pnpm run typecheck` terminou sem erro.

`pnpm --filter @workspace/api-server exec tsx --test src/domains/lgpd/lgpd-empresa.test.ts src/utils/permissoes-grant.test.ts` : 20 testes, 0 falhas.

`pnpm exec drizzle-kit check --config ./drizzle.config.ts` em `lib/db`, com `DATABASE_URL` fictícia só para carregar a config: `Everything's fine`.

O `[db:migrate]` passa a imprimir `[db:migrate] Aplicada: <tag>` para cada hash novo em `drizzle.__drizzle_migrations`. Sem migration nova, imprime `Nenhuma migration nova.`

## Execução na VM

O run https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/37982854289 não executou o script (`script_path` ignorado pelo ssh-action v1.0.3).

O run https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38405083479 falhou. O artefato `lgpd-evidencia-vm` desse run tem 129 bytes: o `capture_stdout` quebrou com `Matching delimiter not found 'EOF'`. Esse artefato não contém o HTTP. O run https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38406268258 ficou verde sem repetir export nem DELETE (`filial-sul-teste` já não existia).

## Reparo (run 38406268258)

https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38406268258 terminou `success` (`EVIDENCIA_FIM falha=0`). O passo «Exigir os três marcadores» passou. Artefato: `lgpd-evidencia-vm`.

- LUKS e montagem antiga fecharam nesse run: `LUKS_KEYFILE_ABRE=1`, `LUKS_OWNER_ABRE=0`, `LUKS_KEY_IGUAL_OWNER=0` em TST e HML, `LEGACY_MNT=ausente`.
- Export e eliminação ainda não estão num artefato. O próximo disparo cria `lgpd-evidencia-tmp` em TST, chama GET export e DELETE, e o artefato `lgpd-evidencia-vm` precisa conter `EXPORT_DOWNLOAD_HTTP=200`, `DELETE_HTTP=200` e `DELETE_ELIMINADA=1`.
