import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Building2, ChevronDown, ChevronRight, Pencil, Trash2, Users, X } from "lucide-react";

const CORES_DISPONIVEIS = ["#3BA8DC", "#27AE60", "#E67E22", "#8B5CF6", "#E74C3C", "#1ABC9C", "#F39C12", "#E91E63"];

const departamentosInicial = [
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

function applyCurrencyMask(raw: string): string {
  // Remove tudo que não for dígito
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  // Divide por 100 para obter centavos
  const value = parseInt(digits, 10) / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parseMaskedCurrency(masked: string): number {
  const digits = masked.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

type CentroCusto = { id: number; nome: string; codigo: string; orcamento: number };
type Departamento = { id: number; nome: string; codigo: string; cor: string; centrosCusto: CentroCusto[] };

const FORM_DEPT_INICIAL = { nome: "", codigo: "", cor: CORES_DISPONIVEIS[0] };
const FORM_CC_INICIAL = { nome: "", codigo: "", orcamento: "" };

export default function Departamentos() {
  const [departamentos, setDepartamentos] = useState<Departamento[]>(departamentosInicial);
  const [expanded, setExpanded] = useState<number[]>([1]);

  // Modal Departamento
  const [showModalDept, setShowModalDept] = useState(false);
  const [editandoDeptId, setEditandoDeptId] = useState<number | null>(null);
  const [formDept, setFormDept] = useState(FORM_DEPT_INICIAL);
  const [erroDept, setErroDept] = useState("");

  // Modal Centro de Custo
  const [showModalCC, setShowModalCC] = useState(false);
  const [deptAlvoId, setDeptAlvoId] = useState<number | null>(null);
  const [editandoCCId, setEditandoCCId] = useState<number | null>(null);
  const [formCC, setFormCC] = useState(FORM_CC_INICIAL);
  const [erroCC, setErroCC] = useState("");

  const toggle = (id: number) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── Abrir modal Departamento (novo ou edição) ────────────────
  const handleAbrirDept = (dept?: Departamento) => {
    if (dept) {
      setEditandoDeptId(dept.id);
      setFormDept({ nome: dept.nome, codigo: dept.codigo, cor: dept.cor });
    } else {
      setEditandoDeptId(null);
      setFormDept(FORM_DEPT_INICIAL);
    }
    setErroDept("");
    setShowModalDept(true);
  };

  // ── Salvar Departamento ──────────────────────────────────────
  const handleSalvarDept = () => {
    if (!formDept.nome.trim() || !formDept.codigo.trim()) {
      setErroDept("Preencha nome e código.");
      return;
    }
    if (editandoDeptId !== null) {
      // Edição
      setDepartamentos(prev =>
        prev.map(d =>
          d.id === editandoDeptId
            ? { ...d, nome: formDept.nome.trim(), codigo: formDept.codigo.trim().toUpperCase(), cor: formDept.cor }
            : d
        )
      );
    } else {
      // Novo
      const novoDept: Departamento = {
        id: Date.now(),
        nome: formDept.nome.trim(),
        codigo: formDept.codigo.trim().toUpperCase(),
        cor: formDept.cor,
        centrosCusto: [],
      };
      setDepartamentos(prev => [...prev, novoDept]);
      setExpanded(prev => [...prev, novoDept.id]);
    }
    setFormDept(FORM_DEPT_INICIAL);
    setErroDept("");
    setEditandoDeptId(null);
    setShowModalDept(false);
  };

  const handleFecharDept = () => {
    setFormDept(FORM_DEPT_INICIAL);
    setErroDept("");
    setEditandoDeptId(null);
    setShowModalDept(false);
  };

  // ── Excluir Departamento ─────────────────────────────────────
  const handleExcluirDept = (id: number) => {
    setDepartamentos(prev => prev.filter(d => d.id !== id));
    setExpanded(prev => prev.filter(x => x !== id));
  };

  // ── Abrir modal de Centro de Custo (novo ou edição) ─────────
  const handleAbrirCC = (deptId: number, cc?: CentroCusto) => {
    setDeptAlvoId(deptId);
    if (cc) {
      setEditandoCCId(cc.id);
      setFormCC({ nome: cc.nome, codigo: cc.codigo, orcamento: applyCurrencyMask(String(cc.orcamento * 100)) });
    } else {
      setEditandoCCId(null);
      setFormCC(FORM_CC_INICIAL);
    }
    setErroCC("");
    setShowModalCC(true);
  };

  // ── Salvar Centro de Custo ───────────────────────────────────
  const handleSalvarCC = () => {
    if (!formCC.nome.trim() || !formCC.codigo.trim()) {
      setErroCC("Preencha nome e código.");
      return;
    }
    const orcamento = parseMaskedCurrency(formCC.orcamento);
    if (editandoCCId !== null) {
      // Edição
      setDepartamentos(prev =>
        prev.map(d =>
          d.id === deptAlvoId
            ? {
                ...d,
                centrosCusto: d.centrosCusto.map(c =>
                  c.id === editandoCCId
                    ? { ...c, nome: formCC.nome.trim(), codigo: formCC.codigo.trim().toUpperCase(), orcamento }
                    : c
                ),
              }
            : d
        )
      );
    } else {
      // Novo
      const novoCC: CentroCusto = {
        id: Date.now(),
        nome: formCC.nome.trim(),
        codigo: formCC.codigo.trim().toUpperCase(),
        orcamento,
      };
      setDepartamentos(prev =>
        prev.map(d =>
          d.id === deptAlvoId
            ? { ...d, centrosCusto: [...d.centrosCusto, novoCC] }
            : d
        )
      );
    }
    setEditandoCCId(null);
    setShowModalCC(false);
  };

  const handleFecharCC = () => {
    setFormCC(FORM_CC_INICIAL);
    setErroCC("");
    setEditandoCCId(null);
    setShowModalCC(false);
  };

  // ── Excluir Centro de Custo ──────────────────────────────────
  const handleExcluirCC = (deptId: number, ccId: number) => {
    setDepartamentos(prev =>
      prev.map(d =>
        d.id === deptId
          ? { ...d, centrosCusto: d.centrosCusto.filter(c => c.id !== ccId) }
          : d
      )
    );
  };

  const totalOrcamento = departamentos.reduce(
    (a, d) => a + d.centrosCusto.reduce((b, c) => b + c.orcamento, 0), 0
  );
  const totalCC = departamentos.reduce((a, d) => a + d.centrosCusto.length, 0);

  return (
    <div className="space-y-6">

      {/* ── Modal Novo Departamento ── */}
      {showModalDept && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">{editandoDeptId ? "Editar Departamento" : "Novo Departamento"}</h2>
              <button onClick={handleFecharDept} className="p-1.5 hover:bg-white/5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome</label>
                <input
                  value={formDept.nome}
                  onChange={e => setFormDept({ ...formDept, nome: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="Ex: Operações"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Código</label>
                <input
                  value={formDept.codigo}
                  onChange={e => setFormDept({ ...formDept, codigo: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="Ex: OPS"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {CORES_DISPONIVEIS.map(cor => (
                    <button
                      key={cor}
                      onClick={() => setFormDept({ ...formDept, cor })}
                      className="w-7 h-7 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: cor,
                        borderColor: formDept.cor === cor ? "#fff" : "transparent",
                        transform: formDept.cor === cor ? "scale(1.2)" : "scale(1)",
                      }}
                    />
                  ))}
                </div>
              </div>
              {erroDept && <p className="text-xs text-destructive">{erroDept}</p>}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={handleFecharDept} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">
                Cancelar
              </button>
              <button onClick={handleSalvarDept} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Novo Centro de Custo ── */}
      {showModalCC && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">{editandoCCId ? "Editar Centro de Custo" : "Novo Centro de Custo"}</h2>
              <button onClick={handleFecharCC} className="p-1.5 hover:bg-white/5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome</label>
                <input
                  value={formCC.nome}
                  onChange={e => setFormCC({ ...formCC, nome: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="Ex: Suporte ao Cliente"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Código</label>
                <input
                  value={formCC.codigo}
                  onChange={e => setFormCC({ ...formCC, codigo: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="Ex: OPS-01"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Orçamento Mensal (R$)</label>
                <input
                  value={formCC.orcamento}
                  onChange={e => setFormCC({ ...formCC, orcamento: applyCurrencyMask(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="R$ 0,00"
                  inputMode="numeric"
                />
              </div>
              {erroCC && <p className="text-xs text-destructive">{erroCC}</p>}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={handleFecharCC} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">
                Cancelar
              </button>
              <button onClick={handleSalvarCC} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Departamentos & Centros de Custo"
        description="Estrutura organizacional e centros de custo"
        actions={
          <button
            onClick={() => handleAbrirDept()}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
          >
            <Plus className="w-4 h-4" /> Novo Departamento
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Departamentos", value: departamentos.length, color: "text-primary" },
          { label: "Centros de Custo", value: totalCC, color: "text-teal-400" },
          { label: "Orçamento Total", value: formatCurrency(totalOrcamento), color: "text-success" },
          { label: "Colaboradores", value: "47", color: "text-orange-400" },
        ].map(item => (
          <div key={item.label} className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {departamentos.map(dept => (
          <div key={dept.id} className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <button onClick={() => toggle(dept.id)} className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: dept.cor + "25" }}>
                  <Building2 className="w-5 h-5" style={{ color: dept.cor }} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-white">{dept.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Código: {dept.codigo} · {dept.centrosCusto.length} centros de custo
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground hidden sm:block">
                  {formatCurrency(dept.centrosCusto.reduce((a, c) => a + c.orcamento, 0))}
                </span>
                {/* Botão editar departamento */}
                <button
                  onClick={e => { e.stopPropagation(); handleAbrirDept(dept); }}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  title="Editar departamento"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
                {/* Botão excluir departamento */}
                <button
                  onClick={e => { e.stopPropagation(); handleExcluirDept(dept.id); }}
                  className="p-1.5 hover:bg-destructive/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="Excluir departamento"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
                {expanded.includes(dept.id)
                  ? <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  : <ChevronRight className="w-5 h-5 text-muted-foreground" />
                }
              </div>
            </button>

            {expanded.includes(dept.id) && (
              <div className="border-t border-white/5">
                <div className="px-5 py-3 bg-white/3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Centros de Custo</p>
                  <button
                    onClick={() => handleAbrirCC(dept.id)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                </div>
                <div className="divide-y divide-white/5">
                  {dept.centrosCusto.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum centro de custo cadastrado.</p>
                  )}
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
                        <span className="text-sm font-semibold text-white hidden sm:block">
                          {formatCurrency(cc.orcamento)}
                          <span className="text-xs text-muted-foreground font-normal">/mês</span>
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleAbrirCC(dept.id, cc)}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleExcluirCC(dept.id, cc.id)}
                            className="p-1.5 hover:bg-destructive/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
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
