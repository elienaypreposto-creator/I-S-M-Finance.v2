import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Search, Filter, AlertCircle, Loader2, Clock, Users, Calendar,
  MessageSquare, Paperclip, CheckSquare, X, ChevronDown, MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskModal } from "@/components/tasks/task-modal";
import { API_URL, fetchApi } from "@/lib/api-config";
import { toast } from "sonner";

const COLORS = {
  fundoPrincipal: "#121212",
  colunas: "#1A1A1A",
  cards: "#262626",
};



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

type Usuario = {
  id: number;
  nome: string;
  email: string;
  avatar: string | null;
};

const COLUMNS = [
  { id: "solicitado", title: "Solicitado", color: "bg-slate-500" },
  { id: "em_analise", title: "Em Análise", color: "bg-blue-500" },
  { id: "em_execucao", title: "Em Execução", color: "bg-orange-500" },
  { id: "aguardando_aprovacao", title: "Aguardando", color: "bg-purple-500" },
  { id: "concluido", title: "Concluído", color: "bg-emerald-500" },
];

const QUICK_FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "urgente", label: "Urgente" },
  { id: "alta", label: "Alta" },
  { id: "minha_equipe", label: "Minha Equipe" },
  { id: "vencendo_hoje", label: "Vencendo Hoje" },
];

function KanbanColumn({ 
  column, 
  cards, 
  onAddCard, 
  onCardClick,
  activeId 
}: { 
  column: typeof COLUMNS[0]; 
  cards: Card[]; 
  onAddCard: (coluna: string) => void;
  onCardClick: (card: Card) => void;
  activeId: number | null;
}) {
  const isConcluido = column.id === "concluido";
  
  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full max-h-full rounded-xl overflow-hidden">
      <div 
        className={cn(
          "p-4 border-b border-white/5 flex items-center justify-between",
          isConcluido ? "bg-emerald-900/30" : "bg-[#1A1A1A]"
        )}
        style={{ backgroundColor: isConcluido ? undefined : COLORS.colunas }}
      >
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", column.color)} />
          <h3 className="font-semibold text-sm text-white">{column.title}</h3>
          <span className="bg-white/10 text-white text-xs py-0.5 px-2 rounded-full">
            {cards.length}
          </span>
        </div>
        <button 
          onClick={() => onAddCard(column.id)}
          className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      
      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div 
          className={cn(
            "flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar",
            isConcluido ? "bg-emerald-900/10" : "bg-[#121212]"
          )}
          style={{ backgroundColor: isConcluido ? undefined : COLORS.fundoPrincipal }}
        >
          {cards.map(card => (
            <SortableCard 
              key={card.id} 
              card={card} 
              onClick={() => onCardClick(card)}
              isDragging={activeId === card.id}
            />
          ))}
          
          {cards.length === 0 && (
            <div className="h-24 flex items-center justify-center border-2 border-dashed border-white/10 rounded-xl text-xs text-gray-500">
              Arraste itens para cá
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ card, onClick, isDragging }: { card: Card; onClick: () => void; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}>
      <TaskCard
        {...card}
        onClick={undefined}
        isDragging={isDragging}
      />
    </div>
  );
}

export default function Kanban() {

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalColuna, setModalColuna] = useState("solicitado");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("todas");
  
  const queryClient = useQueryClient();
  
  const { data: cardsData, isLoading, error } = useQuery<Card[]>({
    queryKey: ["kanban-cards"],
    queryFn: () => fetchApi<Card[]>("/kanban/cards")
  });
  
  const createMutation = useMutation({
    mutationFn: (data: Partial<Card>) => fetchApi<Card>("/kanban/cards", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-cards"] });
      toast.success("Tarefa criada com sucesso!");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Erro ao criar tarefa. Verifique a conexão com o servidor.");
    }
  });
  
  const moveMutation = useMutation({
    mutationFn: ({ id, columna }: { id: number; columna: string }) => 
      fetchApi(`/kanban/cards/${id}/mover`, {
        method: "PATCH",
        body: JSON.stringify({ coluna: columna }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-cards"] });
    }
  });
  

  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
  
  const filteredCards = useMemo(() => {
    let result = cardsData || [];
    
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(c => 
        c.titulo.toLowerCase().includes(searchLower) ||
        c.descricao?.toLowerCase().includes(searchLower)
      );
    }
    
    switch (activeFilter) {
      case "urgente":
        result = result.filter(c => c.prioridade === "urgente");
        break;
      case "alta":
        result = result.filter(c => c.prioridade === "alta");
        break;
      case "vencendo_hoje":
        const hoje = new Date().toISOString().split('T')[0];
        result = result.filter(c => c.prazo === hoje);
        break;
      case "todas":
      default:
        // Não filtra - mostra todos
        break;
    }
    
    return result;
  }, [cardsData, search, activeFilter]);
  
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }
    
    const activeCard = filteredCards.find(c => c.id === active.id);
    const overId = over.id as string;
    
    if (activeCard && COLUMNS.some(c => c.id === overId)) {
      moveMutation.mutate({ id: activeCard.id, columna: overId });
    }
    
    setActiveId(null);
  };
  
  const handleCreateCard = (coluna: string) => {
    setModalColuna(coluna);
    setSelectedCard(null);
    setModalOpen(true);
  };
  
  const handleSaveCard = (data: any) => {
    createMutation.mutate({
      ...data,
      coluna: data.coluna || modalColuna,
    });
    setModalOpen(false);
  };
  
  const activeCard = activeId ? (cardsData || []).find(c => c.id === activeId) : null;
  
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h1 className="text-xl font-bold text-white">Tarefas</h1>
          <p className="text-sm text-gray-400">Gerencie suas tarefas e acompanhe o progresso</p>
        </div>
        
        <Button 
          onClick={() => { setSelectedCard(null); setModalColuna("solicitado"); setModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Tarefa
        </Button>
      </div>
      
      <div className="mb-4 px-1">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              type="text"
              placeholder="Buscar tarefas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-[#1A1A1A] border-white/10 text-white placeholder:text-gray-500"
            />
          </div>
          
          <div className="flex gap-2">
            {QUICK_FILTERS.map(filter => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeFilter === filter.id
                    ? "bg-blue-600 text-white"
                    : "bg-[#1A1A1A] border border-white/10 text-gray-400 hover:text-white hover:border-white/30"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto pb-4">
            <div className="flex gap-4 h-full min-w-max">
              {COLUMNS.map(col => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  cards={filteredCards.filter(c => c.coluna === col.id)}
                  onAddCard={handleCreateCard}
                  onCardClick={(card) => { setSelectedCard(card); setModalOpen(true); }}
                  activeId={activeId}
                />
              ))}
            </div>
          </div>
          
          <DragOverlay>
            {activeCard && (
              <div className="w-72 opacity-90">
                <TaskCard {...activeCard} isDragging />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      
      <TaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedCard(null); }}
        onSave={handleSaveCard}
        initialData={selectedCard ? {
          titulo: selectedCard.titulo,
          descricao: selectedCard.descricao || "",
          prioridade: selectedCard.prioridade,
          coluna: selectedCard.coluna,
          prazo: selectedCard.prazo || "",
          departamentos: selectedCard.departamentos || [],
          checklist: selectedCard.checklist || [],
          tags: selectedCard.tags || [],
        } : undefined}
      />
    </div>
  );
}