import * as XLSX from 'xlsx/xlsx.js';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'modelo_financeiro.xlsx');
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws);

console.log('=== VERIFICAÇÃO DA PLANILHA ===');
console.log('Total de linhas:', data.length);
console.log('Colunas:', Object.keys(data[0] || {}).join(', '));

const uniquePartners = [...new Set(data.map((r: any) => r.Parceiro).filter(Boolean))];
console.log('Total parceiros únicos:', uniquePartners.length);
console.log('Parceiros:', uniquePartners.join(', '));

const uniqueCategories = [...new Set(data.map((r: any) => r.Categoria).filter(Boolean))];
console.log('Categorias únicas:', uniqueCategories.join(', '));

const uniqueContas = [...new Set(data.map((r: any) => r.ContaBancaria).filter(Boolean))];
console.log('Contas bancárias únicas:', uniqueContas.join(', '));