import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Shield, Pencil, Trash2, CheckCircle, XCircle, X, ChevronDown, ChevronRight, Search } from "lucide-react";

const permissoesGranulares = [
  { grupo: "Dashboard & Relatórios", itens: ["Dashboard", "Demonstrativo de Resultado", "Fluxo de Caixa Diário", "Fluxo de Caixa Mensal", "Relatório Econômico", "Relatório Financeiro", "Relatório por Vencimento", "Extrato Financeiro", "Análise de Metas"] },
  { grupo: "Contas a Pagar", itens: ["Cadastro de Contas a Pagar", "Consulta de Contas a Pagar", "Baixa de Contas a Pagar", "Cancelamento de Contas a Pagar", "Importar CR e CP"] },
  { grupo: "Contas a Receber", itens: ["Cadastro de Contas a Receber", "Consulta de Contas a Receber", "Baixa de Contas a Receber", "Cancelamento de Contas a Receber", "Exportar Contas a Receber"] },
  { grupo: "Conciliação Bancária", itens: ["Conciliação Bancária", "Conciliação Bancária - Conciliar Transações", "Conciliação Bancária - Importar Arquivo"] },
  { grupo: "Cadastro de Contas", itens: ["Cadastro de Contas", "Consulta de Contas", "Exclusão de Contas"] },
  { grupo: "Cadastro de Pessoas", itens: ["Cadastro de Pessoa", "Consulta de Pessoa", "Exclusão de Pessoa"] },
  { grupo: "Plano de Contas", itens: ["Cadastro de Plano de Contas", "Consulta de Plano de Contas", "Exclusão de Plano de Contas", "Exportar Plano de Contas", "Cadastro de Categoria do Plano de Contas", "Consulta de Categoria do Plano de Contas", "Exclusão de Categoria do Plano de Contas"] },
  { grupo: "Metas & Fechamentos", itens: ["Cadastro de Metas", "Consulta de Metas", "Exclusão de Metas", "Cadastro de Fechamentos Financeiros", "Consulta de Fechamentos Financeiros", "Exclusão de Fechamentos Financeiros"] },
  { grupo: "Movimentações", itens: ["Cadastro de Movimentação Financeira", "Consulta de Movimentação Financeira", "Exclusão de Movimentação Financeira"] },
  { grupo: "Configurações do Sistema", itens: ["Cadastro de Usuários", "Consulta de Usuários", "Exclusão de Usuários", "Cadastro de Token de API", "Consulta de Tokens de API", "Exclusão de Token de API", "Cadastro de Tags", "Consulta de Tags", "Exclusão de Tags", "Cadastro de Tipo de Documento", "Consulta de Tipo de Documento", "Exclusão de Tipo de Documento"] },
];

const todasPermissoes = permissoesGranulares.flatMap(g => g.itens);

const perfis = {
  Admin: todasPermissoes,
  Financeiro: [
    "Dashboard", "Extrato Financeiro", "Fluxo de Caixa Mensal", "Demonstrativo de Resultado",
    "Cadastro de Contas a Pagar", "Consulta de Contas a Pagar", "Baixa de Contas a Pagar",
    "Cadastro de Contas a Receber", "Consulta de Contas a Receber", "Baixa de Contas a Receber",
    "Conciliação Bancária", "Conciliação Bancária - Conciliar Transações", "Conciliação Bancária - Importar Arquivo",
    "Consulta de Contas", "Consulta de Pessoa", "Consulta de Plano de Contas",
    "Cadastro de Movimentação Financeira", "Consulta de Movimentação Financeira",
    "Cadastro de Metas", "Consulta de Metas",
  ],
  Gestor: [
    "Dashboard", "Demonstrativo de Resultado", "Fluxo de Caixa Mensal", "Análise de Metas",
    "Consulta de Contas a Pagar", "Consulta de Contas a Receber",
    "Consulta de Contas", "Consulta de Pessoa", "Consulta de Plano de Contas",
    "Consulta de Movimentação Financeira", "Consulta de Metas",
  ],
  Visualizador: ["Dashboard", "Consulta de Contas a Pagar", "Consulta de Contas a Receber", "Consulta de Metas"],
};

