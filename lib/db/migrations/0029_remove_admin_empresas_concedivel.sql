-- ISMF-16: listar todas as empresas e criar empresa são operação do ISM e só
-- `usuarios.superadmin` libera (withSuperadmin). admin:empresas:listar e
-- admin:empresas:criar saíram do catálogo concedível; linhas antigas viram lixo e
-- quebrariam o PUT /usuarios/:id/permissoes (o front reenvia o que leu e o z.enum
-- recusa). admin:empresas:editar continua concedível (edita só a empresa da sessão).
DELETE FROM "usuario_permissoes"
WHERE "codigo_permissao" IN ('admin:empresas:listar', 'admin:empresas:criar');
