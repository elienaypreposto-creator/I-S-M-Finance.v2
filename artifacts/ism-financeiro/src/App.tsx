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

// ─── Mapa de dependências de cache
// Ao invalidar uma chave, todas as chaves listadas também são invalidadas.
// Ex: um novo lançamento deve forçar refetch do dashboard, DRE e fluxo de caixa.
const QUERY_DEPENDENCIES: Record<string, string[]> = {
  "lancamentos":  ["dashboard", "fluxo-caixa", "dre", "conciliacao"],
  "kanban-cards": ["dashboard"],
  "conciliacao":  ["dashboard", "lancamentos"],
  "metas":        ["dashboard"],
};

/**
 * Função utilitária global para invalidar uma chave de cache e todas as suas dependentes.
 *
 * @example
 * // Em qualquer mutation de lançamento:
 * onSuccess: () => invalidateRelated(queryClient, "lancamentos")
 * // → invalida: lancamentos, dashboard, fluxo-caixa, dre, conciliacao
 */
export function invalidateRelated(qc: QueryClient, key: string) {
  const keys = [key, ...(QUERY_DEPENDENCIES[key] ?? [])];
  keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

// Exportar queryClient para uso externo (ex: kanban.tsx, lancamentos.tsx)
export { queryClient };

import { ProtectedRoute } from "./components/auth/protected-route";
import { AuthProvider } from "./contexts/auth-context";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/primeiro-acesso" component={PrimeiroAcesso} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/kanban" component={Kanban} />
      <ProtectedRoute path="/lancamentos" component={Lancamentos} requiredPermission="financeiro:lancamentos:listar" />
      <ProtectedRoute path="/conciliacao" component={ConciliacaoList} requiredPermission="financeiro:conciliacao:acessar" />
      <ProtectedRoute path="/conciliacao/extrato/:extratoId" component={ConciliacaoExtratoDetalhe} requiredPermission="financeiro:conciliacao:acessar" />

      {/* Cadastros */}
      <ProtectedRoute path="/cadastros/parceiros" component={Parceiros} requiredPermission="financeiro:parceiros:listar" />
      <ProtectedRoute path="/cadastros/plano-contas" component={PlanoContas} requiredPermission="configuracoes:plano-contas:listar" />
      <ProtectedRoute path="/cadastros/contas-bancarias" component={ContasBancarias} requiredPermission="configuracoes:contas-bancarias:listar" />
      <ProtectedRoute path="/cadastros/metas" component={Metas} requiredPermission="financeiro:metas:listar" />
      <ProtectedRoute path="/cadastros/categorias" component={PlanoContas} requiredPermission="configuracoes:categorias:listar" />
      <ProtectedRoute path="/cadastros/departamentos" component={Departamentos} requiredPermission="configuracoes:plano-contas:listar" />

      {/* Relatórios */}
      <ProtectedRoute path="/relatorios/fechamento-mensal" component={FechamentoMensal} requiredPermission="financeiro:fechamentos:listar" />
      <ProtectedRoute path="/relatorios/contabil-fiscal" component={ContabilFiscal} requiredPermission="relatorios:financeiro" />
      <ProtectedRoute path="/relatorios/dre" component={DreGerencial} requiredPermission="relatorios:dre" />
      <ProtectedRoute path="/relatorios/fluxo-caixa" component={FluxoCaixa} requiredPermission="relatorios:fluxo-caixa-mensal" />
      <ProtectedRoute path="/relatorios/metas" component={MetasRelatorio} requiredPermission="relatorios:metas" />

      {/* Configurações */}
      <ProtectedRoute path="/configuracoes/usuarios" component={Usuarios} requiredPermission="admin:usuarios:listar" />
      <ProtectedRoute path="/configuracoes/filiais" component={Filiais} requiredPermission="admin:usuarios:listar" />
      <ProtectedRoute path="/configuracoes/tokens-api" component={TokensApi} requiredPermission="admin:tokens-api:listar" />

      <Route component={NotFound} />
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
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
