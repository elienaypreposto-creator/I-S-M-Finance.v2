import {useState, useMemo, useRef, useEffect} from "react";
import {createPortal} from "react-dom";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {
    DndContext, DragOverlay,
    PointerSensor, TouchSensor, useSensor, useSensors,
    DragStartEvent, DragEndEvent,
    rectIntersection,
    MeasuringStrategy,
} from "@dnd-kit/core";
import {useDroppable} from "@dnd-kit/core";
import {SortableContext, verticalListSortingStrategy, useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {Plus, Search, Loader2, Pencil, Trash2, MoreHorizontal} from "lucide-react";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {TaskCard} from "@/components/tasks/task-card";
import {TaskModal} from "@/components/tasks/task-modal";
import {SectionErrorFallback} from "@/components/error-boundary";
import {fetchApiData} from "@/lib/api-config";
import {toast} from "sonner";
import {invalidateRelated} from "@/App";

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

const QUICK_FILTERS = [
    {id: "todas", label: "Todas"},
    {id: "urgente", label: "Urgente"},
    {id: "alta", label: "Alta"},
    {id: "minha_equipe", label: "Minha Equipe"},
    {id: "vencendo_hoje", label: "Vencendo Hoje"},
];

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

// ─── CardMenu ─────────────────────────────────────────────────────────────────
function CardMenu({
                      onEdit,
                      onDelete,
                  }: {
    onEdit: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
            <button
                onClick={e => {
                    e.stopPropagation();
                    setOpen(v => !v);
                }}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
                <MoreHorizontal className="w-4 h-4"/>
            </button>

            {open && (
                <div
                    className="absolute right-0 top-6 z-50 w-36 rounded-lg border border-white/10 bg-[#1E1E1E] shadow-xl py-1">
                    <button
                        onClick={e => {
                            setOpen(false);
                            onEdit(e);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                    >
                        <Pencil className="w-3.5 h-3.5"/>
                        Editar
                    </button>
                    <button
                        onClick={e => {
                            setOpen(false);
                            onDelete(e);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5"/>
                        Excluir
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── SortableCard ─────────────────────────────────────────────────────────────
function SortableCard({
                          card,
                          onView,
                          onEdit,
                          onDelete,
                          isDragging,
                      }: {
    card: Card;
    onView: (card: Card) => void;
    onEdit: (card: Card) => void;
    onDelete: (card: Card) => void;
    isDragging: boolean;
}) {
    const {attributes, listeners, setNodeRef, transform, transition} = useSortable({id: card.id});
    const style = {transform: CSS.Transform.toString(transform), transition};

    return (
        <div
            ref={setNodeRef}
            style={{...style, touchAction: "pan-y"}}
            {...attributes}
            {...listeners}
            onClick={(e) => {
                // Se o clique originou de dentro do menu, não abre o modal de visualização
                if ((e.target as HTMLElement).closest("[data-card-menu]")) return;
                onView(card);
            }}
        >
            <TaskCard
                {...card}
                onClick={undefined}
                isDragging={isDragging}
                menuSlot={
                    <div data-card-menu onPointerDown={e => e.stopPropagation()}>
                        <CardMenu
                            onEdit={e => {
                                e.stopPropagation();
                                onEdit(card);
                            }}
                            onDelete={e => {
                                e.stopPropagation();
                                onDelete(card);
                            }}
                        />
                    </div>
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
                          column, cards, onAddCard, onView, onEdit, onDelete, activeId,
                      }: {
    column: typeof COLUMNS[0];
    cards: Card[];
    onAddCard: (coluna: string) => void;
    onView: (card: Card) => void;
    onEdit: (card: Card) => void;
    onDelete: (card: Card) => void;
    activeId: number | null;
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
                <button
                    onClick={() => onAddCard(column.id)}
                    className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                >
                    <Plus className="w-4 h-4"/>
                </button>
            </div>

            <DroppableColumn id={column.id}>
                <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {cards.map(card => (
                        <SortableCard
                            key={card.id}
                            card={card}
                            onView={onView}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            isDragging={activeId === card.id}
                        />
                    ))}
                </SortableContext>

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
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState("todas");

    const queryClient = useQueryClient();

    const {data: cardsData, isLoading, isError, error, refetch} = useQuery<Card[]>({
        queryKey: ["kanban-cards"],
        queryFn: () => fetchApiData<Card[]>("/kanban/cards"),
    });

    // ── Criar ─────────────────────────────────────────────────────────────────
    const createMutation = useMutation({
        mutationFn: (data: Partial<Card>) =>
            fetchApiData<Card>("/kanban/cards", {method: "POST", body: JSON.stringify(data)}),
        onMutate: async (newCard) => {
            await queryClient.cancelQueries({queryKey: ["kanban-cards"]});
            const snapshot = queryClient.getQueryData<Card[]>(["kanban-cards"]);
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
            queryClient.setQueryData<Card[]>(["kanban-cards"], (old = []) => [...old, tempCard]);
            return {snapshot};
        },
        onError: (_err, _data, ctx) => {
            if (ctx?.snapshot) queryClient.setQueryData(["kanban-cards"], ctx.snapshot);
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
            await queryClient.cancelQueries({queryKey: ["kanban-cards"]});
            const snapshot = queryClient.getQueryData<Card[]>(["kanban-cards"]);
            queryClient.setQueryData<Card[]>(["kanban-cards"], (old = []) =>
                old.map(c => c.id === id ? {...c, ...payload} : c)
            );
            return {snapshot};
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.snapshot) queryClient.setQueryData(["kanban-cards"], ctx.snapshot);
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
            await queryClient.cancelQueries({queryKey: ["kanban-cards"]});
            const snapshot = queryClient.getQueryData<Card[]>(["kanban-cards"]);
            queryClient.setQueryData<Card[]>(["kanban-cards"], (old = []) => old.filter(c => c.id !== id));
            return {snapshot};
        },
        onError: (_err, _id, ctx) => {
            if (ctx?.snapshot) queryClient.setQueryData(["kanban-cards"], ctx.snapshot);
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
            await queryClient.cancelQueries({queryKey: ["kanban-cards"]});
            const snapshot = queryClient.getQueryData<Card[]>(["kanban-cards"]);
            queryClient.setQueryData<Card[]>(["kanban-cards"], (old = []) =>
                old.map(c => c.id === id ? {...c, coluna} : c)
            );
            return {snapshot};
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.snapshot) queryClient.setQueryData(["kanban-cards"], ctx.snapshot);
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
        let result = cardsData ?? [];
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(c =>
                c.titulo.toLowerCase().includes(q) || c.descricao?.toLowerCase().includes(q)
            );
        }
        switch (activeFilter) {
            case "urgente":
                result = result.filter(c => c.prioridade === "urgente");
                break;
            case "alta":
                result = result.filter(c => c.prioridade === "alta");
                break;
            case "vencendo_hoje": {
                const hoje = new Date().toISOString().split("T")[0];
                result = result.filter(c => c.prazo === hoje);
                break;
            }
        }
        return result;
    }, [cardsData, search, activeFilter]);

    // ── Drag ──────────────────────────────────────────────────────────────────
    const handleDragStart = ({active}: DragStartEvent) => setActiveId(active.id as number);

    const handleDragEnd = ({active, over}: DragEndEvent) => {
        setActiveId(null);
        if (!over) return;

        const allCards = cardsData ?? [];
        const draggedCard = allCards.find(c => c.id === active.id);
        if (!draggedCard) return;

        if (draggedCard.id < 0) {
            toast.info("Aguarde a tarefa ser salva antes de movê-la.");
            return;
        }

        const overId = String(over.id);

        let targetColuna: string;
        if (overId.startsWith(COL_PREFIX)) {
            targetColuna = overId.slice(COL_PREFIX.length);
        } else {
            const overCard = allCards.find(c => c.id === Number(overId));
            if (!overCard) return;
            targetColuna = overCard.coluna;
        }

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

    const handleDeleteCard = (card: Card) => {
        deleteMutation.mutate(card.id);
    };

    const handleSaveCard = (data: any) => {
        if (modalMode === "edit" && selectedCard) {
            const payload = sanitizePatch(data);
            updateMutation.mutate({id: selectedCard.id, payload});
        } else {
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
            </div>

            <div className="mb-4 px-1">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
                        <Input
                            type="text"
                            placeholder="Buscar tarefas..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10 bg-[#1A1A1A] border-white/10 text-white placeholder:text-gray-500"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {QUICK_FILTERS.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setActiveFilter(f.id)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    activeFilter === f.id
                                        ? "bg-blue-600 text-white"
                                        : "bg-[#1A1A1A] border border-white/10 text-gray-400 hover:text-white hover:border-white/30"
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
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
                    collisionDetection={rectIntersection}
                    measuring={{droppable: {strategy: MeasuringStrategy.WhileDragging}}}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
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
        </div>
    );
}