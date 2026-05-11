import {Switch, Route, Router as WouterRouter, Redirect} from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "./components/layout/app-layout";
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
import { authStorage } from "./lib/api-config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PrivateRoute({ component: Component, path }: { component: any, path: string }) {
    const token = authStorage.getToken();

    if (!token) {
        return <Redirect to="/login" />;
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
    const token = authStorage.getToken();

    return (
        <Switch>
            <Route path="/login" component={Login} />
            <PrivateRoute path="/" component={Dashboard} />

            <PrivateRoute path="/kanban" component={Kanban} />
            <PrivateRoute path="/lancamentos" component={Lancamentos} />
            <PrivateRoute path="/conciliacao" component={ConciliacaoList} />
            <PrivateRoute path="/conciliacao/extrato/:extratoId" component={ConciliacaoExtratoDetalhe} />

            {/* Cadastros */}
            <PrivateRoute path="/cadastros/parceiros" component={Parceiros} />
            <PrivateRoute path="/cadastros/plano-contas" component={PlanoContas} />
            <PrivateRoute path="/cadastros/contas-bancarias" component={ContasBancarias} />
            <PrivateRoute path="/cadastros/metas" component={Metas} />
            <PrivateRoute path="/cadastros/categorias" component={PlanoContas} />
            <PrivateRoute path="/cadastros/departamentos" component={Departamentos} />

            {/* Relatórios */}
            <PrivateRoute path="/relatorios/fechamento-mensal" component={FechamentoMensal} />
            <PrivateRoute path="/relatorios/contabil-fiscal" component={ContabilFiscal} />
            <PrivateRoute path="/relatorios/dre" component={DreGerencial} />
            <PrivateRoute path="/relatorios/fluxo-caixa" component={FluxoCaixa} />
            <PrivateRoute path="/relatorios/metas" component={MetasRelatorio} />

            {/* Configurações */}
            <PrivateRoute path="/configuracoes/usuarios" component={Usuarios} />
            <PrivateRoute path="/configuracoes/filiais" component={Filiais} />
            <PrivateRoute path="/configuracoes/tokens-api" component={TokensApi} />

            <Route component={NotFound} />
        </Switch>
    );
}

export function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
                    {/* Removido o AppLayout fixo daqui e movido para dentro do Router/PrivateRoute */}
                    <Router />
                </WouterRouter>
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    );
}

export default App;