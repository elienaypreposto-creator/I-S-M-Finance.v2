import {tenantQueryKey} from "@/lib/tenant-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Building2, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { BotaoEditar, BotaoExcluir } from "@/components/shared/botoes-acao";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { acharNomeDuplicado, limparNome, ordenarPorNome } from "@/lib/nomes";
import { departamentoFormSchema, type DepartamentoFormValues } from "@/validations/cadastros.schema";
import { CardsSkeleton } from "@/components/shared/table-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { DISCARD_PROMPT } from "@/hooks/use-escape-close";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalForm,
  ModalHeader,
  ModalSpinner,
  modalBtnPrimaryCls,
  modalBtnSecondaryCls,
  modalGridCls,
} from "@/components/ui/modal-responsivo";
import { CampoBusca, contemBusca, useParametrosUrl } from "@/components/shared/filtros";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

type DepartamentoRow = {
  id: number;
  nome: string;
  created_at: string;
};

type CentroCustoRow = {
  id: number;
  nome: string;
  departamento_id: number | null;
};

const DEPT_COLORS = [
  "#3BA8DC", "#27AE60", "#E67E22", "#8B5CF6",
  "#E74C3C", "#F39C12", "#1ABC9C", "#E91E63",
];

function getColor(id: number): string {
  return DEPT_COLORS[id % DEPT_COLORS.length];
}

/** Listas que mostram centros de custo (este cadastro, filtro e modal de lançamentos). */
const CHAVES_CENTROS = ["centros-custos", "centros-custos-filtro", "centros-custo-modal"] as const;

// ─── Modal Criar/Editar (departamento ou centro de custo: só o nome) ───────────
interface NomeModalProps {
  onClose: () => void;
  initialNome?: string | null;
  isPending: boolean;
  onSave: (data: DepartamentoFormValues) => void;
  titulo: string;
  rotulo: string;
  placeholder: string;
  campoId: string;
  subtitulo?: string;
}

