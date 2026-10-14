-- ISMF-16: cadastro de empresas (listar todas, criar, editar) é operação do ISM e
-- só `usuarios.superadmin` libera (withSuperadmin). Os códigos admin:empresas:*
-- saíram do catálogo concedível; linhas antigas viram lixo e quebrariam o
-- PUT /usuarios/:id/permissoes (o front reenvia o que leu e o z.enum recusa).
DELETE FROM "usuario_permissoes"
WHERE "codigo_permissao" IN ('admin:empresas:listar', 'admin:empresas:criar', 'admin:empresas:editar');
