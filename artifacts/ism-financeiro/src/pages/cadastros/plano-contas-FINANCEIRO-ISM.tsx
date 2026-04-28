import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { API_URL, fetchApi } from "@/lib/api-config";

type PlanoConta = {
  id: number;
  tipo: string;
  categoria: string;
  subcategoria: string | null;
  ativo: boolean;
};

// Modal simples para formulário de Conta
function FormModal({ isOpen, onClose, onSubmit, initialData }: any) {
  const [tipo, setTipo] = useState(initialData?.tipo || 'despesa');
  const [categoria, setCategoria] = useState(initialData?.categoria || '');
  const [subcategoria, setSubcategoria] = useState(initialData?.subcategoria || '');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1c23] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-4">{initialData ? 'Editar Categoria' : 'Nova Categoria'}</h2>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ id: initialData?.id, tipo, categoria, subcategoria });
        }} className="space-y-4">
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Tipo</label>
            <select 
              value={tipo} onChange={e => setTipo(e.target.value)}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white outline-none focus:border-primary/50"
            >
              <option value="receita">Receita</option>
              <option value="custo">Custo</option>
              <option value="despesa">Despesa</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Grupo Principal (Categoria)</label>
            <input 
              required
              type="text" value={categoria} onChange={e => setCategoria(e.target.value)}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white outline-none focus:border-primary/50"
              placeholder="Ex: Despesas Administrativas"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Subcategoria (Opcional)</label>
            <input 
              type="text" value={subcategoria} onChange={e => setSubcategoria(e.target.value)}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white outline-none focus:border-primary/50"
              placeholder="Ex: Aluguel"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-colors">Cancelar</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlanoContas() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanoConta | null>(null);

  const { data: contas = [], isLoading } = useQuery<PlanoConta[]>({
    queryKey: ['plano-contas'],
    queryFn: () => fetchApi("/plano-contas")
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      const method = data.id ? 'PUT' : 'POST';
      const path = data.id ? `/plano-contas/${data.id}` : "/plano-contas";
      return fetchApi(path, {
        method,
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plano-contas'] });
      setModalOpen(false);
      setEditingItem(null);
      toast({ title: 'Sucesso', description: 'Categoria salva com sucesso.' });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchApi(`/plano-contas/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plano-contas'] });
      toast({ title: 'Sucesso', description: 'Categoria removida.' });
    }
  });

  const handleCreate = (typeDef?: string) => {
    setEditingItem(typeDef ? { tipo: typeDef } as any : null);
    setModalOpen(true);
  };

  const handleEdit = (item: PlanoConta) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Deseja realmente excluir esta categoria? Ela não estará mais disponível para novos lançamentos.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (data: any) => {
    saveMutation.mutate(data);
  };

  const receitas = contas.filter(c => c.tipo === 'receita');
  const custos = contas.filter(c => c.tipo === 'custo');
  const despesas = contas.filter(c => c.tipo === 'despesa');

  // helper to group by categoria inside a tipo
  const groupByCategoria = (items: PlanoConta[]) => {
    const grouped: Record<string, PlanoConta[]> = {};
    items.forEach(item => {
      if (!grouped[item.categoria]) {
        grouped[item.categoria] = [];
      }
      grouped[item.categoria].push(item);
    });
    return grouped;
  };

  const renderSection = (title: string, tipoCode: string, colorConfig: any, items: PlanoConta[], tipoDef: string) => {
    const grouped = groupByCategoria(items);
    
    return (
      <div className={`glass-panel rounded-2xl overflow-hidden ${colorConfig.border}`}>
        <div className={`${colorConfig.bg} p-4 border-b ${colorConfig.borderHeader} flex justify-between items-center`}>
          <h3 className={`font-bold ${colorConfig.text}`}>{title}</h3>
          <span className={`text-xs ${colorConfig.bgBadge} ${colorConfig.textBadge} px-2 py-1 rounded`}>Grupo {tipoCode}</span>
        </div>
        
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground animate-pulse p-2">Carregando...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 text-center">Nenhuma categoria cadastrada</div>
          ) : (
            Object.entries(grouped).map(([categoria, subcontas]) => (
              <div key={categoria} className="space-y-1">
                 <div className="text-sm font-bold text-white/80 mb-2 pl-2 border-l-2 border-white/20 capitalize">{categoria}</div>
                 {subcontas.map(cat => (
                   <div key={cat.id} className="p-3 bg-white/5 rounded-lg border border-white/5 flex justify-between items-center hover:bg-white/10 transition-colors group">
                     <span className="text-sm font-medium text-white pl-4 capitalize truncate max-w-[200px]">
                       {cat.subcategoria || "—"}
                     </span>
                     <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => handleEdit(cat)} className="text-muted-foreground hover:text-white p-1">
                          <Edit className="w-4 h-4" />
                       </button>
                       <button onClick={() => handleDelete(cat.id)} className="text-muted-foreground hover:text-rose-400 p-1">
                          <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                   </div>
                 ))}
              </div>
            ))
          )}
          
          <button onClick={() => handleCreate(tipoDef)} className="w-full py-2 border-2 border-dashed border-white/10 rounded-lg text-sm text-muted-foreground hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2 mt-4">
            <Plus className="w-4 h-4" /> Adicionar Categoria
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Plano de Contas" 
        description="Estrutura hierárquica de categorias financeiras para receitas, custos e despesas"
        actions={
          <button onClick={() => handleCreate()} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
            <Plus className="w-4 h-4" />
            Nova Categoria
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {renderSection('Receitas (+)', '1.0', {
          border: 'border-teal-500/20', bg: 'bg-teal-500/20', borderHeader: 'border-teal-500/30', text: 'text-teal-400', bgBadge: 'bg-teal-500/20', textBadge: 'text-teal-300'
        }, receitas, 'receita')}
        
        {renderSection('Custos (-)', '2.0', {
          border: 'border-blue-500/20', bg: 'bg-blue-500/20', borderHeader: 'border-blue-500/30', text: 'text-blue-400', bgBadge: 'bg-blue-500/20', textBadge: 'text-blue-300'
        }, custos, 'custo')}
        
        {renderSection('Despesas (-)', '3.0', {
          border: 'border-orange-500/20', bg: 'bg-orange-500/20', borderHeader: 'border-orange-500/30', text: 'text-orange-400', bgBadge: 'bg-orange-500/20', textBadge: 'text-orange-300'
        }, despesas, 'despesa')}
      </div>

      <FormModal 
        isOpen={modalOpen} 
        onClose={() => { setModalOpen(false); setEditingItem(null); }} 
        onSubmit={handleSubmit} 
        initialData={editingItem}
      />
    </div>
  );
}
