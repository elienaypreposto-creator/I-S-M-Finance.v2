import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { AppLayout } from "./components/layout/app-layout";
import { ErrorBoundary } from "./components/error-boundary";
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
import PrimeiroAcesso from "./pages/auth/primeiro-acesso";
import { authStorage } from "./lib/api-config";

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

// ─── Rota privada 
function PrivateRoute({ component: Component, path }: { component: any; path: string }) {
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
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/primeiro-acesso" component={PrimeiroAcesso} />
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

// ─── App root 
export function App() {
  return (
    
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
