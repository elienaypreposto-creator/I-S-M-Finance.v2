-- ISMF-40: o Kanban não tinha permissão. Quem já tem vínculo ativo na empresa
-- usa a tela hoje. Concede as quatro ações sem apagar concessões existentes.
INSERT INTO "usuario_permissoes" ("usuario_id", "empresa_id", "codigo_permissao")
SELECT ue."usuario_id", ue."empresa_id", p.codigo
FROM "usuario_empresas" ue
         CROSS JOIN (VALUES ('kanban:tarefas:listar'),
                            ('kanban:tarefas:criar'),
                            ('kanban:tarefas:editar'),
                            ('kanban:tarefas:excluir')) AS p(codigo)
WHERE ue."ativo" = true ON CONFLICT ("usuario_id", "empresa_id", "codigo_permissao") DO NOTHING;
--> statement-breakpoint
-- Não concede listar a quem nunca teve ação de lançamento, exceto o
-- papel Visualizador: a tela de lançamentos estava aberta para esse papel
-- e o Painel não chama GET /lancamentos.
INSERT INTO "usuario_permissoes" ("usuario_id", "empresa_id", "codigo_permissao")
SELECT DISTINCT up."usuario_id", up."empresa_id", 'financeiro:lancamentos:listar'
FROM "usuario_permissoes" up
WHERE up."codigo_permissao" IN (
                                'financeiro:lancamentos:criar',
                                'financeiro:lancamentos:editar',
                                'financeiro:lancamentos:deletar',
                                'financeiro:lancamentos:alterar_valor'
    ) ON CONFLICT ("usuario_id", "empresa_id", "codigo_permissao") DO NOTHING;
--> statement-breakpoint
INSERT INTO "usuario_permissoes" ("usuario_id", "empresa_id", "codigo_permissao")
SELECT ue."usuario_id", ue."empresa_id", 'financeiro:lancamentos:listar'
FROM "usuario_empresas" ue
         INNER JOIN "usuarios" u ON u."id" = ue."usuario_id"
WHERE ue."ativo" = true
  AND u."perfil_base" = 'Visualizador' ON CONFLICT ("usuario_id", "empresa_id", "codigo_permissao") DO NOTHING;
