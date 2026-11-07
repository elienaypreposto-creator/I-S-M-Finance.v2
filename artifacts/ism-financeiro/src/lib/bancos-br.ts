// Lista de bancos do cadastro de contas bancárias.
//
// Os "principais" vêm primeiro, com logo local em /public/logos-bancos/<codigo>.svg
// e cores da marca. O `nome` deles é o texto gravado no campo `banco` das contas
// já cadastradas: NÃO altere esses nomes. Os demais vêm da lista oficial do Banco
// Central (bancos-bcb.ts, gerado por scripts/gerar-bancos-bcb.mjs) e usam o selo
// com sigla e cor neutra.
import {BANCOS_BCB} from "./bancos-bcb.ts";

export type Banco = {
    /** Código COMPE com 3 dígitos. */
    codigo: string;
    nome: string;
    sigla: string;
    /** Fundo do selo (fallback do logo). */
    cor: string;
    /** Cor do texto do selo. */
    texto: string;
    /** Caminho do logo local; ausente nos bancos que só têm o selo. */
    logo?: string;
    principal: boolean;
};

export const BANCOS_PRINCIPAIS = [
    {codigo: "001", nome: "Banco do Brasil", sigla: "BB", cor: "#0033A0", texto: "#FFEF00", logo: "/logos-bancos/001.svg"},
    {codigo: "033", nome: "Santander", sigla: "SA", cor: "#EC0000", texto: "#FFFFFF", logo: "/logos-bancos/033.svg"},
    {codigo: "104", nome: "Caixa Econômica Federal", sigla: "CX", cor: "#0070AD", texto: "#FF6600", logo: "/logos-bancos/104.svg"},
    {codigo: "237", nome: "Bradesco", sigla: "BR", cor: "#CC092F", texto: "#FFFFFF", logo: "/logos-bancos/237.svg"},
    {codigo: "341", nome: "Itaú Unibanco", sigla: "IT", cor: "#EC7000", texto: "#003087", logo: "/logos-bancos/341.svg"},
    {codigo: "260", nome: "Nubank", sigla: "NU", cor: "#8A05BE", texto: "#FFFFFF", logo: "/logos-bancos/260.svg"},
    {codigo: "077", nome: "Banco Inter", sigla: "IN", cor: "#FF7A00", texto: "#FFFFFF", logo: "/logos-bancos/077.svg"},
    {codigo: "290", nome: "PagBank (PagSeguro)", sigla: "PB", cor: "#00C650", texto: "#FFFFFF", logo: "/logos-bancos/290.svg"},
    {codigo: "323", nome: "Mercado Pago", sigla: "MP", cor: "#00AAEF", texto: "#FFFFFF", logo: "/logos-bancos/323.svg"},
    {codigo: "336", nome: "Banco C6", sigla: "C6", cor: "#000000", texto: "#FFC800", logo: "/logos-bancos/336.svg"},
    {codigo: "756", nome: "Sicoob", sigla: "SI", cor: "#003641", texto: "#7DB92B", logo: "/logos-bancos/756.svg"},
    {codigo: "748", nome: "Sicredi", sigla: "SC", cor: "#6DC122", texto: "#00331E", logo: "/logos-bancos/748.svg"},
    {codigo: "422", nome: "Banco Safra", sigla: "SF", cor: "#00205B", texto: "#FFFFFF", logo: "/logos-bancos/422.svg"},
    {codigo: "070", nome: "BRB - Banco de Brasília", sigla: "BRB", cor: "#00833E", texto: "#FFC629", logo: "/logos-bancos/070.svg"},
    {codigo: "212", nome: "Banco Original", sigla: "OR", cor: "#00D084", texto: "#0B3D2E", logo: "/logos-bancos/212.svg"},
    {codigo: "655", nome: "Banco Votorantim (BV)", sigla: "BV", cor: "#FF5F00", texto: "#FFFFFF", logo: "/logos-bancos/655.svg"},
    {codigo: "208", nome: "Banco BTG Pactual", sigla: "BTG", cor: "#0A0A0A", texto: "#FFFFFF", logo: "/logos-bancos/208.svg"},
    {codigo: "197", nome: "Stone Pagamentos", sigla: "ST", cor: "#00A868", texto: "#FFFFFF", logo: "/logos-bancos/197.svg"},
    {codigo: "380", nome: "PicPay", sigla: "PP", cor: "#21C25E", texto: "#FFFFFF", logo: "/logos-bancos/380.svg"},
    {codigo: "102", nome: "XP Investimentos", sigla: "XP", cor: "#000000", texto: "#FFCE00", logo: "/logos-bancos/102.svg"},
] as const;

