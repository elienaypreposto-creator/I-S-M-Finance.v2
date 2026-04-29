import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, isPast, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, MoreVertical, MessageSquare, Clock, Calendar, Tag, Users, CheckSquare,
  Square, Paperclip, X, ChevronDown, Filter, AlertCircle, Loader2, Pencil, Trash2, Send
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type ChecklistItem = { id: string; texto: string; completed: boolean };

type Card = {
  id: number;
  titulo: string;
  descricao: string | null;
  coluna: string;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  responsaveis_multiplos: number[] | null;
  tags: string[] | null;
  checklist: ChecklistItem[] | null;
  comentarios_count: number;
  anexos_count: number;
  prazo: string | null;
  prioridade: string;
  created_at: string;
};

type Column = {
  id: string;
  title: string;
  color: string;
  icon?: React.ElementType;
};

type Usuario = {
  id: number;
  nome: string;
  email: string;
  avatar: string | null;
};

const COLUMNS: Column[] = [
  { id: "solicitado", title: "Solicitado", color: "bg-slate-500", icon: AlertCircle },
  { id: "em_analise", title: "Em Análise", color: "bg-blue-500", icon: Filter },
  { id: "em_execucao", title: "Em Execução", color: "bg-orange-500", icon: Loader2 },
  { id: "aguardando_aprovacao", title: "Aguardando", color: "bg-purple-500", icon: Clock },
  { id: "concluido", title: "Concluído", color: "bg-success", icon: CheckSquare },
];