function NomeModal({
  onClose,
  initialNome,
  isPending,
  onSave,
  titulo,
  rotulo,
  placeholder,
  campoId,
  subtitulo,
}: NomeModalProps) {
  const isEdit = initialNome != null;
  const { confirm, ConfirmDialogProps } = useConfirm();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<DepartamentoFormValues>({
    resolver: zodResolver(departamentoFormSchema),
    defaultValues: { nome: initialNome ?? "" },
  });

  async function handleRequestClose() {
    if (isDirty) {
      const ok = await confirm(DISCARD_PROMPT);
      if (!ok) return;
    }
    onClose();
  }

  return (
    <Modal onClose={() => void handleRequestClose()}>
      <ModalHeader title={titulo} description={subtitulo} />
      <ModalForm onSubmit={handleSubmit(onSave)}>
        <ModalBody>
          <div className={modalGridCls}>
            <div>
              <label htmlFor={campoId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                {rotulo} *
              </label>
              <input
                id={campoId}
                {...register("nome")}
                aria-invalid={!!errors.nome}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                placeholder={placeholder}
              />
              {errors.nome && (
                <p className="text-xs text-destructive mt-1">{errors.nome.message}</p>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter hint="* Campos obrigatórios · Esc fecha">
          <button type="button" onClick={() => void handleRequestClose()} className={modalBtnSecondaryCls}>
            Cancelar
          </button>
          <button type="submit" disabled={isPending} className={modalBtnPrimaryCls}>
            {isPending ? <ModalSpinner /> : isEdit ? "Salvar" : "Criar"}
          </button>
        </ModalFooter>
      </ModalForm>
      <ConfirmDialog {...ConfirmDialogProps} />
    </Modal>
  );
}

/** Estado do modal: departamento (novo/edição) ou centro de custo (novo/edição) de um departamento. */
type ModalAberto =
  | { tipo: "departamento"; item: DepartamentoRow | null }
  | { tipo: "centro"; departamento: DepartamentoRow; item: CentroCustoRow | null };

// ─── Página ────────────────────────────────────────────────────────────────────
export default function Departamentos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, ConfirmDialogProps } = useConfirm();

  const [expanded, setExpanded] = useState<number[]>([]);
  const [modal, setModal] = useState<ModalAberto | null>(null);
  const [modalKey, setModalKey] = useState(0);

  const { data: departamentos = [], isLoading } = useQuery<DepartamentoRow[]>({
    queryKey: tenantQueryKey("departamentos"),
    queryFn: () => fetchApiData<DepartamentoRow[]>("/departamentos"),
  });

  const { data: centros = [], isLoading: carregandoCentros } = useQuery<CentroCustoRow[]>({
    queryKey: tenantQueryKey("centros-custos"),
    queryFn: () => fetchApiData<CentroCustoRow[]>("/centros-custos"),
  });

  const centrosPorDepartamento = useMemo(() => {
    const mapa = new Map<number, CentroCustoRow[]>();
    for (const c of ordenarPorNome(centros)) {
      if (c.departamento_id == null) continue;
      const lista = mapa.get(c.departamento_id) ?? [];
      lista.push(c);
      mapa.set(c.departamento_id, lista);
    }
    return mapa;
  }, [centros]);

  const erroToast = (titulo: string) => (e: unknown) => {
    toast({
      variant: "destructive",
      title: titulo,
      description: e instanceof Error ? e.message : String(e),
    });
  };

  const fecharModal = () => setModal(null);

  const invalidarCentros = () => {
    for (const chave of CHAVES_CENTROS) {
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey(chave) });
    }
  };

  // ── Departamentos ──
  const createMutation = useMutation({
    mutationFn: (payload: DepartamentoFormValues) =>
      fetchApiData<DepartamentoRow>("/departamentos", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey("departamentos") });
      toast({ title: "Departamento criado", description: `"${item.nome}" foi cadastrado.` });
      fecharModal();
    },
    onError: erroToast("Erro ao criar"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, nome }: { id: number; nome: string }) =>
      fetchApiData<DepartamentoRow>(`/departamentos/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nome }),
      }),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey("departamentos") });
      toast({ title: "Departamento atualizado", description: `"${item.nome}" foi salvo.` });
      fecharModal();
    },
    onError: erroToast("Erro ao atualizar"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApiData<{ deleted: boolean }>(`/departamentos/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey("departamentos") });
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

  // ── Centros de custo ──
  const createCentroMutation = useMutation({
    mutationFn: (payload: { nome: string; departamento_id: number }) =>
      fetchApiData<CentroCustoRow>("/centros-custos", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (item) => {
      invalidarCentros();
      toast({ title: "Centro de custo criado", description: `"${item.nome}" foi cadastrado.` });
      fecharModal();
    },
    onError: erroToast("Erro ao criar centro de custo"),
  });

  const updateCentroMutation = useMutation({
    mutationFn: ({ id, nome }: { id: number; nome: string }) =>
      fetchApiData<CentroCustoRow>(`/centros-custos/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nome }),
      }),
    onSuccess: (item) => {
      invalidarCentros();
      toast({ title: "Centro de custo atualizado", description: `"${item.nome}" foi salvo.` });
      fecharModal();
    },
    onError: erroToast("Erro ao atualizar centro de custo"),
  });

  const deleteCentroMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApiData<{ deleted: boolean }>(`/centros-custos/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      invalidarCentros();
      const nome = centros.find((c) => c.id === id)?.nome ?? "";
      toast({
        title: "Centro de custo removido",
        description: nome ? `"${nome}" foi excluído.` : "Excluído com sucesso.",
      });
    },
    onError: erroToast("Não foi possível excluir"),
  });

  // ── Busca por nome na URL (?q=), aplicada no navegador ──
  const { ler, atualizar } = useParametrosUrl();
  const busca = ler("q");
  const departamentosFiltrados = useMemo(
    () => departamentos.filter((d) => contemBusca(busca, d.nome)),
    [departamentos, busca],
  );
  const anuncio = isLoading || !busca
    ? ""
    : `${departamentosFiltrados.length} ${departamentosFiltrados.length === 1 ? "departamento encontrado" : "departamentos encontrados"}`;

  const toggle = (id: number) =>
    setExpanded((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const abrirModal = (novo: ModalAberto) => {
    setModalKey((k) => k + 1);
    setModal(novo);
  };

  const avisarDuplicado = (titulo: string, descricao: string) =>
    toast({ variant: "destructive", title: titulo, description: descricao });

  const handleSave = (data: DepartamentoFormValues) => {
    if (!modal) return;
    const nome = limparNome(data.nome);

    if (modal.tipo === "departamento") {
      // Duplicata sem diferenciar caixa/acento/espaços; o próprio registro não conta.
      const duplicado = acharNomeDuplicado(departamentos, nome, modal.item?.id);
      if (duplicado) {
        avisarDuplicado("Departamento duplicado", `Já existe um departamento chamado "${duplicado.nome}".`);
        return;
      }
      if (modal.item) updateMutation.mutate({ id: modal.item.id, nome });
      else createMutation.mutate({ nome });
      return;
    }

    const irmaos = centrosPorDepartamento.get(modal.departamento.id) ?? [];
    const duplicado = acharNomeDuplicado(irmaos, nome, modal.item?.id);
    if (duplicado) {
      avisarDuplicado(
        "Centro de custo duplicado",
        `Já existe o centro de custo "${duplicado.nome}" em ${modal.departamento.nome}.`,
      );
      return;
    }
    if (modal.item) updateCentroMutation.mutate({ id: modal.item.id, nome });
    else createCentroMutation.mutate({ nome, departamento_id: modal.departamento.id });
  };

  const handleDelete = async (dept: DepartamentoRow) => {
    const ok = await confirm({
      title: `Excluir "${dept.nome}"?`,
      description: "Departamentos com lançamentos, parceiros ou centros de custo vinculados não podem ser removidos.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (ok) deleteMutation.mutate(dept.id);
  };

  const handleDeleteCentro = async (centro: CentroCustoRow) => {
    const ok = await confirm({
      title: `Excluir o centro de custo "${centro.nome}"?`,
      description: "Centros de custo com lançamentos, parceiros ou regras de conciliação vinculados não podem ser removidos.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (ok) deleteCentroMutation.mutate(centro.id);
  };

  const isSavePending =
    createMutation.isPending ||
    updateMutation.isPending ||
    createCentroMutation.isPending ||
    updateCentroMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Dialog de confirmação */}
      <ConfirmDialog {...ConfirmDialogProps} />

      {modal?.tipo === "departamento" && (
        <NomeModal
          key={modalKey}
          initialNome={modal.item?.nome ?? null}
          titulo={modal.item ? "Editar Departamento" : "Novo Departamento"}
          rotulo="Nome do Departamento"
          placeholder="Ex: Tecnologia"
          campoId="departamento-nome"
          onClose={fecharModal}
          onSave={handleSave}
          isPending={isSavePending}
        />
      )}

      {modal?.tipo === "centro" && (
        <NomeModal
          key={modalKey}
          initialNome={modal.item?.nome ?? null}
          titulo={modal.item ? "Editar Centro de Custo" : "Novo Centro de Custo"}
          subtitulo={`Departamento: ${modal.departamento.nome}`}
          rotulo="Nome do Centro de Custo"
          placeholder="Ex: Projeto Alpha"
          campoId="centro-custo-nome"
          onClose={fecharModal}
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
            onClick={() => abrirModal({ tipo: "departamento", item: null })}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
          >
            <Plus className="w-4 h-4" /> Novo Departamento
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Departamentos", value: String(departamentos.length), color: "text-primary" },
          {
            label: "Centros de Custo",
            value: carregandoCentros ? "-" : String(centros.length),
            color: "text-teal-400",
          },
          { label: "Orçamento Total", value: "-", color: "text-success" },
          { label: "Colaboradores", value: "-", color: "text-orange-400" },
        ].map((item) => (
          <div key={item.label} className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Busca à direita (sem painel de filtros) */}
      {!isLoading && departamentos.length > 0 && (
        <div className="glass-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-end gap-3 bg-black/10">
          <CampoBusca
            valor={busca}
            onBuscar={(termo) => atualizar({ q: termo || null })}
            placeholder="Buscar por nome…"
            rotulo="Buscar departamentos por nome"
          />
        </div>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{anuncio}</p>

      {/* Loading - skeleton de cards */}
      {isLoading && <CardsSkeleton cards={4} />}

      {/* Empty state */}
      {!isLoading && departamentos.length === 0 && (
        <div className="glass-panel rounded-2xl border border-white/5">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2 className="text-muted-foreground/40" />
              </EmptyMedia>
              <EmptyTitle className="text-white">Nenhum departamento cadastrado</EmptyTitle>
              <EmptyDescription>
                Crie departamentos para organizar sua estrutura e classificar lançamentos.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <button
                type="button"
                onClick={() => abrirModal({ tipo: "departamento", item: null })}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
              >
                <Plus className="w-4 h-4" /> Novo Departamento
              </button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      {/* Busca sem resultado */}
      {!isLoading && departamentos.length > 0 && departamentosFiltrados.length === 0 && (
        <div className="glass-panel rounded-2xl border border-white/5">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2 className="text-muted-foreground/40" />
              </EmptyMedia>
              <EmptyTitle className="text-white">Nenhum resultado para a busca.</EmptyTitle>
              <EmptyDescription>
                Nenhum departamento com nome contendo &ldquo;{busca}&rdquo;.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}

      {/* Lista */}
      {!isLoading && departamentosFiltrados.length > 0 && (
        <div className="space-y-3">
          {departamentosFiltrados.map((dept) => {
            const cor = getColor(dept.id);
            const isExpanded = expanded.includes(dept.id);
            const centrosDept = centrosPorDepartamento.get(dept.id) ?? [];
            const qtdCentros = centrosDept.length;

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
                    aria-expanded={isExpanded}
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
                        {qtdCentros === 0
                          ? "Sem centros de custo"
                          : `${qtdCentros} ${qtdCentros === 1 ? "centro de custo" : "centros de custo"}`}
                        {" · "}
                        {isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <BotaoEditar onClick={() => abrirModal({ tipo: "departamento", item: dept })} />
                    <BotaoExcluir
                      onClick={() => handleDelete(dept)}
                      disabled={deleteMutation.isPending}
                    />
                    <button
                      type="button"
                      onClick={() => toggle(dept.id)}
                      aria-label={isExpanded ? "Ocultar centros de custo" : "Ver centros de custo"}
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

                {/* ── Centros de custo do departamento ── */}
                {isExpanded && (
                  <div className="border-t border-white/5">
                    <div className="px-5 py-3 bg-white/[0.03] flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Centros de Custo
                      </p>
                      <button
                        type="button"
                        onClick={() => abrirModal({ tipo: "centro", departamento: dept, item: null })}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Adicionar
                      </button>
                    </div>
                    {carregandoCentros ? (
                      <div className="px-5 py-6 text-sm text-muted-foreground animate-pulse">Carregando...</div>
                    ) : centrosDept.length === 0 ? (
                      <div className="px-5 py-6 flex items-center justify-center gap-2 text-muted-foreground/60">
                        <Layers className="w-4 h-4" />
                        <span className="text-sm">Nenhum centro de custo neste departamento.</span>
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/5">
                        {centrosDept.map((centro) => (
                          <li key={centro.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-sm text-white truncate">{centro.nome}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <BotaoEditar
                                title="Editar centro de custo"
                                onClick={() => abrirModal({ tipo: "centro", departamento: dept, item: centro })}
                              />
                              <BotaoExcluir
                                title="Excluir centro de custo"
                                onClick={() => handleDeleteCentro(centro)}
                                disabled={deleteCentroMutation.isPending}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
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
