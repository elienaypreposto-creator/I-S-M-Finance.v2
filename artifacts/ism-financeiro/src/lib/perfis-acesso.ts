/**
 * Catálogo de permissões exibido na tela de Usuários (janela "Permissões") e
 * perfis padrão aplicados ao criar/editar um usuário ("Perfil rápido").
 *
 * Os códigos têm de existir no catálogo da API (`lib/db/src/permissoes-catalog.ts`):
 * o PUT /usuarios/:id/permissoes recusa código desconhecido. O teste
 * `perfis-acesso.test.ts` confere isso.
 *
 * Sem imports de React/alias para poder ser testado com `node --test`.
 */

export type ItemPermissao = {nome: string; codigo: string};
export type GrupoPermissoes = {grupo: string; itens: ItemPermissao[]};

export const permissoesGranulares: GrupoPermissoes[] = [
    {
        grupo: "Dashboard & Relatórios",
        itens: [
            // Nome = item do menu Relatórios que a permissão libera.
            {nome: "Dashboard", codigo: "dashboard:ver"},
            {nome: "Relatório Fechamento Mensal", codigo: "relatorios:financeiro"},
            {nome: "Relatório Contábil/Fiscal", codigo: "relatorios:contabil-fiscal"},
            {nome: "Relatório DRE Gerencial", codigo: "relatorios:dre"},
            {nome: "Relatório Fluxo de Caixa", codigo: "relatorios:fluxo-caixa-mensal"},
            {nome: "Relatório de Metas", codigo: "relatorios:metas"},
            // Sem tela no front: só GET /relatorios/conciliacao da API usa.
            {nome: "Relatório de Conciliação (somente API)", codigo: "relatorios:conciliacao"},
        ],
    },
    {
        grupo: "Contas a Pagar",
        itens: [
            {nome: "Cadastro de Contas a Pagar", codigo: "financeiro:contas-pagar:criar"},
            {nome: "Consulta de Contas a Pagar", codigo: "financeiro:contas-pagar:listar"},
            {nome: "Baixa de Contas a Pagar", codigo: "financeiro:contas-pagar:baixar"},
            {nome: "Cancelamento de Contas a Pagar", codigo: "financeiro:contas-pagar:cancelar"},
            {nome: "Importar CR e CP", codigo: "financeiro:importar"},
        ],
    },
    {
        grupo: "Contas a Receber",
        itens: [
            {nome: "Cadastro de Contas a Receber", codigo: "financeiro:contas-receber:criar"},
            {nome: "Consulta de Contas a Receber", codigo: "financeiro:contas-receber:listar"},
            {nome: "Baixa de Contas a Receber", codigo: "financeiro:contas-receber:baixar"},
            {nome: "Cancelamento de Contas a Receber", codigo: "financeiro:contas-receber:cancelar"},
            {nome: "Exportar Contas a Receber", codigo: "financeiro:contas-receber:exportar"},
        ],
    },
    {
        grupo: "Conciliação Bancária",
        itens: [
            {nome: "Conciliação Bancária", codigo: "financeiro:conciliacao:acessar"},
            {nome: "Conciliação - Importar Extrato", codigo: "financeiro:conciliacao:importar"},
            {nome: "Conciliação - Vincular", codigo: "financeiro:conciliacao:vincular"},
            {nome: "Conciliação - Ignorar", codigo: "financeiro:conciliacao:ignorar"},
            {nome: "Conciliação - Desfazer / Reverter", codigo: "financeiro:conciliacao:desfazer"},
            {nome: "Conciliação - Concluir / Finalizar", codigo: "financeiro:conciliacao:concluir"},
            {nome: "Conciliação - Configurar / Jobs", codigo: "financeiro:conciliacao:configurar"},
        ],
    },
    {
        grupo: "Cadastro de Contas",
        itens: [
            {nome: "Cadastro de Contas", codigo: "configuracoes:contas-bancarias:criar"},
            {nome: "Consulta de Contas", codigo: "configuracoes:contas-bancarias:listar"},
            {nome: "Exclusão de Contas", codigo: "configuracoes:contas-bancarias:deletar"},
        ],
    },
    {
        grupo: "Cadastro de Pessoas",
        itens: [
            {nome: "Cadastro de Pessoa", codigo: "financeiro:parceiros:criar"},
            {nome: "Consulta de Pessoa", codigo: "financeiro:parceiros:listar"},
            {nome: "Exclusão de Pessoa", codigo: "financeiro:parceiros:deletar"},
        ],
    },
    {
        grupo: "Plano de Contas",
        itens: [
            {nome: "Cadastro de Plano de Contas", codigo: "configuracoes:plano-contas:criar"},
            {nome: "Consulta de Plano de Contas", codigo: "configuracoes:plano-contas:listar"},
            {nome: "Exclusão de Plano de Contas", codigo: "configuracoes:plano-contas:deletar"},
            {nome: "Exportar Plano de Contas", codigo: "configuracoes:plano-contas:exportar"},
            {nome: "Cadastro de Categoria do Plano de Contas", codigo: "configuracoes:categorias:criar"},
            {nome: "Consulta de Categoria do Plano de Contas", codigo: "configuracoes:categorias:listar"},
            {nome: "Exclusão de Categoria do Plano de Contas", codigo: "configuracoes:categorias:deletar"},
        ],
    },
    {
        grupo: "Metas & Fechamentos",
        itens: [
            {nome: "Cadastro de Metas", codigo: "financeiro:metas:criar"},
            {nome: "Consulta de Metas", codigo: "financeiro:metas:listar"},
            {nome: "Exclusão de Metas", codigo: "financeiro:metas:deletar"},
            {nome: "Cadastro de Fechamentos Financeiros", codigo: "financeiro:fechamentos:criar"},
            {nome: "Consulta de Fechamentos Financeiros", codigo: "financeiro:fechamentos:listar"},
            {nome: "Exclusão de Fechamentos Financeiros", codigo: "financeiro:fechamentos:deletar"},
        ],
    },
    {
        grupo: "Tarefas",
        itens: [
            {nome: "Consulta de Tarefas", codigo: "kanban:tarefas:listar"},
            {nome: "Cadastro de Tarefas", codigo: "kanban:tarefas:criar"},
            {nome: "Edição de Tarefas", codigo: "kanban:tarefas:editar"},
            {nome: "Exclusão de Tarefas", codigo: "kanban:tarefas:excluir"},
        ],
    },
    {
        grupo: "Movimentações",
        itens: [
            {nome: "Cadastro de Movimentação Financeira", codigo: "financeiro:lancamentos:criar"},
            {nome: "Consulta de Movimentação Financeira", codigo: "financeiro:lancamentos:listar"},
            {nome: "Edição de Movimentação Financeira", codigo: "financeiro:lancamentos:editar"},
            {nome: "Alterar valor de lançamento", codigo: "financeiro:lancamentos:alterar_valor"},
            {nome: "Exclusão de Movimentação Financeira", codigo: "financeiro:lancamentos:deletar"},
        ],
    },
    {
        grupo: "Configurações do Sistema",
        itens: [
            {nome: "Cadastro de Usuários", codigo: "admin:usuarios:criar"},
            {nome: "Consulta de Usuários", codigo: "admin:usuarios:listar"},
            {nome: "Edição de Usuários", codigo: "admin:usuarios:editar"},
            {nome: "Exclusão de Usuários", codigo: "admin:usuarios:deletar"},
            {nome: "Conceder permissões a utilizadores", codigo: "admin:permissoes:conceder"},
            {nome: "Edição dos dados da própria empresa", codigo: "admin:empresas:editar"},
            {nome: "Cadastro de Token de API", codigo: "admin:tokens-api:criar"},
            {nome: "Consulta de Tokens de API", codigo: "admin:tokens-api:listar"},
            {nome: "Exclusão de Token de API", codigo: "admin:tokens-api:deletar"},
        ],
    },
];