/** Cores do selo dos bancos sem logo (neutras, legíveis no tema escuro). */
const COR_NEUTRA = "#334155";
const TEXTO_NEUTRO = "#E2E8F0";

const IGNORAR_NA_SIGLA = new Set(["banco", "de", "da", "do", "das", "dos", "e", "la", "del", "-"]);

/** Sigla de até 3 caracteres para o selo: "Banco da Amazonia" -> "AM", "Credisan CC" -> "CC". */
export function siglaDoNome(nome: string): string {
    const palavras = nome
        .replace(/\(.*?\)/g, " ")
        .split(/\s+/)
        .filter((p) => p && !IGNORAR_NA_SIGLA.has(p.toLowerCase()));
    if (palavras.length === 0) return "?";
    const limpa = (p: string) => p.replace(/[^\p{L}\p{N}]/gu, "");
    const primeira = limpa(palavras[0]);
    const segunda = palavras[1] ? limpa(palavras[1]) : "";
    // Uma palavra só, ou a primeira já é uma sigla (UBS, C6, BNDES...): usa ela.
    if (!segunda || /^[\p{Lu}\p{N}]{2,}$/u.test(primeira)) {
        return (primeira.length <= 3 ? primeira : primeira.slice(0, 2)).toUpperCase() || "?";
    }
    return (primeira.charAt(0) + segunda.charAt(0)).toUpperCase();
}

const codigosPrincipais = new Set<string>(BANCOS_PRINCIPAIS.map((b) => b.codigo));

export const BANCOS_BR: readonly Banco[] = [
    ...BANCOS_PRINCIPAIS.map((b) => ({...b, principal: true})),
    ...BANCOS_BCB.filter(([codigo]) => !codigosPrincipais.has(codigo)).map(([codigo, nome]) => ({
        codigo,
        nome,
        sigla: siglaDoNome(nome),
        cor: COR_NEUTRA,
        texto: TEXTO_NEUTRO,
        principal: false,
    })),
];

const porNome = new Map(BANCOS_BR.map((b) => [b.nome, b]));

/** Banco pelo nome gravado na conta (o campo `banco` guarda o nome). */
export function bancoPorNome(nome: string | null | undefined): Banco | undefined {
    return nome ? porNome.get(nome) : undefined;
}

/** Minúsculas, sem acento e sem espaços nas pontas. */
export function normalizarTexto(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const semZerosAEsquerda = (s: string) => s.replace(/^0+(?=\d)/, "");

/**
 * Filtra bancos pelo que o usuário digitou: código (com ou sem zeros à
 * esquerda: "1", "001", "341") e/ou nome sem diferenciar maiúsculas e acentos
 * ("itau" acha "Itaú"). Cada palavra do termo precisa casar com o código, a
 * sigla ou o nome. Código exato vem primeiro, depois código que começa com o
 * termo; o resto mantém a ordem da lista (principais primeiro).
 */
export function filtrarBancos<T extends Pick<Banco, "codigo" | "nome" | "sigla">>(
    bancos: readonly T[],
    termo: string,
): T[] {
    const tokens = normalizarTexto(termo).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [...bancos];

    const resultado: { banco: T; rank: number; i: number }[] = [];
    bancos.forEach((banco, i) => {
        const nome = normalizarTexto(banco.nome);
        const sigla = normalizarTexto(banco.sigla);
        const codigo = semZerosAEsquerda(banco.codigo);
        let rank = 2;
        const casa = tokens.every((t) => {
            if (/^\d+$/.test(t)) {
                const num = semZerosAEsquerda(t);
                if (codigo === num) {
                    rank = 0;
                    return true;
                }
                if (banco.codigo.startsWith(t) || codigo.startsWith(num)) {
                    rank = Math.min(rank, 1);
                    return true;
                }
            }
            return nome.includes(t) || sigla === t;
        });
        if (casa) resultado.push({banco, rank, i});
    });
    return resultado.sort((a, b) => a.rank - b.rank || a.i - b.i).map((r) => r.banco);
}
