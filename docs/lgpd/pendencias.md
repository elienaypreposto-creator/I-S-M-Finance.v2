# Pendências fora do repositório

| Pendência | Estado |
| --- | --- |
| Revisão jurídica do texto do DPA, do inventário e do registro do art. 37 | O aceite da empresa `ism` e a lista de suboperadores estão em `docs/lgpd/dpa-modelo.md`. Isso não é parecer. |
| `sudo` sem password e `cryptsetup` na VM de deploy | O script instala o pacote se faltar. Sem `sudo -n`, o deploy pára de propósito. |
| Migração `0025_lgpd_dpa_empresa` aplicada no ambiente | Grava o aceite da empresa `ism`. Sem a `0024`, a eliminação responde 409. |

O volume em claro deixou de ser um caminho de arranque. O backup de deploy é `.sql.enc`. O restore automatizado está na suíte (`eliminação, restore do dump, eliminação outra vez`).
