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

/**
 * Toda permissão que alguma rota da API (withPermission/hasPermission) ou tela
 * do front confere tem de estar aqui ou em PERMISSOES_USADAS_FORA_DA_JANELA; o
 * teste `perfis-acesso.test.ts` varre o código e falha se faltar alguma. E o
 * inverso: toda permissão daqui tem de ser conferida por alguma rota da API
 * (ou estar em PERMISSOES_SO_PORTA_DE_TELA); a que não libera nada vai para
 * PERMISSOES_SEM_TELA.
 *
 * Nomes: relatórios e grupos usam o nome do item do menu lateral. "(só pela API)"
 * marca permissão sem tela no sistema, usada por integração com token de API.
 */
export const permissoesGranulares: GrupoPermissoes[] = [
    {
        grupo: "Relatórios",
        itens: [
            // Nome = item do menu Relatórios que a permissão libera (teste confere com o menu).
            {nome: "Fechamento Mensal", codigo: "relatorios:financeiro"},
            {nome: "Contábil/Fiscal", codigo: "relatorios:contabil-fiscal"},
            {nome: "DRE Gerencial", codigo: "relatorios:dre"},
            {nome: "Fluxo de Caixa", codigo: "relatorios:fluxo-caixa-mensal"},
            {nome: "Relatório de Metas", codigo: "relatorios:metas"},
            // Sem tela no front: só GET /relatorios/conciliacao da API usa.
            {nome: "Relatório de Conciliação (só pela API, sem tela no sistema)", codigo: "relatorios:conciliacao"},
        ],
    },
    {
        grupo: "Lançamentos",
        itens: [
            {nome: "Cadastro de Lançamentos", codigo: "financeiro:lancamentos:criar"},
            {nome: "Consulta de Lançamentos", codigo: "financeiro:lancamentos:listar"},
            {nome: "Edição de Lançamentos", codigo: "financeiro:lancamentos:editar"},
            {nome: "Alterar valor de lançamento", codigo: "financeiro:lancamentos:alterar_valor"},
            {nome: "Exclusão de Lançamentos", codigo: "financeiro:lancamentos:deletar"},
            {nome: "Transferência entre contas - Cadastro (só pela API)", codigo: "financeiro:transferencias:criar"},
            {nome: "Transferência entre contas - Edição (só pela API)", codigo: "admin:transferencias:editar"},
            {nome: "Transferência entre contas - Exclusão (só pela API)", codigo: "admin:transferencias:deletar"},
        ],
    },
    {
        grupo: "Conciliação",
        itens: [
            {nome: "Conciliação Bancária", codigo: "financeiro:conciliacao:acessar"},
            {nome: "Conciliação - Importar Extrato", codigo: "financeiro:conciliacao:importar"},
            {nome: "Conciliação - Vincular", codigo: "financeiro:conciliacao:vincular"},
            {nome: "Conciliação - Ignorar", codigo: "financeiro:conciliacao:ignorar"},
            {nome: "Conciliação - Desfazer / Reverter", codigo: "financeiro:conciliacao:desfazer"},
            {nome: "Conciliação - Concluir / Finalizar", codigo: "financeiro:conciliacao:concluir"},
            {nome: "Conciliação - Configurar / Jobs", codigo: "financeiro:conciliacao:configurar"},
            // Consultar regras não tem permissão própria: vem com "Conciliação Bancária".
            {nome: "Regras de Conciliação - Cadastro", codigo: "financeiro:regras-conciliacao:criar"},
            {nome: "Regras de Conciliação - Edição", codigo: "financeiro:regras-conciliacao:editar"},
            {nome: "Regras de Conciliação - Exclusão", codigo: "financeiro:regras-conciliacao:deletar"},
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
        grupo: "Clientes/Fornecedores",
        itens: [
            {nome: "Cadastro de Clientes/Fornecedores", codigo: "financeiro:parceiros:criar"},
            {nome: "Consulta de Clientes/Fornecedores", codigo: "financeiro:parceiros:listar"},
            {nome: "Edição de Clientes/Fornecedores", codigo: "financeiro:parceiros:editar"},
            {nome: "Exclusão de Clientes/Fornecedores", codigo: "financeiro:parceiros:deletar"},
        ],
    },
    {
        grupo: "Contas Bancárias",
        itens: [
            {nome: "Cadastro de Contas Bancárias", codigo: "configuracoes:contas-bancarias:criar"},
            {nome: "Consulta de Contas Bancárias", codigo: "configuracoes:contas-bancarias:listar"},
            {nome: "Edição de Contas Bancárias", codigo: "configuracoes:contas-bancarias:editar"},
            {nome: "Exclusão de Contas Bancárias", codigo: "configuracoes:contas-bancarias:deletar"},
        ],
    },
    {
        grupo: "Plano de Contas",
        itens: [
            {nome: "Cadastro de Plano de Contas", codigo: "configuracoes:plano-contas:criar"},
            {nome: "Consulta de Plano de Contas", codigo: "configuracoes:plano-contas:listar"},
            {nome: "Edição de Plano de Contas", codigo: "configuracoes:plano-contas:editar"},
            {nome: "Exclusão de Plano de Contas", codigo: "configuracoes:plano-contas:deletar"},
        ],
    },
    {
        grupo: "Metas Financeiras",
        itens: [
            {nome: "Consulta de Metas", codigo: "financeiro:metas:listar"},
            // POST /metas grava (cria e altera) a planilha inteira com esta permissão.
            {nome: "Cadastro e edição de Metas", codigo: "financeiro:metas:editar"},
        ],
    },
    {
        grupo: "Departamentos & Filiais",
        itens: [
            // Consultar não exige permissão: as listas abrem para qualquer usuário da empresa.
            {nome: "Cadastro de Departamentos", codigo: "configuracoes:departamentos:criar"},
            {nome: "Edição de Departamentos", codigo: "configuracoes:departamentos:editar"},
            {nome: "Exclusão de Departamentos", codigo: "configuracoes:departamentos:deletar"},
            {nome: "Cadastro de Filiais", codigo: "configuracoes:filiais:criar"},
            {nome: "Edição de Filiais", codigo: "configuracoes:filiais:editar"},
            {nome: "Exclusão de Filiais", codigo: "configuracoes:filiais:deletar"},
        ],
    },
    {
        grupo: "Configurações do Sistema",
        itens: [
            {nome: "Cadastro de Usuários", codigo: "admin:usuarios:criar"},
            {nome: "Consulta de Usuários", codigo: "admin:usuarios:listar"},
            // Bloquear o usuário é edição (PUT /usuarios/:id com bloqueado).
            {nome: "Edição e bloqueio de Usuários", codigo: "admin:usuarios:editar"},
            {nome: "Conceder permissões a usuários", codigo: "admin:permissoes:conceder"},
            {nome: "Edição dos dados da própria empresa", codigo: "admin:empresas:editar"},
            {nome: "Cadastro de Tokens de API", codigo: "admin:tokens-api:criar"},
            {nome: "Consulta de Tokens de API", codigo: "admin:tokens-api:listar"},
            {nome: "Edição de Tokens de API", codigo: "admin:tokens-api:editar"},
            {nome: "Exclusão de Tokens de API", codigo: "admin:tokens-api:deletar"},
            {nome: "Consulta da Auditoria (só pela API)", codigo: "admin:auditoria:listar"},
        ],
    },
];

export const todasPermissoes: string[] = permissoesGranulares.flatMap((g) => g.itens.map((i) => i.codigo));

/**
 * Permissões do catálogo que nenhuma rota da API nem tela do front confere.
 * Ficam fora da tela para o admin não conceder algo que não libera nada.
 * Continuam no catálogo e no banco: quem já as tem não perde a linha, e o PUT
 * de permissões segue aceitando o que a janela reenviar.
 */
export const PERMISSOES_SEM_TELA: readonly string[] = [
    // Relatórios planejados que não foram feitos.
    "relatorios:fluxo-caixa-diario",
    "relatorios:economico",
    "relatorios:vencimento",
    "relatorios:extrato",
    // Metas: POST /metas (cria e altera) exige financeiro:metas:editar; não há
    // rota de exclusão. A migration 0034 dá editar a quem tinha criar.
    "financeiro:metas:criar",
    "financeiro:metas:deletar",
    // GET /regras-conciliacao usa financeiro:conciliacao:acessar.
    "financeiro:regras-conciliacao:listar",
    // Dashboard é a tela inicial ("/") e abre para qualquer usuário da empresa;
    // as rotas /dashboard/* não conferem permissão. Ligar exigiria outra tela
    // inicial para quem não a tiver: decisão de produto, não tomada aqui.
    "dashboard:ver",
    // Não há módulo de Contas a Pagar/Receber à parte: títulos são lançamentos
    // (financeiro:lancamentos:*), quitados só pela conciliação, e a exportação
    // é a da tela de Lançamentos (financeiro:lancamentos:listar).
    "financeiro:contas-pagar:criar",
    "financeiro:contas-pagar:listar",
    "financeiro:contas-pagar:baixar",
    "financeiro:contas-pagar:cancelar",
    "financeiro:contas-receber:criar",
    "financeiro:contas-receber:listar",
    "financeiro:contas-receber:baixar",
    "financeiro:contas-receber:cancelar",
    "financeiro:contas-receber:exportar",
    // "Importar CR e CP": não há importação de títulos. Importar extrato é
    // financeiro:conciliacao:importar.
    "financeiro:importar",
    // Plano de contas não tem exportação nem cadastro de categoria à parte (a
    // categoria é um campo da conta, gravado com configuracoes:plano-contas:*).
    "configuracoes:plano-contas:exportar",
    "configuracoes:categorias:criar",
    "configuracoes:categorias:listar",
    "configuracoes:categorias:deletar",
    // Não há cadastro de fechamentos; o relatório Fechamento Mensal usa
    // relatorios:financeiro.
    "financeiro:fechamentos:criar",
    "financeiro:fechamentos:listar",
    "financeiro:fechamentos:deletar",
    // Não há exclusão de usuário: bloquear é admin:usuarios:editar e tirar o
    // usuário da empresa é só do superadmin.
    "admin:usuarios:deletar",
];

/**
 * Permissões da janela que nenhuma rota da API confere: só abrem a tela no
 * front (PERMISSAO_TELA). A API de listagem desses cadastros não as exige
 * porque os combos de outras telas usam a mesma lista.
 */
export const PERMISSOES_SO_PORTA_DE_TELA: readonly string[] = [
    "financeiro:parceiros:listar",
    "configuracoes:contas-bancarias:listar",
    "configuracoes:plano-contas:listar",
    "financeiro:metas:listar",
];

/**
 * Permissões que a API ou o front conferem mas que, de propósito, não aparecem
 * na janela. Hoje nenhuma: toda permissão conferida pode ser concedida. Quem
 * acrescentar aqui explica o motivo ao lado.
 */
export const PERMISSOES_USADAS_FORA_DA_JANELA: readonly string[] = [];

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
 * Metas: Financeiro cadastra e altera (financeiro:metas:editar, o que o POST
 * /metas exige); Gestor e Visualizador só consultam.
 *
 * O Visualizador só lê: só ações `:listar`/`:ver` (perfis-acesso.test.ts confere).
 */
export const perfisBase: Record<string, string[]> = {
    Admin: todasPermissoes,
    Financeiro: [
        // Fica fora o que está em PERMISSOES_SEM_TELA (não libera nada).
        "relatorios:fluxo-caixa-mensal", "relatorios:dre",
        "relatorios:contabil-fiscal",
        "financeiro:conciliacao:acessar",
        "financeiro:conciliacao:importar",
        "financeiro:conciliacao:vincular",
        "financeiro:conciliacao:ignorar",
        "financeiro:conciliacao:desfazer",
        "financeiro:conciliacao:concluir",
        "configuracoes:contas-bancarias:listar", "financeiro:parceiros:listar", "configuracoes:plano-contas:listar",
        "financeiro:lancamentos:criar", "financeiro:lancamentos:listar", "financeiro:lancamentos:editar",
        "financeiro:metas:listar", "financeiro:metas:editar",
        ...tarefasKanban,
    ],
    Gestor: [
        "relatorios:dre", "relatorios:fluxo-caixa-mensal", "relatorios:metas",
        "relatorios:contabil-fiscal",
        "configuracoes:contas-bancarias:listar", "financeiro:parceiros:listar", "configuracoes:plano-contas:listar",
        "financeiro:lancamentos:listar", "financeiro:metas:listar",
        ...tarefasKanban,
    ],
    // Perfil de leitura: só consulta. Tarefas também (migration 0033 tira criar/
    // editar/excluir de quem já tem perfil_base = 'Visualizador').
    Visualizador: [
        "financeiro:metas:listar",
        "financeiro:lancamentos:listar",
        "kanban:tarefas:listar",
    ],
};
