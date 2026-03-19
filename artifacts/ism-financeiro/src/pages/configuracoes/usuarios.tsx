import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Shield, User, Pencil, Trash2, CheckCircle, XCircle, X } from "lucide-react";

const usuarios = [
  { id: 1, nome: "Carlos Mendes", email: "carlos@ismtecnologia.com.br", cargo: "CFO", perfil: "Admin", status: "ativo", avatar: "CM" },
  { id: 2, nome: "Ana Paula Santos", email: "ana@ismtecnologia.com.br", cargo: "Analista Financeiro", perfil: "Financeiro", status: "ativo", avatar: "AS" },
  { id: 3, nome: "Rodrigo Lima", email: "rodrigo@ismtecnologia.com.br", cargo: "Gestor", perfil: "Gestor", status: "ativo", avatar: "RL" },
  { id: 4, nome: "Fernanda Costa", email: "fernanda@ismtecnologia.com.br", cargo: "Assistente", perfil: "Visualizador", status: "inativo", avatar: "FC" },
];

const perfis = [
  { nome: "Admin", cor: "text-destructive bg-destructive/20", descricao: "Acesso total ao sistema", permissoes: ["dashboard", "lancamentos", "cadastros", "relatorios", "configuracoes", "conciliacao", "kanban"] },
  { nome: "Financeiro", cor: "text-primary bg-primary/20", descricao: "Lançamentos e relatórios", permissoes: ["dashboard", "lancamentos", "relatorios", "conciliacao", "kanban"] },
  { nome: "Gestor", cor: "text-warning bg-warning/20", descricao: "Visualização e aprovações", permissoes: ["dashboard", "lancamentos", "relatorios", "kanban"] },
  { nome: "Visualizador", cor: "text-muted-foreground bg-white/10", descricao: "Apenas leitura", permissoes: ["dashboard", "relatorios"] },
];

const modulos = ["dashboard", "lancamentos", "cadastros", "relatorios", "configuracoes", "conciliacao", "kanban"];

function NovoUsuarioModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ nome: "", email: "", cargo: "", perfil: "Financeiro" });
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Novo Usuário</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {[
            { label: "Nome Completo", key: "nome", placeholder: "Ex: João Silva" },
            { label: "E-mail", key: "email", placeholder: "joao@empresa.com.br" },
            { label: "Cargo", key: "cargo", placeholder: "Ex: Analista Financeiro" },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">{f.label}</label>
              <input value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder={f.placeholder} />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Perfil de Acesso</label>
            <select value={form.perfil} onChange={e => setForm({ ...form, perfil: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors">
              {perfis.map(p => <option key={p.nome} value={p.nome}>{p.nome} — {p.descricao}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Convidar Usuário</button>
        </div>
      </div>
    </div>
  );
}

export default function Usuarios() {
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<"usuarios" | "perfis">("usuarios");

  return (
    <div className="space-y-6">
      {showModal && <NovoUsuarioModal onClose={() => setShowModal(false)} />}

      <PageHeader
        title="Usuários & Permissões"
        description="Gerencie usuários e níveis de acesso ao sistema"
        actions={
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
            <Plus className="w-4 h-4" /> Convidar Usuário
          </button>
        }
      />

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button onClick={() => setTab("usuarios")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "usuarios" ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>Usuários</button>
        <button onClick={() => setTab("perfis")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "perfis" ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>Perfis de Acesso</button>
      </div>

      {tab === "usuarios" && (
        <div className="glass-panel rounded-2xl overflow-hidden">
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
              {usuarios.map(u => {
                const perfil = perfis.find(p => p.nome === u.perfil)!;
                return (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center font-bold text-xs text-primary">
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
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${perfil.cor}`}>
                        {u.perfil}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {u.status === "ativo"
                        ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle className="w-3.5 h-3.5" /> Ativo</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> Inativo</span>
                      }
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 hover:bg-white/10 rounded-lg"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button className="p-1.5 hover:bg-destructive/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "perfis" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {perfis.map(perfil => (
            <div key={perfil.nome} className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl ${perfil.cor} flex items-center justify-center`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-white">{perfil.nome}</p>
                  <p className="text-xs text-muted-foreground">{perfil.descricao}</p>
                </div>
              </div>
              <div className="space-y-2">
                {modulos.map(mod => {
                  const tem = perfil.permissoes.includes(mod);
                  return (
                    <div key={mod} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm capitalize text-muted-foreground">{mod}</span>
                      </div>
                      {tem
                        ? <CheckCircle className="w-4 h-4 text-success" />
                        : <XCircle className="w-4 h-4 text-muted-foreground/30" />
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