const usuarios = [
  { id: 1, nome: "Carlos Mendes", email: "carlos@ismtecnologia.com.br", cargo: "CFO", perfil: "Admin", status: "ativo", avatar: "CM" },
  { id: 2, nome: "Ana Paula Santos", email: "ana@ismtecnologia.com.br", cargo: "Analista Financeiro", perfil: "Financeiro", status: "ativo", avatar: "AS" },
  { id: 3, nome: "Rodrigo Lima", email: "rodrigo@ismtecnologia.com.br", cargo: "Gestor", perfil: "Gestor", status: "ativo", avatar: "RL" },
  { id: 4, nome: "Fernanda Costa", email: "fernanda@ismtecnologia.com.br", cargo: "Assistente", perfil: "Visualizador", status: "inativo", avatar: "FC" },
];

const perfilCores: Record<string, string> = {
  Admin: "text-destructive bg-destructive/20",
  Financeiro: "text-primary bg-primary/20",
  Gestor: "text-warning bg-warning/20",
  Visualizador: "text-muted-foreground bg-white/10",
};

function PermissoesModal({ usuario, onClose }: { usuario: typeof usuarios[0]; onClose: () => void }) {
  const [selecionadas, setSelecionadas] = useState<string[]>([...(perfis[usuario.perfil as keyof typeof perfis] ?? [])]);
  const [expandidos, setExpandidos] = useState<string[]>([permissoesGranulares[0].grupo]);
  const [busca, setBusca] = useState("");

  const toggle = (p: string) => setSelecionadas(s => s.includes(p) ? s.filter(x => x !== p) : [...s, p]);
  const toggleGrupo = (grupo: string) => setExpandidos(e => e.includes(grupo) ? e.filter(x => x !== grupo) : [...e, grupo]);
  const toggleTodosGrupo = (grupo: string, itens: string[]) => {
    const todos = itens.every(i => selecionadas.includes(i));
    setSelecionadas(s => todos ? s.filter(x => !itens.includes(x)) : [...new Set([...s, ...itens])]);
  };

  const filtered = busca
    ? permissoesGranulares.map(g => ({ ...g, itens: g.itens.filter(i => i.toLowerCase().includes(busca.toLowerCase())) })).filter(g => g.itens.length > 0)
    : permissoesGranulares;

  return (
    // ✅ items-center em todos os tamanhos — modal sempre centralizado
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/5">
          <div>
            <h3 className="font-bold text-white text-sm sm:text-base">Permissões — {usuario.nome}</h3>
            <p className="text-xs text-muted-foreground">{selecionadas.length} de {todasPermissoes.length} permissões ativas</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-4 border-b border-white/5">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar permissão..."
              className="bg-transparent outline-none text-sm text-white placeholder:text-muted-foreground w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1">
          {filtered.map(grupo => (
            <div key={grupo.grupo} className="border border-white/5 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleGrupo(grupo.grupo)}
                className="w-full flex items-center justify-between px-3 sm:px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2 sm:gap-3 text-left">
                  <input
                    type="checkbox"
                    className="accent-primary w-4 h-4 shrink-0"
                    checked={grupo.itens.every(i => selecionadas.includes(i))}
                    onChange={() => toggleTodosGrupo(grupo.grupo, grupo.itens)}
                    onClick={e => e.stopPropagation()}
                  />
                  <span className="font-semibold text-white text-xs sm:text-sm">{grupo.grupo}</span>
                  <span className="text-xs text-muted-foreground">
                    {grupo.itens.filter(i => selecionadas.includes(i)).length}/{grupo.itens.length}
                  </span>
                </div>
                {expandidos.includes(grupo.grupo)
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
              {expandidos.includes(grupo.grupo) && (
                <div className="divide-y divide-white/5">
                  {grupo.itens.map(item => (
                    <label key={item} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 cursor-pointer hover:bg-white/5 transition-colors">
                      <input
                        type="checkbox"
                        className="accent-primary w-4 h-4 shrink-0"
                        checked={selecionadas.includes(item)}
                        onChange={() => toggle(item)}
                      />
                      <span className="text-xs sm:text-sm text-muted-foreground flex-1">{item}</span>
                      {selecionadas.includes(item) && <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 p-4 sm:p-5 border-t border-white/5">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Salvar Permissões</button>
        </div>
      </div>
    </div>
  );
}

function NovoUsuarioModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ nome: "", email: "", cargo: "", perfil: "Financeiro" });
  return (
    //  modal  centralizado
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/5">
          <h2 className="text-base sm:text-lg font-bold text-white">Novo Usuário</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          {[
            { label: "Nome Completo", key: "nome", placeholder: "Ex: João Silva" },
            { label: "E-mail", key: "email", placeholder: "joao@empresa.com.br" },
            { label: "Cargo", key: "cargo", placeholder: "Ex: Analista Financeiro" },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">{f.label}</label>
              <input
                value={(form as any)[f.key]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                placeholder={f.placeholder}
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Perfil Base</label>
            <select
              value={form.perfil}
              onChange={e => setForm({ ...form, perfil: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-black outline-none focus:border-primary/50 transition-colors"
            >
              <option>Admin</option>
              <option>Financeiro</option>
              <option>Gestor</option>
              <option>Visualizador</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-4 sm:p-6 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Convidar Usuário</button>
        </div>
      </div>
    </div>
  );
}

export default function Usuarios() {
  const [showModal, setShowModal] = useState(false);
  const [permissoesUsuario, setPermissoesUsuario] = useState<typeof usuarios[0] | null>(null);
  const [tab, setTab] = useState<"usuarios" | "perfis">("usuarios");

  return (
    <div className="space-y-4 sm:space-y-6">
      {showModal && <NovoUsuarioModal onClose={() => setShowModal(false)} />}
      {permissoesUsuario && <PermissoesModal usuario={permissoesUsuario} onClose={() => setPermissoesUsuario(null)} />}

      <PageHeader
        title="Usuários & Permissões"
        description="Gerencie usuários e níveis de acesso ao sistema"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline">Convidar Usuário</span>
            <span className="xs:hidden">Convidar</span>
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-full sm:w-fit">
        <button
          onClick={() => setTab("usuarios")}
          className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "usuarios" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}
        >
          Usuários
        </button>
        <button
          onClick={() => setTab("perfis")}
          className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "perfis" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}
        >
          Perfis de Acesso
        </button>
      </div>

      {tab === "usuarios" && (
        <>
          {/* Tabela Desktop */}
          <div className="glass-panel rounded-2xl overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Usuário</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Cargo</th>
                  <th className="px-5 py-3 text-center font-medium text-muted-foreground">Perfil</th>
                  <th className="px-5 py-3 text-center font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {usuarios.map(u => (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-linear-to-br from-primary/40 to-primary/20 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                          {u.avatar}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{u.nome}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{u.cargo}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${perfilCores[u.perfil]}`}>{u.perfil}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {u.status === "ativo"
                        ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle className="w-3.5 h-3.5" /> Ativo</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> Inativo</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="px-2 py-1.5 hover:bg-primary/10 rounded-lg text-xs text-primary font-medium transition-colors"
                          onClick={() => setPermissoesUsuario(u)}
                        >
                          <Shield className="w-3.5 h-3.5 inline mr-1" />Permissões
                        </button>
                        <button className="p-1.5 hover:bg-white/10 rounded-lg"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button className="p-1.5 hover:bg-destructive/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards Mobile */}
          <div className="space-y-3 md:hidden">
            {usuarios.map(u => (
              <div key={u.id} className="glass-panel rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                    {u.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white text-sm truncate">{u.nome}</p>
                      {u.status === "ativo"
                        ? <span className="inline-flex items-center gap-1 text-xs text-success shrink-0"><CheckCircle className="w-3 h-3" /> Ativo</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0"><XCircle className="w-3 h-3" /> Inativo</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">{u.cargo}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${perfilCores[u.perfil]}`}>{u.perfil}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 hover:bg-primary/10 rounded-lg text-xs text-primary font-medium transition-colors"
                    onClick={() => setPermissoesUsuario(u)}
                  >
                    <Shield className="w-3.5 h-3.5" /> Permissões
                  </button>
                  <button className="p-2 hover:bg-white/10 rounded-lg"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button className="p-2 hover:bg-destructive/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "perfis" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(perfis).map(([nome, perms]) => (
            <div key={nome} className="glass-panel rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl ${perfilCores[nome]} flex items-center justify-center shrink-0`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-white">{nome}</p>
                  <p className="text-xs text-muted-foreground">{perms.length} permissões ativas</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {perms.slice(0, 12).map(p => (
                  <span key={p} className="text-[10px] bg-white/5 border border-white/10 text-muted-foreground px-2 py-0.5 rounded">
                    {p}
                  </span>
                ))}
                {perms.length > 12 && (
                  <span className="text-[10px] text-primary">+{perms.length - 12} mais</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