const PRIORIDADES = [
  { value: "baixa", label: "Baixa", color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  { value: "media", label: "Média", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { value: "alta", label: "Alta", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "urgente", label: "Urgente", color: "bg-destructive/20 text-destructive border-destructive/30" },
];

const COLUMN_COLORS: Record<string, string> = {
  solicitado: "from-slate-500/20 to-slate-600/10 border-slate-500/20",
  em_analise: "from-blue-500/20 to-blue-600/10 border-blue-500/20",
  em_execucao: "from-orange-500/20 to-orange-600/10 border-orange-500/20",
  aguardar: "from-purple-500/20 to-purple-600/10 border-purple-500/20",
  concluido: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20",
};

function PriorityBadge({ prioridade }: { prioridade: string }) {
  const config = PRIORIDADES.find(p => p.value === prioridade.toLowerCase()) || PRIORIDADES[0];
  return (
    <span className={cn("text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border", config.color)}>
      {config.label}
    </span>
  );
}

function DateBadge({ prazo }: { prazo: string | null }) {
  if (!prazo) return null;
  
  const data = new Date(prazo);
  const hoje = new Date();
  const isAtrasado = isPast(data) && differenceInDays(hoje, data) > 0;
  const diasDiff = differenceInDays(data, hoje);
  
  let colorClass = "text-muted-foreground";
  if (isAtrasado) {
    colorClass = "text-destructive";
  } else if (diasDiff <= 2 && diasDiff >= 0) {
    colorClass = "text-orange-400";
  }
  
  return (
    <div className={cn("flex items-center gap-1 text-xs", colorClass)}>
      <Calendar className="w-3.5 h-3.5" />
      <span>{format(data, "dd/MM", { locale: ptBR })}</span>
      {isAtrasado && <AlertCircle className="w-3 h-3 ml-1" />}
    </div>
  );
}

function SortableCard({ card, onClick, usuarios }: { card: Card; onClick: () => void; usuarios: Usuario[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  const checklistTotal = card.checklist?.length || 0;
  const checklistCompleted = card.checklist?.filter(i => i.completed).length || 0;
  const checklistProgress = checklistTotal > 0 ? (checklistCompleted / checklistTotal) * 100 : 0;
  const isConcluido = card.coluna === "concluido";
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "bg-card p-4 rounded-xl border border-white/10 shadow-sm hover:border-primary/50 hover:shadow-primary/10 transition-all cursor-grab active:cursor-grabbing group",
        isDragging && "opacity-50 z-50",
        isConcluido && "opacity-75 hover:opacity-90"
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <PriorityBadge prioridade={card.prioridade} />
        <button className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
      
      <h4 className="text-sm font-medium text-white mb-2 line-clamp-2 leading-snug">
        {card.titulo}
      </h4>
      
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {card.tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">
              {tag}
            </span>
          ))}
          {card.tags.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
              +{card.tags.length - 3}
            </span>
          )}
        </div>
      )}
      
      {checklistTotal > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
            <CheckSquare className="w-3 h-3" />
            <span>{checklistCompleted}/{checklistTotal}</span>
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all" 
                style={{ width: `${checklistProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          {card.prazo && <DateBadge prazo={card.prazo} />}
        </div>
        <div className="flex items-center gap-3">
          {(card.comentarios_count > 0 || card.anexos_count > 0) && (
            <div className="flex items-center gap-2">
              {card.comentarios_count > 0 && (
                <div className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{card.comentarios_count}</span>
                </div>
              )}
              {card.anexos_count > 0 && (
                <div className="flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>{card.anexos_count}</span>
                </div>
              )}
            </div>
          )}
          {card.responsavel_nome && (
            <div className="flex items-center gap-1">
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-[10px] text-white font-bold">
                {card.responsavel_nome.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardModal({ 
  card, 
  open, 
  onClose, 
  onSave, 
  usuarios 
}: { 
  card: Card | null; 
  open: boolean; 
  onClose: () => void; 
  onSave: (data: Partial<Card>) => void; 
  usuarios: Usuario[];
}) {
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    prioridade: "media",
    prazo: "",
    responsavel_id: "" as string,
    responsaveis_multiplos: [] as number[],
    tags: [] as string[],
    checklist: [] as ChecklistItem[],
  });
  const [novaTag, setNovaTag] = useState("");
  const [novoChecklist, setNovoChecklist] = useState("");
  const [novaListaMultipla, setNovaListaMultipla] = useState(false);
  
  useEffect(() => {
    if (card) {
      setForm({
        titulo: card.titulo,
        descricao: card.descricao || "",
        prioridade: card.prioridade,
        prazo: card.prazo || "",
        responsavel_id: card.responsavel_id?.toString() || "",
        responsaveis_multiplos: card.responsaveis_multiplos || [],
        tags: card.tags || [],
        checklist: card.checklist || [],
      });
    } else {
      setForm({
        titulo: "",
        descricao: "",
        prioridade: "media",
        prazo: "",
        responsavel_id: "",
        responsaveis_multiplos: [],
        tags: [],
        checklist: [],
      });
    }
  }, [card, open]);
  
  const handleAddTag = () => {
    if (novaTag.trim() && !form.tags.includes(novaTag.trim())) {
      setForm(f => ({ ...f, tags: [...f.tags, novaTag.trim()] }));
      setNovaTag("");
    }
  };
  
  const handleAddChecklist = () => {
    if (novoChecklist.trim()) {
      setForm(f => ({ 
        ...f, 
        checklist: [...f.checklist, { id: Date.now().toString(), texto: novoChecklist.trim(), completed: false }] 
      }));
      setNovoChecklist("");
    }
  };
  
  const handleToggleChecklist = (id: string) => {
    setForm(f => ({
      ...f,
      checklist: f.checklist.map(i => i.id === id ? { ...i, completed: !i.completed } : i)
    }));
  };
  
  const handleRemoveChecklist = (id: string) => {
    setForm(f => ({ ...f, checklist: f.checklist.filter(i => i.id !== id) }));
  };
  
  const handleSubmit = () => {
    onSave({
      titulo: form.titulo,
      descricao: form.descricao || null,
      prioridade: form.prioridade,
      prazo: form.prazo || null,
      responsavel_id: form.responsavel_id ? parseInt(form.responsavel_id) : null,
      responsaveis_multiplos: form.responsaveis_multiplos.length > 0 ? form.responsaveis_multiplos : null,
      tags: form.tags.length > 0 ? form.tags : null,
      checklist: form.checklist.length > 0 ? form.checklist : null,
    });
    onClose();
  };
  
  const handleToggleResponsavel = (id: number) => {
    setForm(f => {
      const exists = f.responsaveis_multiplos.includes(id);
      return {
        ...f,
        responsaveis_multiplos: exists 
          ? f.responsaveis_multiplos.filter(r => r !== id)
          : [...f.responsaveis_multiplos, id]
      };
    });
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-[#121417] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{card ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Título</label>
            <Input
              value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Digite o título da tarefa..."
              className="bg-[#1a1c23] border-white/10"
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Descrição</label>
            <Textarea
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Adicione uma descrição..."
              className="bg-[#1a1c23] border-white/10 min-h-[100px]"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Prioridade</label>
              <select
                value={form.prioridade}
                onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}
                className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white"
              >
                {PRIORIDADES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Data de Vencimento</label>
              <Input
                type="date"
                value={form.prazo}
                onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
                className="bg-[#1a1c23] border-white/10"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Responsável</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {usuarios.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleToggleResponsavel(u.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm",
                    form.responsaveis_multiplos.includes(u.id)
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-white/5 border-white/10 text-muted-foreground hover:text-white"
                  )}
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-[10px] text-white">
                    {u.nome.charAt(0)}
                  </div>
                  {u.nome}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.tags.map((tag, i) => (
                <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white/10 text-white/80">
                  {tag}
                  <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={novaTag}
                onChange={e => setNovaTag(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddTag()}
                placeholder="Adicionar tag..."
                className="bg-[#1a1c23] border-white/10"
              />
              <Button onClick={handleAddTag} size="sm" variant="secondary">Add</Button>
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Checklist</label>
            <div className="space-y-2 mb-2">
              {form.checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <button onClick={() => handleToggleChecklist(item.id)}>
                    {item.completed ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <span className={cn("flex-1 text-sm", item.completed && "line-through text-muted-foreground")}>{item.texto}</span>
                  <button onClick={() => handleRemoveChecklist(item.id)}>
                    <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={novoChecklist}
                onChange={e => setNovoChecklist(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddChecklist()}
                placeholder="Adicionar item ao checklist..."
                className="bg-[#1a1c23] border-white/10"
              />
              <Button onClick={handleAddChecklist} size="sm" variant="secondary">Add</Button>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90">
            {card ? "Salvar Alterações" : "Criar Tarefa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Kanban() {
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [filtros, setFiltros] = useState({ prioridade: "", responsavel_id: "", prazo: "" });
  
  const queryClient = useQueryClient();
  
  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ["kanban-usuarios"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/kanban/usuarios`);
      return res.json();
    }
  });
  
  const { data: cardsData, isLoading } = useQuery<Card[]>({
    queryKey: ["kanban-cards", filtros],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filtros.prioridade) params.set("prioridade", filtros.prioridade);
      if (filtros.responsavel_id) params.set("responsavel_id", filtros.responsavel_id);
      if (filtros.prazo) params.set("prazo", filtros.prazo);
      const res = await fetch(`${API_URL}/kanban/cards?${params}`);
      return res.json();
    }
  });
  
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Card>) => {
      const res = await fetch(`${API_URL}/kanban/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-cards"] });
    }
  });
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Card> }) => {
      const res = await fetch(`${API_URL}/kanban/cards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-cards"] });
    }
  });
  
  const moveMutation = useMutation({
    mutationFn: async ({ id, coluna }: { id: number; coluna: string }) => {
      const res = await fetch(`${API_URL}/kanban/cards/${id}/mover`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coluna }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-cards"] });
    }
  });
  
  useEffect(() => {
    if (cardsData) setCards(cardsData);
  }, [cardsData]);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
  
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }
    
    const activeCard = cards.find(c => c.id === active.id);
    const overId = over.id as string;
    
    if (activeCard && COLUMNS.some(c => c.id === overId)) {
      moveMutation.mutate({ id: activeCard.id, coluna: overId });
    }
    
    setActiveId(null);
  };
  
  const handleCreateCard = (coluna: string) => {
    createMutation.mutate({ titulo: "Nova Tarefa", coluna, prioridade: "media" });
  };
  
  const handleSaveCard = (data: Partial<Card>) => {
    if (selectedCard) {
      updateMutation.mutate({ id: selectedCard.id, data });
    } else {
      createMutation.mutate(data);
    }
  };
  
  const activeCard = activeId ? cards.find(c => c.id === activeId) : null;
  
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h1 className="text-xl font-bold text-white">Tarefas</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas tarefas e acompanhe o progresso</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="border-white/10 bg-white/5 hover:bg-white/10">
                <Filter className="w-4 h-4 mr-2" />
                Filtrar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="bg-[#1a1c23] border-white/10 p-4 w-64">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1 block">Prioridade</label>
                  <select
                    value={filtros.prioridade}
                    onChange={e => setFiltros(f => ({ ...f, prioridade: e.target.value }))}
                    className="w-full bg-[#121417] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">Todas</option>
                    {PRIORIDADES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1 block">Responsável</label>
                  <select
                    value={filtros.responsavel_id}
                    onChange={e => setFiltros(f => ({ ...f, responsavel_id: e.target.value }))}
                    className="w-full bg-[#121417] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">Todos</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1 block">Prazo</label>
                  <select
                    value={filtros.prazo}
                    onChange={e => setFiltros(f => ({ ...f, prazo: e.target.value }))}
                    className="w-full bg-[#121417] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">Todos</option>
                    <option value="atrasado">Atrasado</option>
                    <option value="proximos">Próximos 7 dias</option>
                  </select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Button 
            onClick={() => { setSelectedCard(null); setModalOpen(true); }}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Tarefa
          </Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
              {COLUMNS.map(col => {
                const columnCards = cards.filter(c => c.coluna === col.id);
                const isConcluido = col.id === "concluido";
                
                return (
                  <div 
                    key={col.id} 
                    className={cn(
                      "w-72 flex flex-col h-full max-h-full rounded-2xl border overflow-hidden bg-gradient-to-b",
                      COLUMN_COLORS[col.id],
                      isConcluido && "from-emerald-500/10 to-transparent"
                    )}
                  >
                    <div className="p-3 border-b border-white/5 flex items-center justify-between bg-card/50">
                      <div className="flex items-center gap-2">
                        {col.icon && <col.icon className={cn("w-4 h-4", col.color.replace("bg-", "text-"))} />}
                        <h3 className="font-semibold text-sm text-white">{col.title}</h3>
                        <span className="bg-white/10 text-white text-xs py-0.5 px-2 rounded-full">
                          {columnCards.length}
                        </span>
                      </div>
                      <button 
                        onClick={() => handleCreateCard(col.id)}
                        className="text-muted-foreground hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <SortableContext items={columnCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      <div className="p-2 flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                        {columnCards.map(card => (
                          <SortableCard 
                            key={card.id} 
                            card={card} 
                            onClick={() => { setSelectedCard(card); setModalOpen(true); }}
                            usuarios={usuarios}
                          />
                        ))}
                        
                        {columnCards.length === 0 && (
                          <div className="h-20 flex items-center justify-center border-2 border-dashed border-white/10 rounded-xl text-xs text-muted-foreground">
                            Arraste itens para cá
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </div>
          </div>
          
          <DragOverlay>
            {activeCard && (
              <div className="bg-card p-4 rounded-xl border border-primary shadow-2xl opacity-90 w-72">
                <PriorityBadge prioridade={activeCard.prioridade} />
                <h4 className="text-sm font-medium text-white mt-2">{activeCard.titulo}</h4>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      
      <CardModal
        card={selectedCard}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedCard(null); }}
        onSave={handleSaveCard}
        usuarios={usuarios}
      />
    </div>
  );
}