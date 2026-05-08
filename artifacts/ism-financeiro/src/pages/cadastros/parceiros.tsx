import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Search, Download, Edit2, Trash2, Ban, CheckCircle, X, AlertTriangle } from "lucide-react";

const parceirosData = [
  { id: 1, tipo: "PJ", nome: "Tech Solutions S.A.", documento: "12.345.678/0001-90", lotacao: "Comercial", tiposParceiro: ["Cliente", "Fornecedor"], status: "ativo" },
  { id: 2, tipo: "PF", nome: "João da Silva", documento: "123.456.789-00", lotacao: "Tecnologia", tiposParceiro: ["Funcionário(a)"], status: "ativo" },
  { id: 3, tipo: "PJ", nome: "Amazon Web Services", documento: "98.765.432/0001-10", lotacao: "—", tiposParceiro: ["Fornecedor"], status: "inativo" },
  { id: 4, tipo: "PF", nome: "Maria Oliveira", documento: "987.654.321-11", lotacao: "—", tiposParceiro: ["Sócio(a)"], status: "ativo" },
  { id: 5, tipo: "PJ", nome: "Global Industries", documento: "11.222.333/0001-44", lotacao: "Comercial", tiposParceiro: ["Cliente"], status: "ativo" },
  { id: 6, tipo: "PF", nome: "Carlos Eduardo", documento: "456.789.012-33", lotacao: "Financeiro", tiposParceiro: ["Prestador(a) de Serviços PJ", "Funcionário(a)"], status: "ativo" },
];

const tiposParceiroOptions = ["Cliente", "Fornecedor", "Sócio(a)", "Participante Societário(a)", "Funcionário(a)", "Prestador(a) de Serviços PJ"];
const formaPagamentoOpcoes = ["PIX", "Boleto", "TED", "DOC", "Cheque"];

