const XLSX = require('xlsx');

const data = [
  ['Tipo', 'Vencimento', 'Parceiro', 'Descricao', 'Valor', 'Status', 'Categoria', 'Competencia', 'ContaBancaria'],
  ['CP', '25/11/2023', 'ABC Solucoes LTDA', 'Licenca Software Oracle', 1500.50, 'Pendente', 'Sistemas', '11/2023', 'Itau CC'],
  ['CR', '10/12/2023', 'Cliente Exemplo S.A.', 'Projeto Consultoria Fase 1', 12500.00, 'Pendente', 'Receita de Servicos', '12/2023', 'Bradesco CC'],
];

const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Lancamentos');
XLSX.writeFile(wb, '../../modelo_financeiro.xlsx');
