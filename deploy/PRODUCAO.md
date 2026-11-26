# ISM Finance — deploy de produção (Jenkins + Kubernetes)

## Fluxo

| Onde | Branch | Ambiente | Deploy |
|---|---|---|---|
| GitHub `elienaypreposto-creator/I-S-M-Finance.v2` | `develop` | TST | GitHub Actions |
| GitHub | `master` | HML | GitHub Actions |
| GitLab `meilock/finance-ism` | `main` | **Produção** | **Jenkins** (este guia) |

A `main` do GitLab só recebe o que já passou por TST e HML: a `master` homologada é enviada
para lá. Ninguém faz commit direto na `main` do GitLab.

## O que a esteira faz (`Jenkinsfile`)

Só roda na `main`. Mesmo padrão dos outros projetos da Meilock (`base-lib`):

1. **Versão** — `commons.get_versao_atual/anterior/proxima`.
2. **Build e push** — duas imagens, a partir da raiz do monorepo:
   - `registry.gitlab.com/meilock/finance-ism/api:<versão>` (`Dockerfile.api`)
   - `registry.gitlab.com/meilock/finance-ism/web:<versão>` (`Dockerfile.web`, nginx + front)
3. **Deploy** — `codedeploy.deploy`, que roda `ansible/tasks/deploy.yml` no servidor:
   troca a versão das duas imagens em `/home/ubuntu/cluster/deploy-ism-finance.yaml`,
   aplica e espera o rollout (`kubectl rollout status`). Se a migration falhar, o deploy falha
   e a versão anterior continua no ar.
4. **Aviso** no Google Chat — `notify.gerarMensagem`.

Ao subir, o pod da API roda dois passos antes de iniciar (initContainers):

1. **Backup cifrado** do banco (`pg_dump` + `openssl aes-256-cbc`, senha `BACKUP_CIPHER_PASS`)
   no volume `ism-backups`, mantendo os 30 mais recentes. **Sempre antes da migration.**
2. **Migrations** versionadas (`pnpm --filter @workspace/db run db:migrate`). Nunca `drizzle-kit push`.

## Pontos a confirmar com a `base-lib` (João)

- `dockerlib.build_image` recebe só nome e contexto; este projeto precisa de `-f Dockerfile.api`
  e `-f Dockerfile.web` na raiz, por isso o build está em `sh` no Jenkinsfile. Se a `base-lib`
  aceitar o caminho do Dockerfile, pode trocar.
- Credencial de push no registry: `registry_credentials_id` em `jenkins-config.json`.
- `commons.get_versao_atual()` lê as tags pelo `registry_id`: usar o id do repositório **api**
  (as duas imagens saem sempre com a mesma versão).
- `codedeploy.deploy` deve rodar `ansible/tasks/deploy.yml` contra `server_qa` com
  `versao_posterior`. Se em produção a chave do servidor for outra, ajustar `jenkins-config.json`.
- `readJSON` precisa do plugin *Pipeline Utility Steps*.

## Preparação do cluster (uma vez)

1. **StorageClass cifrada** para o Postgres e os backups (ex.: EBS com `encrypted: true`).
   Trocar `<storageclass-cifrada>` no manifesto. A API exige `ISM_DISCO_CIFRADO=1`, e isso só
   é verdade com o volume cifrado.
2. **Namespace e secrets**:
   ```bash
   kubectl create namespace ism-finance
   kubectl -n ism-finance create secret docker-registry gitlab-registry \
     --docker-server=registry.gitlab.com --docker-username=<deploy-token-user> --docker-password=<deploy-token>
   kubectl -n ism-finance create secret generic ism-finance-env --from-env-file=producao.env
   ```
   `producao.env` sai de `deploy/producao.env.exemplo` (lista e explicação de cada variável).
   O arquivo preenchido **não** vai para o repositório.
3. **Manifesto** no servidor: copiar `deploy/k8s/deploy-ism-finance.yaml` para
   `/home/ubuntu/cluster/deploy-ism-finance.yaml` e ajustar os pontos `AJUSTAR`
   (StorageClass, exposição/Ingress com TLS e domínio). A versão `1.0.0` das imagens é só o
   valor inicial; a esteira troca a cada deploy.
4. **Exposição**: Ingress com TLS (exemplo comentado no manifesto) ou NodePort atrás do proxy
   de borda. Com Ingress → web → API são 2 saltos (`TRUST_PROXY_HOPS=2`). Se houver mais um
   proxy na frente, aumentar. Limite de corpo de 11 MB (importação de OFX).

## Primeiro deploy

1. Rodar a esteira na `main`.
2. Criar o primeiro administrador (a senha não fica no ambiente):
   ```bash
   kubectl -n ism-finance exec -it deploy/ism-api -- sh -c \
     'cd lib/db && ADMIN_NOME="<nome>" ADMIN_SENHA="<senha forte>" pnpm exec tsx src/seed-admin.ts'
   ```
   O e-mail vem de `ADMIN_EMAIL` do secret. Depois o admin cria os demais usuários pela tela.
3. Conferir: `https://<dominio>/` abre o login e o e-mail de "esqueci a senha" chega
   (valida `FRONTEND_URL` e SMTP).

## Operação

- **Logs**: `kubectl -n ism-finance logs deploy/ism-api` (use `-c migrations` ou
  `-c backup-pre-deploy` para os passos iniciais).
- **Voltar versão**: trocar a versão das imagens no manifesto do servidor e aplicar.
  As migrations só andam para frente; se uma versão nova alterou o banco, restaurar o backup
  feito antes dela.
- **Restaurar backup** (com a API parada: `kubectl -n ism-finance scale deploy/ism-api --replicas=0`):
  ```bash
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_CIPHER_PASS \
    -in pre-deploy-<data>.sql.enc | psql -h postgres -U ism_user -d ismfinance
  ```
- **Uma réplica da API**: ela roda jobs agendados (atrasados, auditoria, retenção LGPD) que não
  podem rodar em dobro. Não aumentar `replicas` sem tratar isso antes.

## Lições do TST/HML (não repetir)

- O backup tem que rodar **antes** de qualquer passo que mexa no banco. No deploy antigo do
  TST ele rodava depois da cópia do volume e guardava só o banco já sobrescrito.
- Nunca copiar ou recriar o volume de dados no deploy. O Postgres de produção só é criado uma vez.