function mascararDocumento(valor: string, tipo: "PJ" | "PF") {
  const numeros = valor.replace(/\D/g, "");
  if (tipo === "PF") {
    return numeros
      .slice(0, 11)                                
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    return numeros
      .slice(0, 14)                                
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")            
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
}

function mascararTelefone(valor: string) {
  const numeros = valor.replace(/\D/g, "");
  return numeros
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function ConfirmacaoCancelModal({ onConfirm, onDismiss }: { onConfirm: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-warning mx-auto mb-3" />
        <h3 className="font-bold text-white text-lg mb-1">Cancelar cadastro?</h3>
        <p className="text-sm text-muted-foreground mb-5">As informações preenchidas serão perdidas. Deseja realmente cancelar?</p>
        <div className="flex gap-3">
          <button onClick={onDismiss} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Não, continuar</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-xl text-sm font-medium">Sim, cancelar</button>
        </div>
      </div>
    </div>
  );
}

function NovoParceirModal({ onClose }: { onClose: () => void }) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [form, setForm] = useState({
    tipoPessoa: "PJ",
    nomeRazao: "",
    documento: "",
    lotacao: "",
    tiposParceiro: [] as string[],
    formaPagamento: "PIX",
    email: "",
    telefone: "",
    // PIX
    pixTipoRecebedor: "PJ",
    pixChave: "",
    // Boleto/TED
    agencia: "",
    contaTipo: "Corrente",
    contaNumero: "",
    cpfCnpjBancario: "",
  });

  const isDirty = form.nomeRazao !== "" || form.documento !== "";

  const handleCancel = () => {
    if (isDirty) setShowConfirmCancel(true);
    else onClose();
  };

  const toggleTipo = (t: string) => {
    setForm(f => ({
      ...f,
      tiposParceiro: f.tiposParceiro.includes(t) ? f.tiposParceiro.filter(x => x !== t) : [...f.tiposParceiro, t]
    }));
  };

  return (
    <>
      {showConfirmCancel && <ConfirmacaoCancelModal onConfirm={onClose} onDismiss={() => setShowConfirmCancel(false)} />}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-card z-10">
            <h2 className="text-lg font-bold text-white">Novo Cadastro — Clientes/Fornecedores</h2>
            <button onClick={handleCancel} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-6 space-y-5">
            {/* Tipo Pessoa */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Tipo de Pessoa *</label>
              <div className="flex gap-2">
                {["PF", "PJ"].map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, tipoPessoa: t }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${form.tipoPessoa === t ? "bg-primary text-white border-primary" : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"}`}>
                    {t === "PF" ? "Pessoa Física (PF)" : "Pessoa Jurídica (PJ)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {form.tipoPessoa === "PF" ? "Nome Completo *" : "Razão Social / Nome Fantasia *"}
                </label>
                <input value={form.nomeRazao} onChange={e => setForm(f => ({ ...f, nomeRazao: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder={form.tipoPessoa === "PF" ? "Ex: João da Silva" : "Ex: Tech Solutions S.A."} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {form.tipoPessoa === "PF" ? "CPF *" : "CNPJ *"}
                </label>
                <input value={form.documento} onChange={e => setForm(f => ({ ...f, documento: mascararDocumento(e.target.value, f.tipoPessoa as "PF" | "PJ") }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder={form.tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">E-mail</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="email@exemplo.com.br" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Telefone</label>
                <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: mascararTelefone(e.target.value) }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="(11) 99999-0000" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Lotação / Departamento</label>
              <select value={form.lotacao} onChange={e => setForm(f => ({ ...f, lotacao: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-black outline-none focus:border-primary/50 transition-colors">
                <option value="">Selecione...</option>
                <option>Tecnologia</option><option>Financeiro</option><option>Comercial</option><option>Recursos Humanos</option>
              </select>
            </div>

            {/* Tipo de Parceiro */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Tipo de Parceiro *</label>
              <div className="grid grid-cols-2 gap-2">
                {tiposParceiroOptions.map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border border-white/10 hover:border-primary/40 hover:bg-primary/5 transition-all">
                    <input type="checkbox" checked={form.tiposParceiro.includes(t)} onChange={() => toggleTipo(t)} className="accent-primary w-4 h-4" />
                    <span className="text-sm text-white">{t}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Forma de Pagamento */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Forma de Pagamento Preferencial</label>
              <div className="flex gap-2 flex-wrap mb-3">
                {formaPagamentoOpcoes.map(f => (
                  <button key={f} onClick={() => setForm(fm => ({ ...fm, formaPagamento: f }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${form.formaPagamento === f ? "bg-primary text-white border-primary" : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"}`}>
                    {f}
                  </button>
                ))}
              </div>

              {form.formaPagamento === "PIX" && (
                <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tipo do Recebedor</label>
                    <select value={form.pixTipoRecebedor} onChange={e => setForm(f => ({ ...f, pixTipoRecebedor: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-black outline-none">
                      <option value="PF">Pessoa Física</option>
                      <option value="PJ">Pessoa Jurídica</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Chave PIX *</label>
                    <input value={form.pixChave} onChange={e => setForm(f => ({ ...f, pixChave: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
                      placeholder="CPF, CNPJ, e-mail ou telefone" />
                  </div>
                </div>
              )}

              {(form.formaPagamento === "Boleto" || form.formaPagamento === "TED" || form.formaPagamento === "DOC") && (
                <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tipo Recebedor</label>
                    <select value={form.pixTipoRecebedor} onChange={e => setForm(f => ({ ...f, pixTipoRecebedor: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-black outline-none">
                      <option value="PF">Pessoa Física</option>
                      <option value="PJ">Pessoa Jurídica</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{form.pixTipoRecebedor === "PF" ? "CPF *" : "CNPJ *"}</label>
                    <input value={form.cpfCnpjBancario} onChange={e => setForm(f => ({ ...f, cpfCnpjBancario: mascararDocumento(e.target.value, f.pixTipoRecebedor as "PF" | "PJ") }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
                      placeholder={form.pixTipoRecebedor === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Agência *</label>
                    <input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50" placeholder="0000" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tipo de Conta *</label>
                    <select value={form.contaTipo} onChange={e => setForm(f => ({ ...f, contaTipo: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-black outline-none">
                      <option>Corrente</option><option>Poupança</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Número da Conta *</label>
                    <input value={form.contaNumero} onChange={e => setForm(f => ({ ...f, contaNumero: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50" placeholder="00000-0" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 p-6 pt-0 sticky bottom-0 bg-card border-t border-white/5">
            <button onClick={handleCancel} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
            <button onClick={onClose} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/25">Salvar Cadastro</button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Parceiros() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, "ativo" | "inativo">>({});

  const getData = () => parceirosData.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.documento.includes(search)
  );

  const getStatus = (p: typeof parceirosData[0]) => (statuses[p.id] ?? p.status) as "ativo" | "inativo";
  const toggleStatus = (id: number, current: "ativo" | "inativo") => setStatuses(s => ({ ...s, [id]: current === "ativo" ? "inativo" : "ativo" }));

  return (
    <div className="space-y-6">
      {showModal && <NovoParceirModal onClose={() => setShowModal(false)} />}

      <PageHeader
        title="Clientes / Fornecedores"
        description="Cadastro de clientes, fornecedores, funcionários, sócios e parceiros"
        actions={
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Exportar
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4" /> Cadastrar Novo
            </button>
          </div>
        }
      />

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-black/10">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/5 focus-within:border-primary/50 transition-all w-80">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              type="text" placeholder="Buscar por nome ou CPF/CNPJ..."
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground text-white" />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">{getData().length} cadastros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-black/20 text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium w-16 text-center">Tipo</th>
                <th className="px-5 py-3 font-medium">Nome / Razão Social</th>
                <th className="px-5 py-3 font-medium">CPF / CNPJ</th>
                <th className="px-5 py-3 font-medium">Tipo de Parceiro</th>
                <th className="px-5 py-3 font-medium">Lotação</th>
                <th className="px-5 py-3 font-medium text-center">Status</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {getData().map(p => {
                const status = getStatus(p);
                return (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-5 py-4 text-center">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${p.tipo === "PJ" ? "bg-primary/20 text-primary" : "bg-teal-500/20 text-teal-400"}`}>{p.tipo}</span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-white">{p.nome}</td>
                    <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{p.documento}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {p.tiposParceiro.map(t => (
                          <span key={t} className="bg-white/10 text-white text-[10px] px-2 py-0.5 rounded-full border border-white/10">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground text-sm">{p.lotacao}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status === "ativo" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                        {status === "ativo" ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleStatus(p.id, status)}
                          className={`p-1.5 rounded-md transition-colors ${status === "ativo" ? "hover:bg-success/20 text-success" : "hover:bg-destructive/20 text-destructive"}`}
                          title={status === "ativo" ? "Bloquear" : "Ativar"}>
                          {status === "ativo" ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                        <button className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
