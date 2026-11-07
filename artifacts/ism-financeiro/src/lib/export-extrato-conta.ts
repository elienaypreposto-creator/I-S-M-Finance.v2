/**
 * Exportação do extrato da conta (Relatório Contábil / Fiscal) em XLSX e PDF.
 * Diferente do `export.ts` genérico: valores com centavos (para bater com o PDF do banco),
 * bloco de resumo de saldos antes da tabela e coluna de saldo corrido.
 */
import * as XLSX from "xlsx";
import {jsPDF} from "jspdf";
import autoTable from "jspdf-autotable";
import {
    avisoInicioConta,
    celulasPlanilhaExtrato,
    colunasExtrato,
    colunasResumoContas,
    corpoTabelaExtrato,
    linhasResumo,
    linhasResumoContas,
    tituloExtrato,
    type CelulaExport,
    type ExtratoContaResposta,
} from "./extrato-conta";

const NUMERO = new Intl.NumberFormat("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});

function nomeArquivo(nome: string): string {
    return nome.replace(/[/\\?%*:|"<>]/g, "-");
}

function moeda(valor: CelulaExport): string {
    if (valor === null || valor === "") return "";
    return typeof valor === "number" ? NUMERO.format(valor) : String(valor);
}

export function exportarExtratoXlsx(dados: ExtratoContaResposta): void {
    // Datas como data do Excel e valores como moeda (formatos montados em extrato-conta).
    const celulas = celulasPlanilhaExtrato(dados);
    const ws = XLSX.utils.aoa_to_sheet(celulas.map((linha) => linha.map((c) => c.v)));
    celulas.forEach((linha, r) => {
        linha.forEach((celula, c) => {
            const cel = celula.z ? ws[XLSX.utils.encode_cell({r, c})] : undefined;
            if (cel) cel.z = celula.z;
        });
    });

    const larguras = colunasExtrato(dados.modo).map((c) => c.largura);
    larguras[0] = Math.max(larguras[0] ?? 12, 34); // rótulos do resumo ficam na coluna A
    ws["!cols"] = larguras.map((wch) => ({wch}));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimentações");
    XLSX.writeFile(wb, `${nomeArquivo(tituloExtrato(dados).arquivo)}.xlsx`);
}

export function exportarExtratoPdf(dados: ExtratoContaResposta): void {
    const t = tituloExtrato(dados);
    const doc = new jsPDF({orientation: "landscape", unit: "pt", format: "a4"});
    const largura = doc.internal.pageSize.getWidth();
    const margem = 30;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text(t.titulo, margem, 36);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(t.subtitulo, margem, 52);
    let yResumo = 64;
    const aviso = avisoInicioConta(dados);
    if (aviso) {
        doc.setTextColor(180, 83, 9);
        const linhasAviso = doc.splitTextToSize(aviso, largura - 2 * margem) as string[];
        doc.text(linhasAviso, margem, 66);
        yResumo = 66 + linhasAviso.length * 11;
    }

    const cabecalho = {fillColor: [59, 168, 220] as [number, number, number], textColor: 255, fontStyle: "bold" as const, fontSize: 7.5};

    // Resumo de saldos
    autoTable(doc, {
        startY: yResumo,
        margin: {left: margem, right: margem},
        tableWidth: 320,
        head: [["Resumo", "R$"]],
        body: linhasResumo(dados).map(([rotulo, valor]) => [rotulo, moeda(valor)]),
        styles: {fontSize: 8, cellPadding: 3},
        headStyles: cabecalho,
        columnStyles: {1: {halign: "right", fontStyle: "bold"}},
    });
    let y = (doc as jsPDF & {lastAutoTable: {finalY: number}}).lastAutoTable.finalY + 14;

    if (dados.modo === "todas" && dados.contas?.length) {
        const colunasContas = colunasResumoContas(dados.contas);
        const colContagem = colunasContas.indexOf("Não conciliados");
        autoTable(doc, {
            startY: y,
            margin: {left: margem, right: margem},
            head: [colunasContas],
            body: linhasResumoContas(dados.contas).map((l) => l.map((v, i) => (i === 0 || i === colContagem ? String(v ?? "") : moeda(v)))),
            styles: {fontSize: 7.5, cellPadding: 3},
            headStyles: cabecalho,
            columnStyles: Object.fromEntries(
                colunasContas.map((_, i) => [i, i === 0 ? {} : {halign: i === colContagem ? ("center" as const) : ("right" as const)}]),
            ),
            });
        y = (doc as jsPDF & {lastAutoTable: {finalY: number}}).lastAutoTable.finalY + 14;
    }

    const colunas = colunasExtrato(dados.modo);
    const idxConciliacao = colunas.findIndex((c) => c.header === "Conciliação");
    const corpo = corpoTabelaExtrato(dados);
    autoTable(doc, {
        startY: y,
        margin: {left: margem, right: margem},
        head: [colunas.map((c) => c.header)],
        body: corpo.linhas.map((l) => l.map((v, i) => (colunas[i]?.moeda ? moeda(v) : String(v ?? "")))),
        styles: {fontSize: 6.5, cellPadding: 2.5, overflow: "linebreak", valign: "middle"},
        headStyles: {...cabecalho, fontSize: 6.5},
        alternateRowStyles: {fillColor: [248, 249, 252]},
        columnStyles: Object.fromEntries(
            colunas.map((c, i) => [i, c.moeda ? {halign: "right" as const, cellWidth: 58} : {}]),
        ),
        didParseCell: (h) => {
            if (h.section !== "body") return;
            const item = corpo.itens[h.row.index];
            if (item?.tipo === "abertura") {
                h.cell.styles.fontStyle = "bold";
                return;
            }
            if (h.column.index !== idxConciliacao) return;
            const conciliado = item?.linha.conciliado;
            h.cell.styles.textColor = conciliado ? [22, 128, 61] : [180, 83, 9];
            h.cell.styles.fontStyle = "bold";
        },
    });

    // Rodapé depois das tabelas, para o "de N" sair certo em todas as páginas.
    const total = doc.getNumberOfPages();
    const emitido = new Date().toLocaleString("pt-BR");
    for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`${emitido}  |  Página ${p} de ${total}`, largura - margem, doc.internal.pageSize.getHeight() - 14, {align: "right"});
    }

    doc.save(`${nomeArquivo(t.arquivo)}.pdf`);
}
