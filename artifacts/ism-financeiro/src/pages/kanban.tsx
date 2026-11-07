import {tenantQueryKey} from "@/lib/tenant-query";
import {useState, useMemo} from "react";
import {createPortal} from "react-dom";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {
    DndContext, DragOverlay,
    PointerSensor, TouchSensor, useSensor, useSensors,
    DragStartEvent, DragEndEvent,
    pointerWithin, rectIntersection,
    MeasuringStrategy,
    type CollisionDetection,
    type Announcements,
    type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {useDraggable, useDroppable} from "@dnd-kit/core";
import type {QueryClient, QueryKey} from "@tanstack/react-query";
import {Plus, Loader2} from "lucide-react";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";
import {
    CampoBusca,
    contemBusca,
    FiltrosAtivos,
    FiltrosPopover,
    useFiltrosNaUrl,
    type DefinicaoFiltro,
} from "@/components/shared/filtros";
import {BotaoEditar, BotaoExcluir} from "@/components/shared/botoes-acao";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {TaskCard} from "@/components/tasks/task-card";
import {TaskModal} from "@/components/tasks/task-modal";
import {SectionErrorFallback} from "@/components/error-boundary";
import {fetchApiData} from "@/lib/api-config";
import {toast} from "sonner";
import {invalidateRelated} from "@/App";
import {useConfirm} from "@/hooks/use-confirm";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const COLORS = {
    fundoPrincipal: "#121212",
    colunas: "#1A1A1A",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ChecklistItem = { id: string; texto: string; completed: boolean };

type Card = {
    id: number;
    titulo: string;
    descricao: string | null;
    coluna: string;
    responsavel_id: number | null;
    responsavel_nome: string | null;
    responsaveis_multiplos: number[] | null;
    departamentos: string[] | null;
    tags: string[] | null;
    checklist: ChecklistItem[] | null;
    comentarios_count: number;
    anexos_count: number;
    prazo: string | null;
    prioridade: string;
    created_at: string;
    responsaveis?: { id: number; nome: string; avatar?: string }[];
};

// ─── Constantes ───────────────────────────────────────────────────────────────
const COLUMNS = [
    {id: "solicitado", title: "Solicitado", color: "bg-slate-500"},
    {id: "em_analise", title: "Em Análise", color: "bg-blue-500"},
    {id: "em_execucao", title: "Em Execução", color: "bg-orange-500"},
    {id: "aguardando_aprovacao", title: "Aguardando", color: "bg-purple-500"},
    {id: "concluido", title: "Concluído", color: "bg-emerald-500"},
];

// Prefixo para ids de coluna no DnD - evita colisão com ids numéricos de cards
const COL_PREFIX = "col::";

// Filtros que a API de cards aceita (GET /kanban/cards?prioridade=&responsavel_id=&prazo=).
const PRIORIDADE_OPCOES = [
    {valor: "urgente", rotulo: "Urgente"},
    {valor: "alta", rotulo: "Alta"},
    {valor: "media", rotulo: "Média"},
    {valor: "baixa", rotulo: "Baixa"},
];

const PRAZO_OPCOES = [
    {valor: "atrasado", rotulo: "Atrasado"},
    {valor: "hoje", rotulo: "Vencendo hoje"},
    {valor: "proximos", rotulo: "Próximos 7 dias"},
];

type UsuarioKanban = { id: number; nome: string };

// Campos aceitos pelo backend no PATCH - qualquer campo extra causa 400
const PATCH_FIELDS = [
    "titulo", "descricao", "prioridade", "coluna",
    "prazo", "departamentos", "checklist", "tags",
] as const;
type PatchField = (typeof PATCH_FIELDS)[number];

// Sanitiza payload para o PATCH:
// - remove campos fora de PATCH_FIELDS
// - converte prazo: "" -> null (backend usa z.string().min(1) ou null)
function sanitizePatch(data: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
        PATCH_FIELDS
            .filter(k => k in data && data[k] !== undefined)
            .map(k => [k, k === "prazo" && data[k] === "" ? null : data[k]])
    );
}

// ─── Cache otimista ───────────────────────────────────────────────────────────
// A lista fica em [empresaId, "kanban-cards", filtros]. O optimistic update
// precisa casar por prefixo (todas as listas da empresa atual): escrever em
// ["kanban-cards"] criava uma entrada órfã, o cartão voltava para a coluna de
// origem até o refetch e os vizinhos mudavam de lugar no meio do próximo arrasto.
type SnapshotCards = [QueryKey, Card[] | undefined][];

async function atualizarCardsNoCache(
    queryClient: QueryClient,
    atualizar: (cards: Card[]) => Card[],
): Promise<SnapshotCards> {
    const filtro = {queryKey: tenantQueryKey("kanban-cards")};
    await queryClient.cancelQueries(filtro);
    const snapshot = queryClient.getQueriesData<Card[]>(filtro);
    queryClient.setQueriesData<Card[]>(filtro, (old) => (old ? atualizar(old) : old));
    return snapshot;
}

function restaurarCardsNoCache(queryClient: QueryClient, snapshot: SnapshotCards | undefined) {
    snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
}

// Só as colunas são alvo de soltura e quem decide é o ponteiro (pointerWithin);
// rectIntersection fica de reserva para o vão entre colunas. Antes os cartões
// também eram alvos e o retângulo do overlay escolhia o alvo — perto da borda
// caía no cartão/coluna vizinho.
const deteccaoColuna: CollisionDetection = (args) => {
    const sobPonteiro = pointerWithin(args);
    return sobPonteiro.length > 0 ? sobPonteiro : rectIntersection(args);
};

// Textos do leitor de tela do dnd-kit (o padrão é em inglês).
const tituloColuna = (id: string | number | undefined) =>
    COLUMNS.find(c => `${COL_PREFIX}${c.id}` === String(id))?.title ?? "coluna";

const ACESSIBILIDADE_DND: {announcements: Announcements; screenReaderInstructions: ScreenReaderInstructions} = {
    screenReaderInstructions: {
        draggable: "Para mover a tarefa entre colunas, arraste o cartão com o mouse ou o dedo. Clique no cartão para abrir.",
    },
    announcements: {
        onDragStart: () => "Tarefa pega para mover.",
        onDragOver: ({over}) =>
            over ? `Sobre a coluna ${tituloColuna(over.id)}.` : "Fora das colunas.",
        onDragEnd: ({over}) =>
            over ? `Tarefa solta na coluna ${tituloColuna(over.id)}.` : "Tarefa solta fora das colunas; nada mudou.",
        onDragCancel: () => "Movimento cancelado.",
    },
};

// ─── DraggableCard ────────────────────────────────────────────────────────────
// Arrastável simples (sem sortable): a ordem dentro da coluna não é persistida,
// então o sortable só deslocava os cartões vizinhos durante o arrasto e os
// devolvia no fim — parecia que o arrasto tinha pegado o cartão do lado.
function DraggableCard({
                          card,
                          onView,
                          onEdit,
                          onDelete,
                          isDragging,
                          canArrastar,
                          canEditar,
                          canExcluir,
                      }: {
    card: Card;
    onView: (card: Card) => void;
    onEdit: (card: Card) => void;
    onDelete: (card: Card) => void;
    isDragging: boolean;
    canArrastar: boolean;
    canEditar: boolean;
    canExcluir: boolean;
}) {
    const {attributes, listeners, setNodeRef} = useDraggable({
        id: card.id,
        // Cartão otimista (id negativo) ainda não existe no servidor.
        disabled: !canArrastar || card.id < 0,
    });

    return (
        <div
            ref={setNodeRef}
            style={{touchAction: "pan-y"}}
            {...attributes}
            {...listeners}
            aria-roledescription="cartão arrastável"
            // O original vira um marcador esmaecido; quem segue o ponteiro é o DragOverlay.
            className={cn("rounded-xl transition-opacity", isDragging && "opacity-40")}
            onClick={(e) => {
                // Se o clique originou de dentro do menu, não abre o modal de visualização
                if ((e.target as HTMLElement).closest("[data-card-menu]")) return;
                onView(card);
            }}
        >
            <TaskCard
                {...card}
                onClick={undefined}
                menuSlot={
                    (canEditar || canExcluir) ? (
                    <div data-card-menu className="flex items-center gap-2" onPointerDown={e => e.stopPropagation()}>
                        {canEditar && (
                        <BotaoEditar
                            onClick={e => {
                                e.stopPropagation();
                                onEdit(card);
                            }}
                        />
                        )}
                        {canExcluir && (
                        <BotaoExcluir
                            title={`Excluir tarefa "${card.titulo}"`}
                            onClick={e => {
                                e.stopPropagation();
                                onDelete(card);
                            }}
                        />
                        )}
                    </div>
                    ) : null
                }
            />
        </div>
    );
}

// ─── DroppableColumn ──────────────────────────────────────────────────────────
function DroppableColumn({id, children}: { id: string; children: React.ReactNode }) {
    const {setNodeRef, isOver} = useDroppable({id: `${COL_PREFIX}${id}`});
    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar transition-colors min-h-[120px]",
                isOver && "bg-white/5"
            )}
        >
            {children}
        </div>
    );
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────
function KanbanColumn({
                          column, cards, onAddCard, onView, onEdit, onDelete, activeId, canCriar, canEditar, canExcluir,
                      }: {
    column: typeof COLUMNS[0];
    cards: Card[];
    onAddCard: (coluna: string) => void;
    onView: (card: Card) => void;
    onEdit: (card: Card) => void;
    onDelete: (card: Card) => void;
    activeId: number | null;
    canCriar: boolean;
    canEditar: boolean;
    canExcluir: boolean;
}) {
    return (
        <div
            className="flex-1 min-w-[280px] flex flex-col h-full max-h-full rounded-xl overflow-hidden border border-white/10"
            style={{backgroundColor: COLORS.colunas}}
        >
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#1A1A1A]">
                <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", column.color)}/>
                    <h3 className="font-semibold text-sm text-white">{column.title}</h3>
                    <span className="bg-white/10 text-white text-xs py-0.5 px-2 rounded-full">{cards.length}</span>
                </div>
                {canCriar && (
                <button
                    onClick={() => onAddCard(column.id)}
                    className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                >
                    <Plus className="w-4 h-4"/>
                </button>
                )}
            </div>

            <DroppableColumn id={column.id}>
                {cards.map(card => (
                    <DraggableCard
                        key={card.id}
                        card={card}
                        onView={onView}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        isDragging={activeId === card.id}
                        canArrastar={canEditar}
                        canEditar={canEditar}
                        canExcluir={canExcluir}
                    />
                ))}

                {cards.length === 0 && (
                    <div
                        className="h-24 flex items-center justify-center border-2 border-dashed border-white/10 rounded-xl text-xs text-gray-500">
                        Arraste itens para cá
                    </div>
                )}
            </DroppableColumn>
        </div>
    );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────
export default function Kanban() {
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"create" | "edit">("create");
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [modalColuna, setModalColuna] = useState("solicitado");
    const [activeId, setActiveId] = useState<number | null>(null);
    const {user, hasPermission} = useAuth();
    const {confirm, ConfirmDialogProps} = useConfirm();
    const canCriar = hasPermission(PERM.KANBAN_CRIAR);
    const canEditar = hasPermission(PERM.KANBAN_EDITAR);
    const canExcluir = hasPermission(PERM.KANBAN_EXCLUIR);

    const {data: usuarios = []} = useQuery({
        queryKey: tenantQueryKey("kanban-usuarios-filtro"),
        queryFn: () => fetchApiData<UsuarioKanban[]>("/kanban/usuarios"),
        staleTime: 60_000,
    });

    const definicoes: DefinicaoFiltro[] = useMemo(() => {
        // "Minha Equipe" = tarefas atribuídas ao usuário logado (não há cadastro de equipe).
        const eu = user ? [{valor: String(user.id), rotulo: `Minha equipe (eu, ${user.nome})`}] : [];
        const outros = usuarios
            .filter((u) => u.id !== user?.id)
            .map((u) => ({valor: String(u.id), rotulo: u.nome}));
        return [
            {chave: "prioridade", rotulo: "Prioridade", tipo: "select", placeholder: "Todas", opcoes: PRIORIDADE_OPCOES},
            {chave: "responsavel_id", rotulo: "Responsável", tipo: "select", placeholder: "Todos", opcoes: [...eu, ...outros]},
            {chave: "prazo", rotulo: "Prazo", tipo: "select", placeholder: "Qualquer prazo", opcoes: PRAZO_OPCOES},
        ];
    }, [usuarios, user]);
    const filtros = useFiltrosNaUrl(definicoes);
    const search = filtros.ler("q");
    const paramsCards = new URLSearchParams(filtros.valores).toString();

    const queryClient = useQueryClient();

    const {data: cardsData, isLoading, isError, error, refetch} = useQuery<Card[]>({
        queryKey: tenantQueryKey("kanban-cards", paramsCards),
        queryFn: () => fetchApiData<Card[]>(`/kanban/cards${paramsCards ? `?${paramsCards}` : ""}`),
    });

    // ── Criar ─────────────────────────────────────────────────────────────────
    const createMutation = useMutation({
        mutationFn: (data: Partial<Card>) =>
            fetchApiData<Card>("/kanban/cards", {method: "POST", body: JSON.stringify(data)}),
        onMutate: async (newCard) => {
            const tempCard: Card = {
                id: -(Date.now()),
                titulo: newCard.titulo ?? "Nova tarefa",
                descricao: newCard.descricao ?? null,
                coluna: newCard.coluna ?? "solicitado",
                responsavel_id: null,
                responsavel_nome: null,
                responsaveis_multiplos: null,
                departamentos: newCard.departamentos ?? null,
                tags: newCard.tags ?? null,
                checklist: newCard.checklist ?? null,
                comentarios_count: 0,
                anexos_count: 0,
                prazo: newCard.prazo ?? null,
                prioridade: newCard.prioridade ?? "normal",
                created_at: new Date().toISOString(),
            };
            const snapshot = await atualizarCardsNoCache(queryClient, (old) => [...old, tempCard]);
            return {snapshot};
        },
        onError: (_err, _data, ctx) => {
            restaurarCardsNoCache(queryClient, ctx?.snapshot);
            toast.error("Erro ao criar tarefa.");
        },
        onSuccess: () => toast.success("Tarefa criada!"),
        onSettled: () => invalidateRelated(queryClient, "kanban-cards"),
    });

    // ── Editar (optimistic) ───────────────────────────────────────────────────
    const updateMutation = useMutation({
        mutationFn: ({id, payload}: { id: number; payload: Record<string, any> }) =>
            fetchApiData<Card>(`/kanban/cards/${id}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
            }),
        onMutate: async ({id, payload}) => {
            const snapshot = await atualizarCardsNoCache(queryClient, (old) =>
                old.map(c => c.id === id ? {...c, ...payload} : c)
            );
            return {snapshot};
        },
        onError: (_err, _vars, ctx) => {
            restaurarCardsNoCache(queryClient, ctx?.snapshot);
            toast.error("Erro ao atualizar tarefa. Alteração desfeita.");
        },
        onSuccess: () => toast.success("Tarefa atualizada!"),
        onSettled: () => invalidateRelated(queryClient, "kanban-cards"),
    });

    // ── Excluir (optimistic) ──────────────────────────────────────────────────
    const deleteMutation = useMutation({
        mutationFn: (id: number) =>
            fetchApiData(`/kanban/cards/${id}`, {method: "DELETE"}),
        onMutate: async (id) => {
            const snapshot = await atualizarCardsNoCache(queryClient, (old) => old.filter(c => c.id !== id));
            return {snapshot};
        },
        onError: (_err, _id, ctx) => {
            restaurarCardsNoCache(queryClient, ctx?.snapshot);
            toast.error("Erro ao excluir. Operação desfeita.");
        },
        onSuccess: () => toast.success("Tarefa excluída."),
        onSettled: () => invalidateRelated(queryClient, "kanban-cards"),
    });

    // ── Mover entre colunas (optimistic) ─────────────────────────────────────
    const moveMutation = useMutation({
        mutationFn: ({id, coluna}: { id: number; coluna: string }) =>
            fetchApiData(`/kanban/cards/${id}`, {method: "PATCH", body: JSON.stringify({coluna})}),
        onMutate: async ({id, coluna}) => {
            const snapshot = await atualizarCardsNoCache(queryClient, (old) =>
                old.map(c => c.id === id ? {...c, coluna} : c)
            );
            return {snapshot};
        },
        onError: (_err, _vars, ctx) => {
            restaurarCardsNoCache(queryClient, ctx?.snapshot);
            toast.error("Erro ao mover tarefa. Alteração desfeita.");
        },
        onSettled: () => invalidateRelated(queryClient, "kanban-cards"),
    });

    // ── Sensores ──────────────────────────────────────────────────────────────
    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 8}}),
        useSensor(TouchSensor, {activationConstraint: {delay: 200, tolerance: 8}})
    );

    // ── Filtros ───────────────────────────────────────────────────────────────
    const filteredCards = useMemo(() => {
        // Prioridade, responsável e prazo já vêm filtrados da API; a busca é local.
        const result = cardsData ?? [];
        if (!search) return result;
        return result.filter(c => contemBusca(search, c.titulo, c.descricao));
    }, [cardsData, search]);

    // ── Drag ──────────────────────────────────────────────────────────────────
    const handleDragStart = ({active}: DragStartEvent) => setActiveId(active.id as number);

    const handleDragEnd = ({active, over}: DragEndEvent) => {
        setActiveId(null);
        if (!canEditar || !over) return;

        const allCards = cardsData ?? [];
        const draggedCard = allCards.find(c => c.id === active.id);
        if (!draggedCard) return;

        if (draggedCard.id < 0) {
            toast.info("Aguarde a tarefa ser salva antes de movê-la.");
            return;
        }

        // Só colunas são droppable (ids "col::<coluna>").
        const overId = String(over.id);
        if (!overId.startsWith(COL_PREFIX)) return;
        const targetColuna = overId.slice(COL_PREFIX.length);

        if (draggedCard.coluna !== targetColuna) {
            moveMutation.mutate({id: draggedCard.id, coluna: targetColuna});
        }
    };

    // ── Handlers modais ───────────────────────────────────────────────────────
    const handleAddCard = (coluna: string) => {
        setSelectedCard(null);
        setModalColuna(coluna);
        setModalMode("create");
        setModalOpen(true);
    };

    const handleViewCard = (card: Card) => {
        setSelectedCard(card);
        setModalColuna(card.coluna);
        setModalMode("edit");
        setModalOpen(true);
    };

    const handleEditCard = (card: Card) => {
        setSelectedCard(card);
        setModalColuna(card.coluna);
        setModalMode("edit");
        setModalOpen(true);
    };

    const handleDeleteCard = async (card: Card) => {
        const itensChecklist = card.checklist?.length ?? 0;
        const ok = await confirm({
            title: `Excluir a tarefa "${card.titulo}"?`,
            description: itensChecklist > 1
                ? `A tarefa e os ${itensChecklist} itens do checklist serão apagados. Essa ação não pode ser desfeita.`
                : itensChecklist === 1
                    ? "A tarefa e o item do checklist serão apagados. Essa ação não pode ser desfeita."
                    : "A tarefa será apagada. Essa ação não pode ser desfeita.",
            confirmLabel: "Excluir",
            cancelLabel: "Cancelar",
            variant: "destructive",
        });
        if (ok) deleteMutation.mutate(card.id);
    };

    const handleSaveCard = (data: any) => {
        if (modalMode === "edit" && selectedCard) {
            if (!canEditar) return;
            const payload = sanitizePatch(data);
            updateMutation.mutate({id: selectedCard.id, payload});
        } else {
            if (!canCriar) return;
            const coluna = data.coluna && data.coluna !== "" ? data.coluna : modalColuna;
            createMutation.mutate({...data, coluna});
        }
        setModalOpen(false);
        setSelectedCard(null);
    };

    const activeCard = activeId ? (cardsData ?? []).find(c => c.id === activeId) : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="h-[calc(100dvh-8rem)] min-h-0 min-w-0 flex flex-col">

            <div className="flex items-center justify-between mb-4 px-1">
                <div>
                    <h1 className="text-xl font-bold text-white">Tarefas</h1>
                    <p className="text-sm text-gray-400">Gerencie suas tarefas e acompanhe o progresso</p>
                </div>
                {canCriar && (
                <Button
                    onClick={() => {
                        setSelectedCard(null);
                        setModalColuna("solicitado");
                        setModalMode("create");
                        setModalOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4 mr-2"/>
                    Nova Tarefa
                </Button>
                )}
            </div>

            <div className="mb-4 px-1 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <FiltrosPopover
                        definicoes={definicoes}
                        valores={filtros.valores}
                        contagem={filtros.contagem}
                        onAplicar={filtros.aplicar}
                    />
                    <CampoBusca
                        valor={search}
                        onBuscar={(termo) => filtros.atualizar({q: termo || null})}
                        placeholder="Buscar tarefas…"
                        rotulo="Buscar tarefas pelo título ou descrição"
                        atrasoMs={250}
                    />
                </div>
                <FiltrosAtivos
                    chips={filtros.chips}
                    onRemover={filtros.remover}
                    onLimparTodos={filtros.limpar}
                    anuncio={isLoading ? "" : `${filteredCards.length} ${filteredCards.length === 1 ? "tarefa encontrada" : "tarefas encontradas"}`}
                    className="px-0 border-b-0"
                />
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500"/>
                </div>
            ) : isError ? (
                <div className="flex-1 flex items-center justify-center">
                    <SectionErrorFallback
                        message={error instanceof Error ? error.message : "Não foi possível carregar as tarefas."}
                        onRetry={() => refetch()}
                    />
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    accessibility={ACESSIBILIDADE_DND}
                    collisionDetection={deteccaoColuna}
                    measuring={{droppable: {strategy: MeasuringStrategy.WhileDragging}}}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setActiveId(null)}
                >
                    <div className="flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-hidden pb-4 custom-scrollbar">
                    <div className="flex gap-4 h-full w-max min-w-full">
                            {COLUMNS.map(col => (
                                <KanbanColumn
                                    key={col.id}
                                    column={col}
                                    cards={filteredCards.filter(c => c.coluna === col.id)}
                                    onAddCard={handleAddCard}
                                    onView={handleViewCard}
                                    onEdit={handleEditCard}
                                    onDelete={handleDeleteCard}
                                    activeId={activeId}
                                    canCriar={canCriar}
                                    canEditar={canEditar}
                                    canExcluir={canExcluir}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Portal para document.body: o DragOverlay usa position:fixed
                        internamente para seguir o cursor. Renderizando fora da árvore
                        DOM de <main>, ele fica imune a qualquer transform/filter que
                        um ancestral venha a ganhar no futuro (a causa raiz de hoje foi
                        corrigida no CSS - .animate-in - mas isso evita a régua de novo). */}
                    {createPortal(
                        <DragOverlay dropAnimation={null}>
                            {activeCard && (
                                <div className="w-72 opacity-90 rotate-2 shadow-2xl">
                                    <TaskCard {...activeCard} isDragging/>
                                </div>
                            )}
                        </DragOverlay>,
                        document.body,
                    )}
                </DndContext>
            )}

            <TaskModal
                open={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setSelectedCard(null);
                }}
                onSave={handleSaveCard}
                podeSalvar={modalMode === "edit" ? canEditar : canCriar}
                initialData={
                    modalMode === "edit" && selectedCard
                        ? {
                            titulo: selectedCard.titulo,
                            descricao: selectedCard.descricao ?? "",
                            prioridade: selectedCard.prioridade,
                            coluna: selectedCard.coluna,
                            prazo: selectedCard.prazo ?? "",
                            departamentos: selectedCard.departamentos ?? [],
                            checklist: selectedCard.checklist ?? [],
                            tags: selectedCard.tags ?? [],
                        }
                        : undefined
                }
                defaultColuna={modalColuna}
                mode={modalMode}
            />

            <ConfirmDialog {...ConfirmDialogProps}/>
        </div>
    );
}