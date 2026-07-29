import {pool} from "./src/index";

async function grantAdmin() {
    const args = process.argv.slice(2);
    const emails = args.length > 0 ? args : ["vinicosta37@gmail.com", "ismteste@gmail.com"];


    const permissoesBackend = [
        "admin:usuarios:listar", "admin:usuarios:criar", "admin:usuarios:editar", "admin:usuarios:deletar",
        "admin:tokens-api:listar", "admin:tokens-api:criar", "admin:tokens-api:editar", "admin:tokens-api:deletar",
        "admin:migrate-passwords",
        "financeiro:lancamentos:deletar", "financeiro:lancamentos:criar", "financeiro:lancamentos:editar", "financeiro:lancamentos:alterar_valor",
        "financeiro:parceiros:criar", "financeiro:parceiros:editar", "financeiro:parceiros:deletar",
        "financeiro:metas:editar",
        "financeiro:conciliacao:acessar", "financeiro:conciliacao:importar",
        "financeiro:conciliacao:vincular", "financeiro:conciliacao:ignorar",
        "financeiro:conciliacao:desfazer", "financeiro:conciliacao:concluir",
        "financeiro:conciliacao:configurar",
        "financeiro:regras-conciliacao:listar",
        "financeiro:regras-conciliacao:criar",
        "financeiro:regras-conciliacao:editar",
        "financeiro:regras-conciliacao:deletar",
        "configuracoes:plano-contas:criar", "configuracoes:plano-contas:editar", "configuracoes:plano-contas:deletar",
        "configuracoes:filiais:criar", "configuracoes:filiais:editar", "configuracoes:filiais:deletar",
        "configuracoes:departamentos:criar", "configuracoes:departamentos:editar", "configuracoes:departamentos:deletar",
        "configuracoes:contas-bancarias:criar", "configuracoes:contas-bancarias:editar", "configuracoes:contas-bancarias:deletar"
    ];

    const permissoesUI = [
        "dashboard:ver", "relatorios:dre", "relatorios:fluxo-caixa-diario", "relatorios:fluxo-caixa-mensal",
        "relatorios:economico", "relatorios:financeiro", "relatorios:vencimento", "relatorios:extrato", "relatorios:metas",
        "relatorios:conciliacao", "relatorios:contabil-fiscal",
        "financeiro:contas-pagar:criar", "financeiro:contas-pagar:listar", "financeiro:contas-pagar:baixar", "financeiro:contas-pagar:cancelar", "financeiro:importar",
        "financeiro:contas-receber:criar", "financeiro:contas-receber:listar", "financeiro:contas-receber:baixar", "financeiro:contas-receber:cancelar", "financeiro:contas-receber:exportar",
        "financeiro:conciliacao:acessar", "financeiro:conciliacao:importar",
        "financeiro:conciliacao:vincular", "financeiro:conciliacao:ignorar",
        "financeiro:conciliacao:desfazer", "financeiro:conciliacao:concluir",
        "financeiro:conciliacao:configurar",
        "financeiro:regras-conciliacao:listar",
        "financeiro:regras-conciliacao:criar",
        "financeiro:regras-conciliacao:editar",
        "financeiro:regras-conciliacao:deletar",
        "configuracoes:contas-bancarias:criar", "configuracoes:contas-bancarias:listar", "configuracoes:contas-bancarias:deletar",
        "financeiro:parceiros:criar", "financeiro:parceiros:listar", "financeiro:parceiros:deletar",
        "configuracoes:plano-contas:criar", "configuracoes:plano-contas:listar", "configuracoes:plano-contas:deletar", "configuracoes:plano-contas:exportar",
        "configuracoes:categorias:criar", "configuracoes:categorias:listar", "configuracoes:categorias:deletar",
        "financeiro:metas:criar", "financeiro:metas:listar", "financeiro:metas:deletar",
        "financeiro:fechamentos:criar", "financeiro:fechamentos:listar", "financeiro:fechamentos:deletar",
        "financeiro:lancamentos:criar", "financeiro:lancamentos:listar", "financeiro:lancamentos:editar", "financeiro:lancamentos:alterar_valor", "financeiro:lancamentos:deletar",
        "admin:usuarios:criar", "admin:usuarios:listar", "admin:usuarios:deletar",
        "admin:tokens-api:criar", "admin:tokens-api:listar", "admin:tokens-api:deletar"
    ];

    const todasPermissoes = [...new Set([...permissoesBackend, ...permissoesUI])];

    for (const email of emails) {
        try {
            console.log(`\nBuscando usuário: ${email}`);
            const res = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);

            if (res.rows.length === 0) {
                console.log(`Usuário ${email} não encontrado!`);
                continue;
            }

            const userId = res.rows[0].id;
            console.log(`Usuário encontrado com ID: ${userId}. Concedendo ${todasPermissoes.length} permissões...`);

            // Deleta permissões antigas
            await pool.query('DELETE FROM usuario_permissoes WHERE usuario_id = $1', [userId]);

            // Insere novas
            let count = 0;
            for (const perm of todasPermissoes) {
                try {
                    await pool.query('INSERT INTO usuario_permissoes (usuario_id, codigo_permissao) VALUES ($1, $2)', [userId, perm]);
                    count++;
                } catch (err: any) {
                    console.error(`Erro ao inserir permissão ${perm}:`, err.message);
                }
            }

            // Atualiza o perfil_base
            await pool.query('UPDATE usuarios SET perfil_base = $1 WHERE id = $2', ['Admin', userId]);

            console.log(`Sucesso! Foram concedidas ${count} permissões ao usuário ${email}.`);
            console.log(`Por favor, faça LOGIN NOVAMENTE na aplicação para renovar seu token JWT com as novas permissões.`);
        } catch (err) {
            console.error(`Erro geral ao processar ${email}:`, err);
        }
    }

    process.exit(0);
}

grantAdmin();
