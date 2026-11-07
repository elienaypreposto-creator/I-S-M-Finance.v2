-- O papel Visualizador é só leitura. A 0030 concedeu as quatro ações do Kanban
-- a todo vínculo ativo, inclusive a quem tem perfil_base = 'Visualizador', e o
-- perfil padrão do front repetia isso. Fica só kanban:tarefas:listar.
-- Idempotente: rodar de novo não acha linha para apagar.
DELETE FROM "usuario_permissoes" up
USING "usuarios" u
WHERE u."id" = up."usuario_id"
  AND u."perfil_base" = 'Visualizador'
  AND up."codigo_permissao" IN ('kanban:tarefas:criar',
                                'kanban:tarefas:editar',
                                'kanban:tarefas:excluir');
