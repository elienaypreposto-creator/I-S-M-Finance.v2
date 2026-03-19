import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Copy, Eye, EyeOff, Trash2, CheckCircle, Clock, X, Code, Key } from "lucide-react";

const tokens = [
  { id: 1, nome: "Power BI Dashboard", descricao: "Integração Power BI - Dashboard Executivo", token: "ism_live_a8f3c2d1e9b4...", criado: "01/10/2024", ultimoUso: "19/03/2026", status: "ativo", permissoes: ["dashboard", "lancamentos", "relatorios"] },
  { id: 2, nome: "ERP Integration", descricao: "Conector sistema ERP Totvs", token: "ism_live_b7e2f1a3c9d8...", criado: "15/09/2024", ultimoUso: "18/03/2026", status: "ativo", permissoes: ["lancamentos", "parceiros"] },
  { id: 3, nome: "BI Antigo", descricao: "Token legado - não utilizar", token: "ism_live_c1d2e3f4a5b6...", criado: "01/01/2024", ultimoUso: "15/08/2024", status: "inativo", permissoes: ["dashboard"] },
];

const endpoints = [
  { method: "GET", path: "/api/v1/kpis", descricao: "KPIs do dashboard principal", parametros: "?periodo=mensal|anual" },
  { method: "GET", path: "/api/v1/fluxo-caixa", descricao: "Dados de fluxo de caixa", parametros: "?ano=2024&mes=1-12" },
  { method: "GET", path: "/api/v1/lancamentos", descricao: "Lista de lançamentos", parametros: "?tipo=cr|cp&status=&page=1" },
  { method: "GET", path: "/api/v1/dre", descricao: "DRE Gerencial consolidado", parametros: "?ano=2024" },
  { method: "GET", path: "/api/v1/parceiros", descricao: "Lista de parceiros/clientes", parametros: "?tipo=cliente|fornecedor" },
  { method: "GET", path: "/api/v1/metas", descricao: "Metas vs realizado", parametros: "?ano=2024" },
];

const methodColors: Record<string, string> = {
  GET: "bg-success/20 text-success",
  POST: "bg-primary/20 text-primary",
  PUT: "bg-warning/20 text-warning",
  DELETE: "bg-destructive/20 text-destructive",
};

function NovoTokenModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ nome: "", descricao: "" });
  const [gerado, setGerado] = useState(false);
  const fakeToken = "ism_live_" + Math.random().toString(36).substring(2, 18);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Gerar Novo Token</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {!gerado ? (
          <>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do Token</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Ex: Power BI Produção" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Descrição</label>
                <input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Para que serve esse token?" />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={() => setGerado(true)} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Gerar Token</button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div className="text-center py-2">
                <CheckCircle className="w-10 h-10 text-success mx-auto mb-2" />
                <p className="font-bold text-white">Token gerado com sucesso!</p>
                <p className="text-xs text-destructive mt-1">Copie agora — não será exibido novamente.</p>
              </div>
              <div className="bg-black/30 rounded-xl p-3 font-mono text-xs text-success break-all border border-success/20">
                {fakeToken}
              </div>
              <button className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-white transition-colors">
                <Copy className="w-4 h-4" /> Copiar Token
              </button>
            </div>
            <div className="p-6 pt-0">
              <button onClick={onClose} className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Concluído</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TokensApi() {
  const [showModal, setShowModal] = useState(false);
  const [showTokens, setShowTokens] = useState<Record<number, boolean>>({});
  const [tab, setTab] = useState<"tokens" | "docs">("tokens");

  return (
    <div className="space-y-6">
      {showModal && <NovoTokenModal onClose={() => setShowModal(false)} />}

      <PageHeader
        title="Tokens de API"
        description="Gerencie tokens de acesso para integrações externas (Power BI, ERPs)"
        actions={
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
            <Plus className="w-4 h-4" /> Gerar Token
          </button>
        }
      />

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button onClick={() => setTab("tokens")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "tokens" ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>
          <Key className="w-3.5 h-3.5 inline mr-1" /> Tokens Ativos
        </button>
        <button onClick={() => setTab("docs")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "docs" ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>
          <Code className="w-3.5 h-3.5 inline mr-1" /> Documentação
        </button>
      </div>

      {tab === "tokens" && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/5 bg-warning/5">
            <p className="text-xs text-warning flex items-center gap-2">
              <span className="font-bold">⚠ Segurança:</span> Tokens concedem acesso de leitura à API. Nunca compartilhe publicamente. Use o header <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono">Authorization: Bearer &lt;token&gt;</code>
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {tokens.map(t => (
              <div key={t.id} className="p-5 hover:bg-white/5 transition-colors group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-white">{t.nome}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-white/10 text-muted-foreground'}`}>
                        {t.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{t.descricao}</p>
                    <div className="flex items-center gap-2 bg-black/30 rounded-xl px-3 py-2 font-mono text-xs">
                      <span className={`flex-1 ${showTokens[t.id] ? 'text-success' : 'text-muted-foreground'}`}>
                        {showTokens[t.id] ? t.token : "ism_live_" + "•".repeat(16)}
                      </span>
                      <button onClick={() => setShowTokens(prev => ({ ...prev, [t.id]: !prev[t.id] }))} className="hover:text-white transition-colors">
                        {showTokens[t.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button className="hover:text-white transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Criado: {t.criado}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Último uso: {t.ultimoUso}</span>
                    </div>
                  </div>
                  <button className="p-2 hover:bg-destructive/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "docs" && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="font-bold text-white mb-2">Autenticação</h3>
            <p className="text-sm text-muted-foreground mb-3">Todas as requisições devem incluir o token no cabeçalho HTTP:</p>
            <div className="bg-black/50 rounded-xl p-4 font-mono text-xs text-success border border-success/10">
              <p className="text-muted-foreground mb-1"># Exemplo de requisição curl:</p>
              <p>curl -H "Authorization: Bearer ism_live_xxx..." \</p>
              <p className="pl-4">https://api.ismtecnologia.com.br/api/v1/kpis</p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="font-bold text-white">Endpoints Disponíveis</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Base URL: <code className="text-primary">https://api.ismtecnologia.com.br</code></p>
            </div>
            <div className="divide-y divide-white/5">
              {endpoints.map((ep, i) => (
                <div key={i} className="flex items-start gap-4 p-4 hover:bg-white/5 transition-colors">
                  <span className={`text-xs font-bold px-2 py-1 rounded font-mono shrink-0 ${methodColors[ep.method]}`}>{ep.method}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-white">{ep.path}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ep.descricao}</p>
                    {ep.parametros && (
                      <p className="text-xs text-primary/70 mt-1 font-mono">{ep.parametros}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
