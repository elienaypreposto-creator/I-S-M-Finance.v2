import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, MapPin, Building, Pencil, CheckCircle, X, Phone, Mail } from "lucide-react";

const filiais = [
  {
    id: 1, nome: "Matriz — São Paulo", codigo: "SP001", cnpj: "12.345.678/0001-90",
    endereco: "Av. Paulista, 1000, 10º Andar", cidade: "São Paulo", estado: "SP", cep: "01310-100",
    telefone: "(11) 3456-7890", email: "matriz@ismtecnologia.com.br",
    status: "ativo", responsavel: "Carlos Mendes",
  },
  {
    id: 2, nome: "Filial — Rio de Janeiro", codigo: "RJ002", cnpj: "12.345.678/0002-71",
    endereco: "Rua do Ouvidor, 50, Sala 802", cidade: "Rio de Janeiro", estado: "RJ", cep: "20040-030",
    telefone: "(21) 2222-3333", email: "rj@ismtecnologia.com.br",
    status: "ativo", responsavel: "Ana Paula Santos",
  },
  {
    id: 3, nome: "Filial — Belo Horizonte", codigo: "BH003", cnpj: "12.345.678/0003-52",
    endereco: "Av. Getúlio Vargas, 200, Sala 301", cidade: "Belo Horizonte", estado: "MG", cep: "30112-020",
    telefone: "(31) 3333-4444", email: "bh@ismtecnologia.com.br",
    status: "inativo", responsavel: "Rodrigo Lima",
  },
];

function NovaFilialModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ nome: "", cnpj: "", cidade: "", estado: "", email: "" });
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Nova Filial</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome da Filial</label>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Ex: Filial Curitiba" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">CNPJ</label>
            <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">E-mail</label>
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="filial@empresa.com.br" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Cidade</label>
            <input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors" placeholder="Ex: Curitiba" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Estado</label>
            <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors">
              <option value="">Selecione...</option>
              {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium">Salvar Filial</button>
        </div>
      </div>
    </div>
  );
}

export default function Filiais() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-6">
      {showModal && <NovaFilialModal onClose={() => setShowModal(false)} />}

      <PageHeader
        title="Filiais"
        description="Gerencie as filiais e unidades da empresa"
        actions={
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
            <Plus className="w-4 h-4" /> Nova Filial
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Filiais", value: filiais.length, color: "text-primary" },
          { label: "Ativas", value: filiais.filter(f => f.status === "ativo").length, color: "text-success" },
          { label: "Inativas", value: filiais.filter(f => f.status === "inativo").length, color: "text-muted-foreground" },
        ].map(item => (
          <div key={item.label} className="glass-panel rounded-2xl p-4 text-center">
            <p className={`text-3xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {filiais.map(filial => (
          <div key={filial.id} className="glass-panel rounded-2xl p-5 hover:border-white/20 border border-white/5 transition-all group">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <Building className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-white">{filial.nome}</h3>
                    <span className="text-xs text-muted-foreground font-mono bg-white/5 px-2 py-0.5 rounded">{filial.codigo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${filial.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-white/10 text-muted-foreground'}`}>
                      <CheckCircle className="w-2.5 h-2.5" /> {filial.status === 'ativo' ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">CNPJ: {filial.cnpj}</p>
                  <div className="flex flex-wrap gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{filial.endereco} — {filial.cidade}/{filial.estado}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{filial.telefone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="w-3.5 h-3.5" />
                      <span>{filial.email}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Responsável: <span className="text-white">{filial.responsavel}</span></p>
                </div>
              </div>
              <button className="p-2 hover:bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
