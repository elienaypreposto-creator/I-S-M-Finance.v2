/**
 * Como cada rota autenticada é exercitada na varredura de isolamento.
 *
 * A LISTA DE ROTAS NÃO É MANUAL: vem do router (route-inventory.ts). Aqui só se
 * diz (1) qual id da empresa-alvo preenche cada `:param` e (2) um corpo válido
 * quando a rota é de escrita. Rota nova com `:param` desconhecido faz
 * `montarRequisicao` lançar erro, e o teste de cobertura falha: quem criou a rota
 * é obrigado a classificá-la aqui.
 */

import type {EmpresaFx} from "./harness";
import type {RouteEntry} from "./route-inventory";

/** `${primeiro segmento}:${param}` -> valor que pertence à empresa-alvo. */
const PARAMS: Record<string, (alvo: EmpresaFx) => string> = {
    "contas-bancarias:id": (e) => String(e.ids.conta),
    "lancamentos:id": (e) => String(e.ids.lancamento),
    "parceiros:id": (e) => String(e.ids.parceiro),
    "plano-contas:id": (e) => String(e.ids.planoConta),
    "filiais:id": (e) => String(e.ids.filial),
    "departamentos:id": (e) => String(e.ids.departamento),
    "regras-conciliacao:id": (e) => String(e.ids.regra),
    "tokens-api:id": (e) => String(e.ids.tokenApi),
    "transferencias:grupo_id": (e) => e.ids.transferenciaGrupo,
    "usuarios:id": (e) => String(e.usuarioId),
    "usuarios:empresaId": (e) => String(e.id),
    "empresas:id": (e) => String(e.id),
    "admin:id": (e) => String(e.id),
    // Token de exportação é emitido só por superadmin; aqui basta um valor sintático.
    "admin:token": () => "0".repeat(32),
    "conciliacoes:extrato_id": (e) => String(e.ids.extrato),
    "conciliacoes:linha_id": (e) => String(e.ids.linha),
    "conciliacoes:vinculo_id": (e) => String(e.ids.vinculo),
    "kanban:id": (e) => String(e.ids.kanbanCard),
};

/** Corpos de escrita. Sempre tentam forçar `empresa_id` da empresa-alvo. */
const BODIES: Record<string, (alvo: EmpresaFx) => unknown> = {
    "POST /contas-bancarias": (b) => ({tipo: "corrente", nome: "HACK", data_inicio: "2026-01-01", empresa_id: b.id}),
    "PUT /contas-bancarias/:id": (b) => ({nome: "HACK", empresa_id: b.id}),
    "POST /lancamentos": (b) => ({
        tipo: "CP",
        vencimento: "2026-02-01",
        valor: "1",
        descricao: "HACK",
        conta_id: b.ids.conta,
        parceiro_id: b.ids.parceiro,
        plano_conta_id: b.ids.planoConta,
        empresa_id: b.id,
    }),
    "PUT /lancamentos/:id": (b) => ({descricao: "HACK", valor: "999", empresa_id: b.id}),
    "POST /parceiros": (b) => ({tipo_pessoa: "PJ", nome: "HACK", cpf_cnpj: "11222333000181", empresa_id: b.id}),
    "PUT /parceiros/:id": (b) => ({tipo_pessoa: "PJ", nome: "HACK", cpf_cnpj: "11222333000181", empresa_id: b.id}),
    "POST /plano-contas": (b) => ({tipo: "despesa", categoria: "HACK", empresa_id: b.id}),
    "PUT /plano-contas/:id": (b) => ({categoria: "HACK", empresa_id: b.id}),
    "POST /filiais": (b) => ({nome: "HACK", empresa_id: b.id}),
    "PUT /filiais/:id": (b) => ({nome: "HACK", empresa_id: b.id}),
    "POST /departamentos": (b) => ({nome: "HACK", empresa_id: b.id}),
    "PUT /departamentos/:id": (b) => ({nome: "HACK", empresa_id: b.id}),
    "POST /metas": (b) => ({plano_conta_id: b.ids.planoConta, ano: 2026, mes: 1, valor_projetado: "1"}),
    "POST /regras-conciliacao": (b) => ({texto_gatilho: "HACK", natureza: "saida", empresa_id: b.id}),
    "PUT /regras-conciliacao/:id": (b) => ({texto_gatilho: "HACK", natureza: "saida", empresa_id: b.id}),
    "PATCH /empresas/:id": () => ({razao_social: "HACK"}),
    "PUT /usuarios/:id": () => ({nome: "HACK"}),
    "PUT /usuarios/:id/permissoes": () => ({permissoes: ["dashboard:ver"]}),
    "PATCH /kanban/cards/:id": () => ({titulo: "HACK"}),
    "POST /kanban/cards": (b) => ({titulo: "HACK", empresa_id: b.id}),
};

export type Requisicao = {
    method: string;
    path: string;
    body: unknown;
    /** Rota tem `:param` que aponta para dado da empresa-alvo. */
    temIdAlheio: boolean;
    /** Rotas administrativas: um usuário comum (não superadmin) precisa receber 403. */
    exige403: boolean;
};

export function montarRequisicao(route: RouteEntry, alvo: EmpresaFx): Requisicao {
    const segmentos = route.path.split("/").filter(Boolean);
    const primeiro = segmentos[0] ?? "";
    let temIdAlheio = false;

    const path = route.path.replace(/:([A-Za-z_]+)/g, (_m, nome: string) => {
        const resolver = PARAMS[`${primeiro}:${nome}`];
        if (!resolver) {
            throw new Error(
                `Rota nova sem classificação de isolamento: "${route.key}" (param :${nome}). ` +
                `Adicione "${primeiro}:${nome}" em test/isolation/scenarios.ts.`,
            );
        }
        temIdAlheio = true;
        return encodeURIComponent(resolver(alvo));
    });

    const mk = BODIES[route.key];
    const comCorpo = ["POST", "PUT", "PATCH"].includes(route.method);
    return {
        method: route.method,
        path,
        body: comCorpo ? (mk ? mk(alvo) : {}) : undefined,
        temIdAlheio,
        exige403: primeiro === "admin",
    };
}