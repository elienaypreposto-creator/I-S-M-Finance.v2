import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Building2, ChevronDown, ChevronRight, Pencil, Trash2, Users, X } from "lucide-react";

const departamentosData = [
  {
    id: 1, nome: "Tecnologia", codigo: "TI", cor: "#3BA8DC",
    centrosCusto: [
      { id: 1, nome: "Desenvolvimento de Software", codigo: "TI-01", orcamento: 80000 },
      { id: 2, nome: "Infraestrutura & Cloud", codigo: "TI-02", orcamento: 30000 },
      { id: 3, nome: "Segurança da Informação", codigo: "TI-03", orcamento: 15000 },
    ]
  },
  {
    id: 2, nome: "Financeiro", codigo: "FIN", cor: "#27AE60",
    centrosCusto: [
      { id: 4, nome: "Controladoria", codigo: "FIN-01", orcamento: 25000 },
      { id: 5, nome: "Tesouraria", codigo: "FIN-02", orcamento: 20000 },
    ]
  },
  {
    id: 3, nome: "Comercial", codigo: "COM", cor: "#E67E22",
    centrosCusto: [
      { id: 6, nome: "Vendas Diretas", codigo: "COM-01", orcamento: 40000 },
      { id: 7, nome: "Marketing Digital", codigo: "COM-02", orcamento: 20000 },
    ]
  },
  {
    id: 4, nome: "Recursos Humanos", codigo: "RH", cor: "#8B5CF6",
    centrosCusto: [
      { id: 8, nome: "Recrutamento & Seleção", codigo: "RH-01", orcamento: 10000 },
      { id: 9, nome: "Treinamento & Desenvolvimento", codigo: "RH-02", orcamento: 8000 },
    ]
  },
];

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function Departamentos() {
  const [expanded, setExpanded] = useState<number[]>([1]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nome: "", codigo: "" });

  const toggle = (id: number) => setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-6">
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Novo Departamento</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Ex: Operações" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Código</label>
                <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Ex: OPS" />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Salvar</button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Departamentos & Centros de Custo"
        description="Estrutura organizacional e centros de custo"
        actions={
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
            <Plus className="w-4 h-4" /> Novo Departamento
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Departamentos", value: departamentosData.length, color: "text-primary" },
          { label: "Centros de Custo", value: departamentosData.reduce((a, d) => a + d.centrosCusto.length, 0), color: "text-teal-400" },
          { label: "Orçamento Total", value: formatCurrency(departamentosData.reduce((a, d) => a + d.centrosCusto.reduce((b, c) => b + c.orcamento, 0), 0)), color: "text-success" },
          { label: "Colaboradores", value: "47", color: "text-orange-400" },
        ].map(item => (
          <div key={item.label} className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {departamentosData.map(dept => (
          <div key={dept.id} className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <button onClick={() => toggle(dept.id)} className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: dept.cor + '25' }}>
                  <Building2 className="w-5 h-5" style={{ color: dept.cor }} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-white">{dept.nome}</p>
                  <p className="text-xs text-muted-foreground">Código: {dept.codigo} · {dept.centrosCusto.length} centros de custo</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground hidden sm:block">
                  {formatCurrency(dept.centrosCusto.reduce((a, c) => a + c.orcamento, 0))}
                </span>
                {expanded.includes(dept.id) ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
              </div>
            </button>

            {expanded.includes(dept.id) && (
              <div className="border-t border-white/5">
                <div className="px-5 py-3 bg-white/3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Centros de Custo</p>
                  <button className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                </div>
                <div className="divide-y divide-white/5">
                  {dept.centrosCusto.map(cc => (
                    <div key={cc.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors group">
                      <div className="flex items-center gap-3">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-white">{cc.nome}</p>
                          <p className="text-xs text-muted-foreground">{cc.codigo}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-white hidden sm:block">{formatCurrency(cc.orcamento)}<span className="text-xs text-muted-foreground font-normal">/mês</span></span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button className="p-1.5 hover:bg-destructive/20 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
