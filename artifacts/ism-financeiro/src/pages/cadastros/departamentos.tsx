import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Building2, ChevronDown, ChevronRight, Pencil, Trash2, Users, X, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { departamentoFormSchema, type DepartamentoFormValues } from "@/validations/cadastros.schema";

type DepartamentoRow = {
  id: number;
  nome: string;
  created_at: string;
};

const DEPT_COLORS = [
  "#3BA8DC", "#27AE60", "#E67E22", "#8B5CF6",
  "#E74C3C", "#F39C12", "#1ABC9C", "#E91E63",
];

function getColor(id: number): string {
  return DEPT_COLORS[id % DEPT_COLORS.length];
}

// ─── Modal Criar/Editar ────────────────────────────────────────────────────────
interface DeptModalProps {
  onClose: () => void;
  initialData?: DepartamentoRow | null;
  isPending: boolean;
  onSave: (data: DepartamentoFormValues, id?: number) => void;
}

function DeptModal({ onClose, initialData, isPending, onSave }: DeptModalProps) {
  const isEdit = !!initialData;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DepartamentoFormValues>({
    resolver: zodResolver(departamentoFormSchema),
    defaultValues: { nome: initialData?.nome ?? "" },
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? "Editar Departamento" : "Novo Departamento"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((v) => onSave(v, initialData?.id))}
          className="p-6 space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Nome do Departamento *
            </label>
            <input
              {...register("nome")}
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
              placeholder="Ex: Tecnologia"
            />
            {errors.nome && (
              <p className="text-[11px] text-destructive mt-1">{errors.nome.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : isEdit ? (
                "Salvar"
              ) : (
                "Criar"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────────────────
export default function Departamentos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [expanded, setExpanded] = useState<number[]>([]);
  const [editingItem, setEditingItem] = useState<DepartamentoRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [modalKey, setModalKey] = useState(0);

  const { data: departamentos = [], isLoading } = useQuery<DepartamentoRow[]>({
    queryKey: ["departamentos"],
    queryFn: () => fetchApiData<DepartamentoRow[]>("/departamentos"),
  });

  const createMutation = useMutation({
    mutationFn: (payload: DepartamentoFormValues) =>
      fetchApiData<DepartamentoRow>("/departamentos", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: ["departamentos"] });
      toast({ title: "Departamento criado", description: `"${item.nome}" foi cadastrado.` });
      setShowCreate(false);
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Erro ao criar",
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, nome }: { id: number; nome: string }) =>
      fetchApiData<DepartamentoRow>(`/departamentos/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nome }),
      }),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: ["departamentos"] });
      toast({ title: "Departamento atualizado", description: `"${item.nome}" foi salvo.` });
      setEditingItem(null);
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApiData<{ deleted: boolean }>(`/departamentos/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["departamentos"] });
      const nome = departamentos.find((d) => d.id === id)?.nome ?? "";
      toast({
        title: "Departamento removido",
        description: nome ? `"${nome}" foi excluído.` : "Excluído com sucesso.",
      });
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Não foi possível excluir",
        description: e instanceof Error ? e.message : "Verifique se há lançamentos ou parceiros vinculados.",
      });
    },
  });

  const toggle = (id: number) =>
    setExpanded((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const openCreate = () => {
    setEditingItem(null);
    setModalKey((k) => k + 1);
    setShowCreate(true);
  };

  const openEdit = (dept: DepartamentoRow) => {
    setShowCreate(false);
    setEditingItem(dept);
    setModalKey((k) => k + 1);
  };

  const handleSave = (data: DepartamentoFormValues, id?: number) => {
    if (id != null) {
      updateMutation.mutate({ id, nome: data.nome });
    } else {
      createMutation.mutate(data);
    }
  };

  const isSavePending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(showCreate || editingItem) && (
        <DeptModal
          key={modalKey}
          initialData={editingItem}
          onClose={() => {
            setShowCreate(false);
            setEditingItem(null);
          }}
          onSave={handleSave}
          isPending={isSavePending}
        />
      )}

      <PageHeader
        title="Departamentos & Centros de Custo"
        description="Estrutura organizacional e centros de custo da empresa"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
          >
            <Plus className="w-4 h-4" /> Novo Departamento
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Departamentos", value: String(departamentos.length), color: "text-primary" },
          { label: "Centros de Custo", value: "—", color: "text-teal-400" },
          { label: "Orçamento Total", value: "—", color: "text-success" },
          { label: "Colaboradores", value: "—", color: "text-orange-400" },
        ].map((item) => (
          <div key={item.label} className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {departamentos.length === 0 ? (
        <div className="glass-panel rounded-2xl py-16 text-center border-dashed border-2 border-white/10">
          <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm font-medium">
            Nenhum departamento cadastrado ainda.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="text-primary text-sm font-bold hover:underline mt-2 block mx-auto"
          >
            Criar primeiro departamento
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {departamentos.map((dept) => {
            const cor = getColor(dept.id);
            const isExpanded = expanded.includes(dept.id);

            return (
              <div
                key={dept.id}
                className="glass-panel rounded-2xl overflow-hidden border border-white/5"
              >
                {/* ── Cabeçalho do departamento ── */}
                <div className="flex items-center justify-between p-5">
                  <button
                    type="button"
                    onClick={() => toggle(dept.id)}
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${cor}25` }}
                    >
                      <Building2 className="w-5 h-5" style={{ color: cor }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{dept.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(dept)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        confirm(`Excluir departamento "${dept.nome}"?`) &&
                        deleteMutation.mutate(dept.id)
                      }
                      disabled={deleteMutation.isPending}
                      className="p-2 hover:bg-destructive/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Excluir"
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(dept.id)}
                      className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>

                {/* ── Centros de Custo (placeholder para Fase 7) ── */}
                {isExpanded && (
                  <div className="border-t border-white/5">
                    <div className="px-5 py-3 bg-white/[0.03] flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Centros de Custo
                      </p>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Adicionar
                      </button>
                    </div>
                    <div className="px-5 py-6 flex items-center justify-center gap-2 text-muted-foreground/60">
                      <Users className="w-4 h-4" />
                      <span className="text-sm">
                        Centros de custo disponíveis a partir da Fase 7.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