export const todasPermissoes: string[] = permissoesGranulares.flatMap((g) => g.itens.map((i) => i.codigo));

/**
 * Permissões do catálogo que nenhuma rota da API nem tela do front confere
 * (relatórios planejados que não foram feitos). Ficam fora da tela para o
 * admin não conceder algo que não libera nada. Continuam no catálogo e no
 * banco: quem já as tem não perde a linha, e o PUT de permissões segue
 * aceitando o que a janela reenviar.
 */
export const PERMISSOES_SEM_TELA: readonly string[] = [
    "relatorios:fluxo-caixa-diario",
    "relatorios:economico",
    "relatorios:vencimento",
    "relatorios:extrato",
];

/** Quantas das permissões marcadas aparecem na tela (as escondidas não contam). */
export function contarVisiveis(codigos: readonly string[]): number {
    const visiveis = new Set(todasPermissoes);
    return codigos.filter((c) => visiveis.has(c)).length;
}

const tarefasKanban = [
    "kanban:tarefas:listar",
    "kanban:tarefas:criar",
    "kanban:tarefas:editar",
    "kanban:tarefas:excluir",
];

/**
 * Perfis padrão. Relatórios por perfil:
 * - Admin: todos os da tela.
 * - Financeiro e Gestor: DRE, Fluxo de Caixa Mensal e Contábil/Fiscal. O
 *   Contábil/Fiscal entra nos dois perfis que já têm os relatórios gerenciais
 *   (DRE/Fluxo) e que já leem os lançamentos de onde ele sai; não traz dado novo.
 *   "Relatório Financeiro" (Fechamento Mensal) continua só no Admin.
 * - Visualizador: nenhum relatório.
 *
 * O Visualizador só lê: só ações `:listar`/`:ver` (perfis-acesso.test.ts confere).
 */
