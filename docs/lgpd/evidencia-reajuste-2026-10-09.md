# Evidência do reajuste de 2026-10-09

## Código (esta estação)

`pnpm run typecheck` terminou sem erro.

`pnpm --filter @workspace/api-server exec tsx --test src/domains/lgpd/lgpd-empresa.test.ts src/utils/permissoes-grant.test.ts` : 20 testes, 0 falhas.

`pnpm exec drizzle-kit check --config ./drizzle.config.ts` em `lib/db`, com `DATABASE_URL` fictícia só para carregar a config: `Everything's fine`.

O `[db:migrate]` passa a imprimir `[db:migrate] Aplicada: <tag>` para cada hash novo em `drizzle.__drizzle_migrations`. Sem migration nova, imprime `Nenhuma migration nova.`

## Execução na VM

O run https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/37982854289 não executou o script (`script_path` ignorado pelo ssh-action v1.0.3).

O run https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38405083479 falhou. O artefato `lgpd-evidencia-vm` desse run tem 129 bytes: o `capture_stdout` quebrou com `Matching delimiter not found 'EOF'`. Esse artefato não contém o HTTP. O run https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38406268258 ficou verde sem repetir export nem DELETE (`filial-sul-teste` já não existia).

## Reparo LUKS (run 38406268258)

https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38406268258 terminou `success`. LUKS e a montagem antiga fecharam: `LUKS_KEYFILE_ABRE=1`, `LUKS_OWNER_ABRE=0`, `LUKS_KEY_IGUAL_OWNER=0` em TST e HML, `LEGACY_MNT=ausente`. Esse run não repetiu o HTTP.

## Export e eliminação (run 38410802535)

https://github.com/elienaypreposto-creator/I-S-M-Finance.v2/actions/runs/38410802535 terminou `success` na branch `reajuste-ismf-12-13-28` (`c09ebe1`). Job `115342301991`. O passo «Exigir os três marcadores» passou. Artefato `lgpd-evidencia-vm` (`11821306460`): zip de 1124 bytes, `vm.log` de 5834 bytes.

Linhas desse `vm.log`:

- `ALVO_ID=3 ALVO_SLUG=lgpd-evidencia-tmp`
- `EXPORT_HTTP=202`
- `EXPORT_DOWNLOAD_HTTP=200`
- `EXPORT_BYTES=1179`
- `DELETE_HTTP=200`
- `DELETE_ELIMINADA=1`
- Depois do DELETE, TST ficou só com `ism` (`ativa=t`, `dpa=t`).
- `LUKS_KEYFILE_ABRE=1`, `LUKS_OWNER_ABRE=0` e `LUKS_KEY_IGUAL_OWNER=0` de novo em TST e HML, `LEGACY_MNT=ausente`, `EVIDENCIA_FIM falha=0`.
