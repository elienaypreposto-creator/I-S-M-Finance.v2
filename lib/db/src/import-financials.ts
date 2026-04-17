import { db } from "@workspace/db";
import { lancamentosTable, parceirosTable, contasBancariasTable, planoContasTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";

async function run() {
  const filePath = path.join(process.cwd(), "modelo_financeiro.xlsx");
  
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  console.log("Iniciando importação de dados da planilha...");

  // 1. Lógica da Conta Bancária "A identificar"
  let contaId: number;
  const [existingConta] = await db.select().from(contasBancariasTable)
    .where(eq(contasBancariasTable.nome, "-- A identificar --"));
  
  if (existingConta) {
    contaId = existingConta.id;
    console.log("Conta bancária '-- A identificar --' existente encontrada.");
  } else {
    // Criação da conta se não existir
    const [novaConta] = await db.insert(contasBancariasTable).values({
      nome: "-- A identificar --",
      tipo: "movimento",
      data_inicio: new Date().toISOString().split("T")[0],
    }).returning();
    contaId = novaConta.id;
    console.log("Conta bancária '-- A identificar --' criada com sucesso.");
  }

  // 2. Carrega o arquivo Excel
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // raw: false ensures cells formatted as Dates are accessible as strings
  const rawData = xlsx.utils.sheet_to_json<any>(worksheet, { raw: false });

  console.log(`Lendo ${rawData.length} registros (linhas)...`);

  // Helper para formatar Data: DD/MM/YYYY -> YYYY-MM-DD
  const parseDate = (val: string | undefined): string | null => {
    if (!val) return null;
    val = String(val).trim();
    // Identifica e trata DD/MM/YYYY ou D/M/YYYY
    if (val.includes("/")) {
      const parts = val.split("/");
      if (parts.length === 3) {
        // Pad with zeros Se necessário
        const d = parts[0].padStart(2, "0");
        const m = parts[1].padStart(2, "0");
        let y = parts[2];
        if (y.length === 2) {
            y = "20" + y; // assumindo 2000+
        }
        return `${y}-${m}-${d}`;
      }
    }
    // Caso seja formato ISO ou timestamp de sistema
    if (val.includes("-")) return val.split("T")[0];
    
    // Fallback: Tentativa de converter como data de sistema local (pode não funcionar para formatos pt-BR complexos)
    const timestamp = Date.parse(val);
    if (!isNaN(timestamp)) {
       return new Date(timestamp).toISOString().split("T")[0];
    }
    
    return null;
  };

  const capitalize = (str: any) => str ? String(str).trim() : "";

  // Busca todas as contas do Plano de Contas para validar a Categoria
  const allPlanos = await db.select().from(planoContasTable);

  let successCount = 0;

  for (const row of rawData) {
    // 3. Processamento e Sanitização da Linha
    const tipo = String(row.Tipo || "CP").trim().toUpperCase(); 
    const isDespesa = tipo !== "CR"; // Ex: "CP", "Despesa", vazio -> CP

    const vencimentoStr = parseDate(row.Vencimento);
    if (!vencimentoStr) {
       console.warn(`[Aviso] Linha ignorada - Falta data vencimento válida (Lido: ${row.Vencimento}). Registro: ${row.Descricao || row.Parceiro}`);
       continue;
    }

    // Se Competencia não existir, usa a de Vencimento
    const competenciaStr = parseDate(row.Competencia) || vencimentoStr;
    const parceiroNome = capitalize(row.Parceiro || "Não Informado");
    
    // 4. Lógica do Parceiro
    // Procurar por Parceiro pelo nome para não duplicar
    const [existingParceiro] = await db.select().from(parceirosTable).where(eq(parceirosTable.nome, parceiroNome));
    let parceiroRowId: number;

    if (existingParceiro) {
      parceiroRowId = existingParceiro.id;
    } else {
      // Como solicitado: Criar Parceiro deixando tipos vazio (nem cliente, nem fornecedor marcado)
      const [newParceiro] = await db.insert(parceirosTable).values({
        nome: parceiroNome,
        tipo_pessoa: "PJ",
        tipos: [], // <-- Deixado em branco para identificação posterior
      }).returning();
      parceiroRowId = newParceiro.id;
    }

    // 5. Mapear a Categoria Informada com as Subcategorias/Categorias cadastradas
    const catName = capitalize(row.Categoria || "");
    let planoContaId: number | null = null;
    
    if (catName) {
       // Buscar "subcategoria" ou "categoria" parecida
       const searchCat = catName.toLowerCase();
       const matched = allPlanos.find(
          p => (p.subcategoria && p.subcategoria.toLowerCase() === searchCat) 
          || (p.categoria && p.categoria.toLowerCase() === searchCat)
       );
       if (matched) {
          planoContaId = matched.id;
       } else {
         console.warn(`[Aviso] Categoria não encontrada no Plano de Contas atrelado: '${catName}'. O lançamento será inserido sem categoria.`);
       }
    }

    // 6. Limpar o Valor Numérico de R$, Pontos de Milhar e Vírgulas (R$ 1.500,00 -> 1500.00)
    let rawStr = String(row.Valor || "0").trim();
    
    if (rawStr.includes("R$")) {
       // Se o formato `raw: false` retornar formatado pelo locale BR
       rawStr = rawStr.replace(/R\$/g, '').trim(); // Remove "R$"
       rawStr = rawStr.replace(/\./g, ''); // Remove separador de milhar "."
       rawStr = rawStr.replace(/,/g, '.'); // Substitui "," decimal por "."
    } else if (rawStr.includes(",") && rawStr.split(",")[rawStr.split(",").length - 1].length <= 2) {
       // Tratamento de segurança caso o XLSX leia o float mas esteja no string formato "1500,50"
       rawStr = rawStr.replace(/\./g, ''); // Remove milhar
       rawStr = rawStr.replace(/,/g, '.'); // Para float js e pg
    }
    
    const valorNumber = parseFloat(rawStr);
    const finalValor = isNaN(valorNumber) ? "0.00" : valorNumber.toFixed(2);

    // 7. Status do Lançamento
    const validStatuses = ["pendente", "pago", "recebido", "atrasado", "cancelado"];
    const inputStatus = String(row.Status || "").trim().toLowerCase();
    
    // Fallback inteligente para status caso em branco
    /* 
      Se o vencimento já passou, "atrasado", senão "pendente", 
      mas confiamos no que o usuário colocou no inputStatus.
    */
    const expectedAutoStatus = !isDespesa ? "recebido" : "pago"; // default fallback for executed lines if it was marked as paid
    const theStatus = validStatuses.includes(inputStatus) ? inputStatus : (inputStatus && inputStatus !== "pendente" ? expectedAutoStatus : "pendente");

    // 8. Inserção do Lançamento
    try {
        await db.insert(lancamentosTable).values({
          tipo: isDespesa ? "CP" : "CR", // Contas a Pagar = Despesa/Custo, Contas a Receber = Receita
          vencimento: vencimentoStr,
          competencia: competenciaStr,
          conta_id: contaId, // Sempre apontará para -- A identificar --
          parceiro_id: parceiroRowId,
          descricao: capitalize(row.Descricao || "-- Lancamento sem origem --"),
          valor: finalValor,
          status: theStatus,
          plano_conta_id: planoContaId,
          // Não utilizamos "riscos", "centro_custo", etc. pois eles não estavam no layout default do modelo.
        });
        successCount++;
    } catch(err: any) {
        console.error(`[Erro] Falha ao gravar lançamento "${row.Descricao}": ${err.message}`);
    }
  }

  console.log(`\nImportação concluída. ${successCount} registros importados com sucesso.`);
  process.exit(0);
}

run().catch(console.error);
