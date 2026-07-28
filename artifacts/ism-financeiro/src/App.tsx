import {Switch, Route, Router as WouterRouter, Redirect} from "wouter";
import {QueryClient, QueryClientProvider, QueryCache, MutationCache} from "@tanstack/react-query";
import {Toaster} from "@/components/ui/toaster";
import {TooltipProvider} from "@/components/ui/tooltip";
import {toast} from "sonner";
import {AppLayout} from "./components/layout/app-layout";
import {ErrorBoundary} from "./components/error-boundary";
import NotFound from "@/pages/not-found";

// Pages
import Dashboard from "./pages/dashboard-FINANCEIRO-ISM";
import Kanban from "./pages/kanban";
import Lancamentos from "./pages/lancamentos-FINANCEIRO-ISM";
import ConciliacaoList from "./pages/conciliacao/index";
import ConciliacaoExtratoDetalhe from "./pages/conciliacao/extrato";

// Cadastros
import Parceiros from "./pages/cadastros/parceiros";
import PlanoContas from "./pages/cadastros/plano-contas-FINANCEIRO-ISM";
import ContasBancarias from "./pages/cadastros/contas-bancarias-FINANCEIRO-ISM";
import Metas from "./pages/cadastros/metas";
import Departamentos from "./pages/cadastros/departamentos";
import RegrasConciliacao from "./pages/cadastros/regras-conciliacao";

// Relatórios
import FechamentoMensal from "./pages/relatorios/fechamento-mensal";
import ContabilFiscal from "./pages/relatorios/contabil-fiscal";
import DreGerencial from "./pages/relatorios/dre-FINANCEIRO-ISM";
import FluxoCaixa from "./pages/relatorios/fluxo-caixa-FINANCEIRO-ISM";
import MetasRelatorio from "./pages/relatorios/metas-relatorio";

// Configurações
import Usuarios from "./pages/configuracoes/usuarios";
import Filiais from "./pages/configuracoes/filiais";
import TokensApi from "./pages/configuracoes/tokens-api";
import Login from "./pages/auth/login";
import PrimeiroAcesso from "./pages/auth/primeiro-acesso";
import DefinirSenha from "./pages/auth/definir-senha";
import {authStorage} from "./lib/api-config";

// ─── QueryClient com tratativa global de erros
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
    // Toast vermelho para qualquer query que falhar (exceto 401 — já tratado no fetchApi)
    queryCache: new QueryCache({
        onError: (error: unknown) => {
            const message = error instanceof Error ? error.message : "Erro na requisição.";
            // Não exibe toast para erros de sessão expirada (já redireciona para /login)
            if (message.toLowerCase().includes("sessão expirada")) return;
            toast.error(message);
        },
    }),
    // Toast vermelho para qualquer mutation que falhar
    mutationCache: new MutationCache({
        onError: (error: unknown) => {
            const message = error instanceof Error ? error.message : "Erro ao salvar.";
            if (message.toLowerCase().includes("sessão expirada")) return;
            toast.error(message);
        },
    }),
});

// ─── Mapa de dependências de cache
//
// IMPORTANTE: os valores aqui são PREFIXOS de queryKey, não chaves exatas.
// Ao invalidar uma chave "gatilho", todas as queries cujo primeiro elemento
// da queryKey COMEÇA COM algum dos prefixos listados também são invalidadas
// (via `predicate`, não por match exato de array).
//
// Isso resolve dois problemas que uma lista de chaves exatas não resolve:
// 1) Uma página pode ter várias queries sob o mesmo "namespace"
//    (ex: dashboard-kpis, dashboard-fluxo, dashboard-projecao-mes, ...).
//    Um prefixo "dashboard" cobre todas de uma vez, hoje e no futuro.
// 2) Queries novas criadas depois (ex: dashboard-nova-metrica) já entram
//    automaticamente na invalidação, sem precisar lembrar de atualizar
//    este mapa toda vez que uma query nova for adicionada.
//
// Regra de nomenclatura que este mapa assume (e que já é seguida no projeto):
// toda queryKey de uma "família" deve começar com o mesmo prefixo textual
// (ex: tudo relacionado ao dashboard começa com "dashboard").
//
// @example
// // Em qualquer mutation de lançamento:
// onSuccess: () => invalidateRelated(queryClient, "lancamentos")
// // → invalida ["lancamentos"] exato + tudo que comece com "dashboard" ou "relatorio" + ["conciliacoes-list"]
const QUERY_DEPENDENCIES: Record<string, string[]> = {
    "lancamentos": ["dashboard", "relatorio", "conciliacoes-list"],
    "kanban-cards": ["dashboard"],
    "conciliacoes-list": ["dashboard", "lancamentos"],
    "plano-contas": ["dashboard", "relatorio", "lancamentos"],
    "parceiros": ["lancamentos"], // combobox de parceiro no modal de lançamento
    "metas": ["dashboard"],
};

