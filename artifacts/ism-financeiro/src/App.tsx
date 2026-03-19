import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "./components/layout/app-layout";
import NotFound from "@/pages/not-found";

// Pages
import Dashboard from "./pages/dashboard";
import Kanban from "./pages/kanban";
import Lancamentos from "./pages/lancamentos";
import ConciliacaoList from "./pages/conciliacao/index";

// Cadastros
import Parceiros from "./pages/cadastros/parceiros";
import PlanoContas from "./pages/cadastros/plano-contas";
import ContasBancarias from "./pages/cadastros/contas-bancarias";
import Metas from "./pages/cadastros/metas";
import Departamentos from "./pages/cadastros/departamentos";

// Relatórios
import FechamentoMensal from "./pages/relatorios/fechamento-mensal";
import ContabilFiscal from "./pages/relatorios/contabil-fiscal";
import DreGerencial from "./pages/relatorios/dre";
import FluxoCaixa from "./pages/relatorios/fluxo-caixa";
import MetasRelatorio from "./pages/relatorios/metas-relatorio";

// Configurações
import Usuarios from "./pages/configuracoes/usuarios";
import Filiais from "./pages/configuracoes/filiais";
import TokensApi from "./pages/configuracoes/tokens-api";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/kanban" component={Kanban} />
      <Route path="/lancamentos" component={Lancamentos} />
      <Route path="/conciliacao" component={ConciliacaoList} />

      {/* Cadastros */}
      <Route path="/cadastros/parceiros" component={Parceiros} />
      <Route path="/cadastros/plano-contas" component={PlanoContas} />
      <Route path="/cadastros/contas-bancarias" component={ContasBancarias} />
      <Route path="/cadastros/metas" component={Metas} />
      <Route path="/cadastros/categorias" component={PlanoContas} />
      <Route path="/cadastros/departamentos" component={Departamentos} />

      {/* Relatórios */}
      <Route path="/relatorios/fechamento-mensal" component={FechamentoMensal} />
      <Route path="/relatorios/contabil-fiscal" component={ContabilFiscal} />
      <Route path="/relatorios/dre" component={DreGerencial} />
      <Route path="/relatorios/fluxo-caixa" component={FluxoCaixa} />
      <Route path="/relatorios/metas" component={MetasRelatorio} />

      {/* Configurações */}
      <Route path="/configuracoes/usuarios" component={Usuarios} />
      <Route path="/configuracoes/filiais" component={Filiais} />
      <Route path="/configuracoes/tokens-api" component={TokensApi} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppLayout>
            <Router />
          </AppLayout>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
