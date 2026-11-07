-- A tela de permissões oferecia "Cadastro de Metas" (financeiro:metas:criar),
-- mas o POST /metas (único que grava a planilha, criando ou alterando) exige
-- financeiro:metas:editar, que não aparecia na tela. Quem recebeu "Cadastro de
-- Metas" não conseguia salvar. A tela passa a oferecer editar e esconde criar.
-- Dá editar a quem tinha criar, na mesma empresa, sem apagar nada. O papel
-- Visualizador fica de fora (é só leitura; ver 0033).
-- Idempotente: ON CONFLICT ignora quem já tem editar.
INSERT INTO "usuario_permissoes" ("usuario_id", "empresa_id", "codigo_permissao")
SELECT DISTINCT up."usuario_id", up."empresa_id", 'financeiro:metas:editar'
FROM "usuario_permissoes" up
         INNER JOIN "usuarios" u ON u."id" = up."usuario_id"
WHERE up."codigo_permissao" = 'financeiro:metas:criar'
  AND u."perfil_base" IS DISTINCT FROM 'Visualizador'
ON CONFLICT ("usuario_id", "empresa_id", "codigo_permissao") DO NOTHING;