/**
 * Função utilitária global para invalidar uma chave de cache e todas as suas dependentes.
 *
 * Invalida:
 * 1. A própria chave, por match exato (["key"] casa com ["key", ...args]).
 * 2. Todas as queries cujo primeiro elemento da queryKey comece com algum
 *    dos prefixos listados em QUERY_DEPENDENCIES[key].
 *
 * @example
 * onSuccess: () => invalidateRelated(queryClient, "lancamentos")
 */
export function invalidateRelated(qc: QueryClient, key: string) {
    // 1. Invalidação exata da própria chave (cobre ["lancamentos", filtros...])
    void qc.invalidateQueries({queryKey: [key]});

    // 2. Invalidação por prefixo de todas as chaves dependentes
    const prefixes = QUERY_DEPENDENCIES[key] ?? [];
    if (prefixes.length === 0) return;

    void qc.invalidateQueries({
        predicate: (query) => {
            const first = query.queryKey[0];
            if (typeof first !== "string") return false;
            return prefixes.some((prefix) => first.startsWith(prefix));
        },
    });
}

// Exportar queryClient para uso externo (ex: kanban.tsx, lancamentos.tsx)
export {queryClient};

// ─── Rota privada
function PrivateRoute({component: Component, path}: { component: any; path: string }) {
    const token = authStorage.getToken();

    if (!token) {
        return <Redirect to="/login"/>;
    }

    return (
        <Route path={path}>
            {(params) => (
                <AppLayout>
                    <Component {...params} />
                </AppLayout>
            )}
        </Route>
    );
}

function Router() {
    return (
        <Switch>
            <Route path="/login" component={Login}/>
            <Route path="/primeiro-acesso" component={PrimeiroAcesso}/>
            <Route path="/definir-senha" component={DefinirSenha}/>
            <PrivateRoute path="/" component={Dashboard}/>

            <PrivateRoute path="/kanban" component={Kanban}/>
            <PrivateRoute path="/lancamentos" component={Lancamentos}/>
            <PrivateRoute path="/conciliacao" component={ConciliacaoList}/>
            <PrivateRoute path="/conciliacao/extrato/:extratoId" component={ConciliacaoExtratoDetalhe}/>

            {/* Cadastros */}
            <PrivateRoute path="/cadastros/parceiros" component={Parceiros}/>
            <PrivateRoute path="/cadastros/plano-contas" component={PlanoContas}/>
            <PrivateRoute path="/cadastros/contas-bancarias" component={ContasBancarias}/>
            <PrivateRoute path="/cadastros/metas" component={Metas}/>
            <PrivateRoute path="/cadastros/departamentos" component={Departamentos}/>
            <PrivateRoute path="/cadastros/regras-conciliacao" component={RegrasConciliacao}/>

            {/* Relatórios */}
            <PrivateRoute path="/relatorios/fechamento-mensal" component={FechamentoMensal}/>
            <PrivateRoute path="/relatorios/contabil-fiscal" component={ContabilFiscal}/>
            <PrivateRoute path="/relatorios/dre" component={DreGerencial}/>
            <PrivateRoute path="/relatorios/fluxo-caixa" component={FluxoCaixa}/>
            <PrivateRoute path="/relatorios/metas" component={MetasRelatorio}/>

            {/* Configurações */}
            <PrivateRoute path="/configuracoes/usuarios" component={Usuarios}/>
            <PrivateRoute path="/configuracoes/filiais" component={Filiais}/>
            <PrivateRoute path="/configuracoes/tokens-api" component={TokensApi}/>

            <Route component={NotFound}/>
        </Switch>
    );
}

// ─── App root
export function App() {
    return (
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <TooltipProvider>
                    <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
                        <Router/>
                    </WouterRouter>
                    <Toaster/>
                </TooltipProvider>
            </QueryClientProvider>
        </ErrorBoundary>
    );
}

export default App;