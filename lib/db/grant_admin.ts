import { pool } from "./src/index";

async function grantAdmin() {
  const email = "vinicosta37@gmail.com";
  
  const permissoesBackend = [
    "admin:usuarios:listar", "admin:usuarios:criar", "admin:usuarios:editar", "admin:usuarios:deletar",
    "admin:tokens-api:listar", "admin:tokens-api:criar", "admin:tokens-api:editar", "admin:tokens-api:deletar",
    "admin:migrate-passwords",
    "financeiro:lancamentos:deletar", "financeiro:lancamentos:criar", "financeiro:lancamentos:editar",
    "financeiro:parceiros:criar", "financeiro:parceiros:editar", "financeiro:parceiros:deletar",
    "financeiro:metas:editar",
    "configuracoes:plano-contas:criar", "configuracoes:plano-contas:editar", "configuracoes:plano-contas:deletar",
    "configuracoes:filiais:criar", "configuracoes:filiais:editar", "configuracoes:filiais:deletar",
    "configuracoes:departamentos:criar", "configuracoes:departamentos:editar", "configuracoes:departamentos:deletar",
    "configuracoes:contas-bancarias:criar", "configuracoes:contas-bancarias:editar", "configuracoes:contas-bancarias:deletar"
  ];

  const permissoesUI = [
    "Dashboard", "Demonstrativo de Resultado", "Fluxo de Caixa Diário", "Fluxo de Caixa Mensal", 
    "Relatório Econômico", "Relatório Financeiro", "Relatório por Vencimento", "Extrato Financeiro", "Análise de Metas", 
    "Cadastro de Contas a Pagar", "Consulta de Contas a Pagar", "Baixa de Contas a Pagar", "Cancelamento de Contas a Pagar", "Importar CR e CP", 
    "Cadastro de Contas a Receber", "Consulta de Contas a Receber", "Baixa de Contas a Receber", "Cancelamento de Contas a Receber", "Exportar Contas a Receber", 
    "Conciliação Bancária", "Conciliação Bancária - Conciliar Transações", "Conciliação Bancária - Importar Arquivo", 
    "Cadastro de Contas", "Consulta de Contas", "Exclusão de Contas", 
    "Cadastro de Pessoa", "Consulta de Pessoa", "Exclusão de Pessoa", 
    "Cadastro de Plano de Contas", "Consulta de Plano de Contas", "Exclusão de Plano de Contas", "Exportar Plano de Contas", 
    "Cadastro de Categoria do Plano de Contas", "Consulta de Categoria do Plano de Contas", "Exclusão de Categoria do Plano de Contas", 
    "Cadastro de Metas", "Consulta de Metas", "Exclusão de Metas", 
    "Cadastro de Fechamentos Financeiros", "Consulta de Fechamentos Financeiros", "Exclusão de Fechamentos Financeiros", 
    "Cadastro de Movimentação Financeira", "Consulta de Movimentação Financeira", "Exclusão de Movimentação Financeira", 
    "Cadastro de Usuários", "Consulta de Usuários", "Exclusão de Usuários", 
    "Cadastro de Token de API", "Consulta de Tokens de API", "Exclusão de Token de API"
  ];

  const todasPermissoes = [...new Set([...permissoesBackend, ...permissoesUI])];

  try {
    console.log(`Buscando usuário: ${email}`);
    const res = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    
    if (res.rows.length === 0) {
      console.log("Usuário não encontrado!");
      return;
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
      } catch (err) {
        console.error(`Erro ao inserir permissão ${perm}:`, err.message);
      }
    }
    
    // Atualiza o perfil_base
    await pool.query('UPDATE usuarios SET perfil_base = $1 WHERE id = $2', ['Admin', userId]);

    console.log(`Sucesso! Foram concedidas ${count} permissões ao usuário ${email}.`);
    console.log(`Por favor, faça LOGIN NOVAMENTE na aplicação para renovar seu token JWT com as novas permissões.`);
  } catch (err) {
    console.error("Erro geral:", err);
  } finally {
    process.exit(0);
  }
}

grantAdmin();
