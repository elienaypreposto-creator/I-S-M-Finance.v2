import {Switch, Route, Router as WouterRouter, Redirect} from "wouter";
import {QueryClientProvider} from "@tanstack/react-query";
import {Toaster} from "@/components/ui/toaster";
import {TooltipProvider} from "@/components/ui/tooltip";
import {AppLayout} from "./components/layout/app-layout";
import {ErrorBoundary} from "./components/error-boundary";
import NotFound from "@/pages/not-found";
import {queryClient, invalidateRelated} from "./lib/query-client";
import {AuthProvider, useAuth} from "./hooks/use-auth";

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

// Relatórios
import FechamentoMensal from "./pages/relatorios/fechamento-mensal";
import ContabilFiscal from "./pages/relatorios/contabil-fiscal";
import DreGerencial from "./pages/relatorios/dre-FINANCEIRO-ISM";
import FluxoCaixa from "./pages/relatorios/fluxo-caixa-FINANCEIRO-ISM";
import MetasRelatorio from "./pages/relatorios/metas-relatorio";
import RelatorioConciliacao from "./pages/relatorios/relatorio-conciliacao";

// Configurações
import Usuarios from "./pages/configuracoes/usuarios";
import Filiais from "./pages/configuracoes/filiais";
import TokensApi from "./pages/configuracoes/tokens-api";
import Login from "./pages/auth/login";
import PrimeiroAcesso from "./pages/auth/primeiro-acesso";
import DefinirSenha from "./pages/auth/definir-senha";
import {authStorage} from "./lib/api-config";
import {PERM} from "./lib/permissoes";
import AdminEmpresas from "./pages/admin/empresas";

export {queryClient, invalidateRelated};

// JWT + permissão opcional
function PrivateRoute({
                          component: Component,
                          path,
                          permission,
                      }: {
    component: any;
    path: string;
    permission?: string;
}) {
    const token = authStorage.getToken();
    const {hasPermission, loading} = useAuth();

    if (!token) {
        return <Redirect to="/login"/>;
    }

    if (loading) {
        return (
            <Route path={path}>
                {() => (
                    <AppLayout>
                        <div className="p-8 text-sm text-muted-foreground">Carregando sessão…</div>
                    </AppLayout>
                )}
            </Route>
        );
    }

    if (permission) {
        if (!hasPermission(permission)) {
            return (
                <Route path={path}>
                    {() => (
                        <AppLayout>
                            <div className="p-8 text-sm text-destructive">
                                Sem permissão para acessar este módulo.
                            </div>
                        </AppLayout>
                    )}
                </Route>
            );
        }
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
            <PrivateRoute path="/conciliacao" component={ConciliacaoList} permission={PERM.CONCILIACAO_ACESSAR}/>
            <PrivateRoute
                path="/conciliacao/extrato/:extratoId"
                component={ConciliacaoExtratoDetalhe}
                permission={PERM.CONCILIACAO_ACESSAR}
            />

            {/* Cadastros */}
            <PrivateRoute path="/cadastros/parceiros" component={Parceiros}/>
            <PrivateRoute path="/cadastros/plano-contas" component={PlanoContas}/>
            <PrivateRoute path="/cadastros/contas-bancarias" component={ContasBancarias}/>
            <PrivateRoute path="/cadastros/metas" component={Metas}/>
            <PrivateRoute path="/cadastros/departamentos" component={Departamentos}/>


            {/* Relatórios */}
            <PrivateRoute path="/relatorios/fechamento-mensal" component={FechamentoMensal}/>
            <PrivateRoute path="/relatorios/contabil-fiscal" component={ContabilFiscal}/>
            <PrivateRoute path="/relatorios/dre" component={DreGerencial}/>
            <PrivateRoute path="/relatorios/fluxo-caixa" component={FluxoCaixa}/>
            <PrivateRoute path="/relatorios/metas" component={MetasRelatorio}/>
            <PrivateRoute
                path="/relatorios/conciliacao"
                component={RelatorioConciliacao}
                permission={PERM.RELATORIOS_CONCILIACAO}
            />

            {/* Configurações */}
            <PrivateRoute path="/configuracoes/usuarios" component={Usuarios}/>
            <PrivateRoute path="/admin/usuarios" component={Usuarios}/>
            <PrivateRoute path="/configuracoes/filiais" component={Filiais}/>
            <PrivateRoute path="/configuracoes/tokens-api" component={TokensApi}/>
            <PrivateRoute path="/admin/empresas" component={AdminEmpresas} permission={PERM.ADMIN_EMPRESAS_LISTAR}/>

            <Route component={NotFound}/>
        </Switch>
    );
}

// ─── App root
export function App() {
    return (
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <TooltipProvider>
                        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
                            <Router/>
                        </WouterRouter>
                        <Toaster/>
                    </TooltipProvider>
                </AuthProvider>
            </QueryClientProvider>
        </ErrorBoundary>
    );
}

export default App;