export const perfisBase: Record<string, string[]> = {
    Admin: todasPermissoes,
    Financeiro: [
        // relatorios:extrato saiu: não libera tela nenhuma (PERMISSOES_SEM_TELA).
        "dashboard:ver", "relatorios:fluxo-caixa-mensal", "relatorios:dre",
        "relatorios:contabil-fiscal",
        "financeiro:contas-pagar:criar", "financeiro:contas-pagar:listar", "financeiro:contas-pagar:baixar",
        "financeiro:contas-receber:criar", "financeiro:contas-receber:listar", "financeiro:contas-receber:baixar",
        "financeiro:conciliacao:acessar",
        "financeiro:conciliacao:importar",
        "financeiro:conciliacao:vincular",
        "financeiro:conciliacao:ignorar",
        "financeiro:conciliacao:desfazer",
        "financeiro:conciliacao:concluir",
        "configuracoes:contas-bancarias:listar", "financeiro:parceiros:listar", "configuracoes:plano-contas:listar",
        "financeiro:lancamentos:criar", "financeiro:lancamentos:listar", "financeiro:lancamentos:editar",
        "financeiro:metas:criar", "financeiro:metas:listar",
        ...tarefasKanban,
    ],
    Gestor: [
        "dashboard:ver", "relatorios:dre", "relatorios:fluxo-caixa-mensal", "relatorios:metas",
        "relatorios:contabil-fiscal",
        "financeiro:contas-pagar:listar", "financeiro:contas-receber:listar",
        "configuracoes:contas-bancarias:listar", "financeiro:parceiros:listar", "configuracoes:plano-contas:listar",
        "financeiro:lancamentos:listar", "financeiro:metas:listar",
        ...tarefasKanban,
    ],
    // Perfil de leitura: só consulta. Tarefas também (migration 0033 tira criar/
    // editar/excluir de quem já tem perfil_base = 'Visualizador').
    Visualizador: [
        "dashboard:ver", "financeiro:contas-pagar:listar", "financeiro:contas-receber:listar", "financeiro:metas:listar",
        "financeiro:lancamentos:listar",
        "kanban:tarefas:listar",
    ],
};
