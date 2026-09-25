import {useEffect} from "react";
import {useLocation} from "wouter";
import {useAuth} from "@/hooks/use-auth";

const PAGE_TITLES: Array<{prefix: string; title: string}> = [
    {prefix: "/lancamentos", title: "Lançamentos"},
    {prefix: "/kanban", title: "Tarefas"},
    {prefix: "/conciliacao", title: "Conciliação"},
    {prefix: "/cadastros/parceiros", title: "Parceiros"},
    {prefix: "/cadastros/contas-bancarias", title: "Contas bancárias"},
    {prefix: "/cadastros/plano-contas", title: "Plano de contas"},
    {prefix: "/cadastros/metas", title: "Metas"},
    {prefix: "/cadastros/departamentos", title: "Departamentos"},
    {prefix: "/relatorios/fechamento-mensal", title: "Fechamento mensal"},
    {prefix: "/relatorios/contabil-fiscal", title: "Contábil/Fiscal"},
    {prefix: "/relatorios/dre", title: "DRE"},
    {prefix: "/relatorios/fluxo-caixa", title: "Fluxo de caixa"},
    {prefix: "/relatorios/metas", title: "Metas"},
    {prefix: "/relatorios/conciliacao", title: "Conciliação"},
    {prefix: "/configuracoes/usuarios", title: "Usuários"},
    {prefix: "/configuracoes/filiais", title: "Filiais"},
    {prefix: "/configuracoes/tokens-api", title: "Tokens de API"},
    {prefix: "/admin/empresas", title: "Empresas"},
    {prefix: "/", title: "Dashboard"},
];

function titleForPath(path: string): string {
    const found = PAGE_TITLES.find((item) => (item.prefix === "/" ? path === "/" : path.startsWith(item.prefix)));
    return found?.title ?? "ISM Finance";
}

export function useEmpresaTitle(): void {
    const [location] = useLocation();
    const {empresaAtiva} = useAuth();

    useEffect(() => {
        const page = titleForPath(location);
        document.title = empresaAtiva?.nome ? `${page} · ${empresaAtiva.nome}` : `${page} · ISM Finance`;
    }, [location, empresaAtiva?.nome]);
}
