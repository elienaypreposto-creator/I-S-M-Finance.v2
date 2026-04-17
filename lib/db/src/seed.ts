import { db, pool, planoContasTable } from "./index";

const planoContas = [
  // RECEITAS
  { tipo: 'receita', categoria: 'ATIVIDADES DE FINANCIAMENTO', subcategoria: 'Ingresso de Empréstimos' },
  { tipo: 'receita', categoria: 'Devoluções', subcategoria: 'Devoluções de Compra do Ativo' },
  { tipo: 'receita', categoria: 'Devoluções', subcategoria: 'Devoluções de Compra de Material de Consumo' },
  { tipo: 'receita', categoria: 'Devoluções', subcategoria: 'Devoluções de Compra de Matéria Prima' },
  { tipo: 'receita', categoria: 'Devoluções', subcategoria: 'Devoluções de Compra de Mercadoria de Revenda' },
  { tipo: 'receita', categoria: 'Devoluções', subcategoria: 'Devoluções de Compra de Serviços' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'AFAC (irretratável)' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Aumento de Capital' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Estorno de Débitos - Cartão de Crédito' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Estorno de Débitos - Consórcios' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Estorno de Débitos - Seguros' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Estorno de Juros a Apropriar s/ Empréstimo Banco do...' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Estorno de Juros a Apropriar s/ Empréstimo Banpará' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Estorno de Juros s/ Empréstimos' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Receitas a Identificar' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Reembolso de Despesas' },
  { tipo: 'receita', categoria: 'Outras Entradas', subcategoria: 'Venda de Ativos' },
  { tipo: 'receita', categoria: 'Receitas Diretas', subcategoria: 'Clientes - Revenda de Mercadoria' },
  { tipo: 'receita', categoria: 'Receitas Diretas', subcategoria: 'Clientes - Serviços Prestados' },
  { tipo: 'receita', categoria: 'Receitas Diretas', subcategoria: 'Clientes - Vendas de Mercadorias Fabricadas' },
  { tipo: 'receita', categoria: 'Receitas Indiretas', subcategoria: 'Dividendos Recebidos' },
  { tipo: 'receita', categoria: 'Receitas Indiretas', subcategoria: 'Rendimentos de Aplicação' },
  { tipo: 'receita', categoria: 'Receitas Indiretas', subcategoria: 'Resgate Aplicação' },

  // DESPESAS
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Advogados' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Água e Esgoto' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Aluguel' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Armazenamento e Processamento de Dados' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Auditorias' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Condomínio' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Contabilidade' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Despesa Cartão de Crédito' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Emprest. Capital Giro' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Energia Elétrica' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Gás' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'IPTU' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Limpeza' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Manutenção do Imobilizado' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Material de Escritório' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Material de Uso e Consumo' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Reembolso' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Segurança' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Seguros' },
  { tipo: 'despesa', categoria: 'Despesas Administrativas', subcategoria: 'Telefones' },

  { tipo: 'despesa', categoria: 'Despesas Diretas', subcategoria: 'Compras de Matéria Prima' },
  { tipo: 'despesa', categoria: 'Despesas Diretas', subcategoria: 'Compras de Mercadorias para Revenda' },
  { tipo: 'despesa', categoria: 'Despesas Diretas', subcategoria: 'Freelancer' },
  { tipo: 'despesa', categoria: 'Despesas Diretas', subcategoria: 'Frete' },
  { tipo: 'despesa', categoria: 'Despesas Diretas', subcategoria: 'Parceiro - Cliente/Fornec' },
  { tipo: 'despesa', categoria: 'Despesas Diretas', subcategoria: 'Prestador(es) de Serviços P.J.' },

  { tipo: 'despesa', categoria: 'Despesas Financeiras / Bancos', subcategoria: 'Juros a apropriar s/ Empréstimo Banpará' },
  { tipo: 'despesa', categoria: 'Despesas Financeiras / Bancos', subcategoria: 'Juros sobre Empréstimos' },
  { tipo: 'despesa', categoria: 'Despesas Financeiras / Bancos', subcategoria: 'Multas' },
  { tipo: 'despesa', categoria: 'Despesas Financeiras / Bancos', subcategoria: 'Pagamento de Empréstimos' },
  { tipo: 'despesa', categoria: 'Despesas Financeiras / Bancos', subcategoria: 'Tarifas Bancárias' },
  { tipo: 'despesa', categoria: 'Despesas Financeiras / Bancos', subcategoria: 'Tx. Abertura de Crédito' },

  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: '13º Salário' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Adiantamento de salário' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Assistência Médica' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Dissídio' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'FGTS' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'FGTS - Empréstimos CEF' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Férias' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'INSS' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'IRRF s/ salários (DARF 0561)' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Multa Atraso de Salários' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Outros Benefícios' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Pensão Alimentícia' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Rescisões' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Salários' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Seguro de Vida' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Vale Alimentação' },
  { tipo: 'despesa', categoria: 'Despesas com Pessoal', subcategoria: 'Vale Transporte' },

  { tipo: 'despesa', categoria: 'Despesas de Vendas e Marketing', subcategoria: 'Bonificações' },
  { tipo: 'despesa', categoria: 'Despesas de Vendas e Marketing', subcategoria: 'Comissões' },
  { tipo: 'despesa', categoria: 'Despesas de Vendas e Marketing', subcategoria: 'Despesas de Viagens' },
  { tipo: 'despesa', categoria: 'Despesas de Vendas e Marketing', subcategoria: 'Marketing' },

  { tipo: 'despesa', categoria: 'Devoluções de Vendas', subcategoria: 'Devoluções de Recebimentos de Clientes' },
  { tipo: 'despesa', categoria: 'Devoluções de Vendas', subcategoria: 'Devoluções de Vendas de Mercadoria' },

  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'COFINS' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'CSRF s/ serviços de terceiros (DARF 5952)' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'Cartórios e Protestos' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'Contribuição Social' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'ICMS' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'IOF' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'IPI' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'IRPJ' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'IRRF s/ aplicações financeiras' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'IRRF s/ serviços de terceiros (DARF 1708 e 8045)' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'ISS' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'PIS' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'Parcelamento Simples Nacional' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'Parcelamento de Impostos Federais' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'Parcelamento de Impostos Municipais' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'Simples Nacional (DAS)' },
  { tipo: 'despesa', categoria: 'Impostos e Taxas', subcategoria: 'Taxas diversas' },

  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Aplicações' },
  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Comunicação' },
  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Consórcios' },
  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Equipamentos de Informática' },
  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Instalações' },
  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Máquinas e Equipamentos' },
  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Móveis e Utensílios' },
  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Títulos de Capitalização' },
  { tipo: 'despesa', categoria: 'Investimento', subcategoria: 'Veículos' },

  { tipo: 'despesa', categoria: 'Outras Despesas', subcategoria: 'Adiantamento a Fornecedores' },
  { tipo: 'despesa', categoria: 'Outras Despesas', subcategoria: 'Antecipação de Lucros - FB Participações' },
  { tipo: 'despesa', categoria: 'Outras Despesas', subcategoria: 'Antecipação de Lucros - Jorge' },
  { tipo: 'despesa', categoria: 'Outras Despesas', subcategoria: 'Antecipação de Lucros - Rodrigo' },
  { tipo: 'despesa', categoria: 'Outras Despesas', subcategoria: 'Antecipação de Lucros - YM Participações' },
  { tipo: 'despesa', categoria: 'Outras Despesas', subcategoria: 'Consultoria' },
  { tipo: 'despesa', categoria: 'Outras Despesas', subcategoria: 'Cursos e Treinamentos' },
  { tipo: 'despesa', categoria: 'Outras Despesas', subcategoria: 'Despesas a Identificar' },
];

async function seed() {
  console.log('Populando Plano de Contas...');

  // delete all first
  await db.delete(planoContasTable);

  for (const conta of planoContas) {
    await db.insert(planoContasTable).values({
      tipo: conta.tipo,
      categoria: conta.categoria,
      subcategoria: conta.subcategoria,
      ativo: true,
    });
  }
  console.log('Plano de contas populado com sucesso.');
  pool.end();
}

seed().catch(err => {
    console.error(err);
    pool.end();
});
