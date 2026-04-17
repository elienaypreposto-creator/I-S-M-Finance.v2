import * as XLSX from 'xlsx';
import path from 'path';

const data = [
  ['Tipo', 'Vencimento', 'Parceiro', 'Descricao', 'Valor', 'Status', 'Categoria', 'Competencia', 'ContaBancaria'],
  ['CP', '25/11/2023', 'ABC Solucoes LTDA', 'Licenca Software Oracle', 1500.50, 'Pendente', 'Sistemas', '11/2023', 'Itau CC'],
  ['CR', '10/12/2023', 'Cliente Exemplo S.A.', 'Projeto Consultoria Fase 1', 12500.00, 'Pendente', 'Receita de Servicos', '12/2023', 'Bradesco CC'],
];

const worksheet = XLSX.utils.aoa_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Lancamentos');

const filePath = path.resolve(process.cwd(), 'modelo_financeiro.xlsx');
XLSX.writeFile(workbook, filePath);

console.log(`Modelo XLSX gerado em: ${filePath}`);
