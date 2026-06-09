import { useState, useRef, useEffect } from "react";
import {
  X, Plus, CheckSquare, Square, Upload, GripVertical, Trash2,
  Send, Clock, Tag, ListChecks, Paperclip, Bold, Italic, List, ListOrdered
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ChecklistItem = { id: string; texto: string; completed: boolean };
type Departamento  = { value: string; label: string };

// ─── Constantes ───────────────────────────────────────────────────────────────
const DEPARTAMENTOS: Departamento[] = [
  { value: "financeiro",    label: "Financeiro"    },
  { value: "operacional",   label: "Operacional"   },
  { value: "contabil",      label: "Contábil"      },
  { value: "diretoria",     label: "Diretoria"     },
  { value: "rh_dp",         label: "RH/DP"         },
  { value: "administrativo",label: "Administrativo"},
];

const COLUNAS = [
  { value: "solicitado",           label: "Solicitado"  },
  { value: "em_analise",           label: "Em Análise"  },
  { value: "em_execucao",          label: "Em Execução" },
  { value: "aguardando_aprovacao", label: "Aguardando"  },
  { value: "concluido",            label: "Concluído"   },
];

const PRIORIDADES = [
  { value: "urgente", label: "URGENTE", bg: "bg-red-600",    text: "text-white",       border: "border-red-500",   desc: "Precisa de atenção imediata" },
  { value: "alta",    label: "ALTA",    bg: "bg-[#D4A574]",  text: "text-[#4A3728]",   border: "border-[#C49A6C]", desc: "Prioridade alta"              },
  { value: "media",   label: "MÉDIA",   bg: "bg-blue-600",   text: "text-white",       border: "border-blue-500",  desc: "Prioridade moderada"          },
  { value: "baixa",   label: "BAIXA",   bg: "bg-green-800",  text: "text-green-300",   border: "border-green-700", desc: "Pode esperar"                 },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    titulo:        string;
    descricao:     string;
    prioridade:    string;
    coluna:        string;
    prazo:         string | null;
    departamentos: string[];
    checklist:     ChecklistItem[];
    tags:          string[];
  }) => void;
  /** Dados existentes — presentes quando mode === "edit" */
  initialData?: {
    titulo:        string;
    descricao:     string;
    prioridade:    string;
    coluna:        string;
    prazo:         string | null;
    departamentos: string[];
    checklist:     ChecklistItem[];
    tags:          string[];
  };
  /** Coluna pré-selecionada ao criar via botão "+" de uma coluna específica */
  defaultColuna?: string;
  /** "create" (padrão) ou "edit" */
  mode?: "create" | "edit";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyForm(defaultColuna = "solicitado") {
  return {
    titulo:        "",
    descricao:     "",
    prioridade:    "media",
    coluna:        defaultColuna,
    prazo:         "",
    departamentos: [] as string[],
    checklist:     [] as ChecklistItem[],
    tags:          [] as string[],
  };
}

// ─── Componente ───────────────────────────────────────────────────────────────
export function TaskModal({
  open,
  onClose,
  onSave,
  initialData,
  defaultColuna = "solicitado",
  mode = "create",
}: TaskModalProps) {

  // Estado do formulário — inicializado de forma lazy para evitar re-render desnecessário
  const [titulo,        setTitulo]        = useState(initialData?.titulo        ?? "");
  const [descricao,     setDescricao]     = useState(initialData?.descricao     ?? "");
  const [prioridade,    setPrioridade]    = useState(initialData?.prioridade    ?? "media");
  const [coluna,        setColuna]        = useState(initialData?.coluna        ?? defaultColuna);
  const [prazo,         setPrazo]         = useState(initialData?.prazo         ?? "");
  const [departamentos, setDepartamentos] = useState<string[]>(initialData?.departamentos ?? []);
  const [checklist,     setChecklist]     = useState<ChecklistItem[]>(initialData?.checklist ?? []);
  const [tags,          setTags]          = useState<string[]>(initialData?.tags ?? []);

  // Auxiliares de UI
  const [novaTag,        setNovaTag]        = useState("");
  const [novoChecklist,  setNovoChecklist]  = useState("");
  const [showNovaTag,    setShowNovaTag]    = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Sempre que o modal abrir, sincroniza os campos:
   * - modo "edit"   → preenche com initialData
   * - modo "create" → reseta para formulário vazio respeitando defaultColuna
   */
  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && initialData) {
      setTitulo(initialData.titulo);
      setDescricao(initialData.descricao ?? "");
      setPrioridade(initialData.prioridade ?? "media");
      setColuna(initialData.coluna ?? defaultColuna);
      setPrazo(initialData.prazo ?? "");
      setDepartamentos(initialData.departamentos ?? []);
      setChecklist(initialData.checklist ?? []);
      setTags(initialData.tags ?? []);
    } else {
      // Criação — limpa tudo e aplica coluna default
      const blank = emptyForm(defaultColuna);
      setTitulo(blank.titulo);
      setDescricao(blank.descricao);
      setPrioridade(blank.prioridade);
      setColuna(blank.coluna);
      setPrazo(blank.prazo);
      setDepartamentos(blank.departamentos);
      setChecklist(blank.checklist);
      setTags(blank.tags);
    }

    // Reseta auxiliares de UI
    setNovaTag("");
    setNovoChecklist("");
    setShowNovaTag(false);
  // defaultColuna e initialData incluídos para o coluna correto ser aplicado ao abrir
  }, [open, mode, defaultColuna, initialData]);

  // ── Checklist ──────────────────────────────────────────────────────────────
  const handleAddChecklist = () => {
    if (!novoChecklist.trim()) return;
    setChecklist(prev => [
      ...prev,
      { id: Date.now().toString(), texto: novoChecklist.trim(), completed: false },
    ]);
    setNovoChecklist("");
  };

  const toggleChecklist = (id: string) =>
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ));

  const removeChecklist = (id: string) =>
    setChecklist(prev => prev.filter(item => item.id !== id));

  // ── Tags ───────────────────────────────────────────────────────────────────
  const handleAddTag = () => {
    const trimmed = novaTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags(prev => [...prev, trimmed]);
      setNovaTag("");
      setShowNovaTag(false);
    }
  };

  const removeTag = (tag: string) =>
    setTags(prev => prev.filter(t => t !== tag));

  // ── Departamentos ──────────────────────────────────────────────────────────
  const toggleDepartamento = (value: string) =>
    setDepartamentos(prev =>
      prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value]
    );

  // ── Drag & drop de arquivos ────────────────────────────────────────────────
  const handleDrop      = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(false); };
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(true);  };
  const handleDragLeave = ()                    => setIsDraggingOver(false);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!titulo.trim()) return;
    onSave({ titulo, descricao, prioridade, coluna, prazo: prazo || null, departamentos, checklist, tags });
    // onClose é chamado pelo pai após onSave; não fechamos aqui para evitar duplo-fechamento
  };

  // ─── Labels dinâmicos por modo ─────────────────────────────────────────────
  const modalTitle  = mode === "edit" ? "Editar Tarefa"    : "Nova Solicitação";
  const submitLabel = mode === "edit" ? "Salvar Alterações": "Criar Tarefa";
  const colunaLabel = mode === "edit" ? "Mover para"       : "Coluna Inicial";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#1A1A1A]">
          <h2 className="text-lg font-bold text-white">{modalTitle}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex flex-1 overflow-hidden">

          {/* Coluna principal */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">

            {/* Título */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                Título da Tarefa
              </label>
              <input
                type="text"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Digite o título da solicitação..."
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                Descrição
                <div className="flex gap-1">
                  <button className="p-1 hover:bg-white/10 rounded"><Bold        className="w-4 h-4 text-gray-500" /></button>
                  <button className="p-1 hover:bg-white/10 rounded"><Italic      className="w-4 h-4 text-gray-500" /></button>
                  <button className="p-1 hover:bg-white/10 rounded"><List        className="w-4 h-4 text-gray-500" /></button>
                  <button className="p-1 hover:bg-white/10 rounded"><ListOrdered className="w-4 h-4 text-gray-500" /></button>
                </div>
              </label>
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Adicione uma descrição detalhada..."
                rows={5}
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            {/* Prioridade */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">
                Prioridade
              </label>
              <div className="grid grid-cols-4 gap-3">
                {PRIORIDADES.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPrioridade(p.value)}
                    className={cn(
                      "p-3 rounded-xl border transition-all text-center",
                      prioridade === p.value
                        ? `${p.bg} ${p.text} ${p.border} shadow-lg`
                        : "bg-[#1A1A1A] border-white/10 text-gray-400 hover:border-white/30"
                    )}
                  >
                    <div className="font-bold text-sm">{p.label}</div>
                    <div className={cn("text-[10px] mt-1", prioridade === p.value ? "opacity-80" : "text-gray-500")}>
                      {p.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Prazo + Coluna */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Data de Vencimento
                </label>
                <input
                  type="date"
                  value={prazo ?? ""}
                  onChange={e => setPrazo(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                  {colunaLabel}
                </label>
                <select
                  value={coluna}
                  onChange={e => setColuna(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                >
                  {COLUNAS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Departamentos + Tags */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">
                <Tag className="w-3 h-3 inline mr-1" />
                Departamentos
              </label>
              <div className="flex flex-wrap gap-2">
                {DEPARTAMENTOS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDepartamento(d.value)}
                    className={cn(
                      "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                      departamentos.includes(d.value)
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-[#1A1A1A] border-white/10 text-gray-400 hover:border-white/30"
                    )}
                  >
                    {departamentos.includes(d.value) && <CheckSquare className="w-4 h-4 inline mr-2" />}
                    {d.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowNovaTag(v => !v)}
                  className="px-4 py-2 rounded-lg border border-dashed border-white/20 text-gray-400 hover:border-white/40 hover:text-white text-sm font-medium transition-all"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  Nova Tag
                </button>
              </div>

              {showNovaTag && (
                <div className="flex gap-2 mt-3">
                  <Input
                    value={novaTag}
                    onChange={e => setNovaTag(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddTag()}
                    placeholder="Digite a nova tag..."
                    className="flex-1 bg-[#1A1A1A] border-white/10"
                  />
                  <Button onClick={handleAddTag} size="sm" className="bg-blue-600 hover:bg-blue-700">
                    Adicionar
                  </Button>
                </div>
              )}

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {tags.map((tag, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-gray-700 text-gray-300">
                      {tag}
                      <button onClick={() => removeTag(tag)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Checklist */}
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">
                <ListChecks className="w-3 h-3 inline mr-1" />
                Checklist
              </label>
              <div className="space-y-2 mb-3">
                {checklist.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-[#1A1A1A] p-3 rounded-lg border border-white/5 group"
                  >
                    <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
                    <button onClick={() => toggleChecklist(item.id)}>
                      {item.completed
                        ? <CheckSquare className="w-5 h-5 text-green-500" />
                        : <Square      className="w-5 h-5 text-gray-500"  />}
                    </button>
                    <span className={cn("flex-1 text-sm", item.completed && "line-through text-gray-500")}>
                      {item.texto}
                    </span>
                    <button
                      onClick={() => removeChecklist(item.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
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
                  className="flex-1 bg-[#1A1A1A] border-white/10"
                />
                <Button onClick={handleAddChecklist} size="sm" variant="secondary">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

          </div>{/* /coluna principal */}

          {/* Coluna lateral */}
          <div className="w-72 p-6 border-l border-white/10 bg-[#1A1A1A]">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">
              <Paperclip className="w-3 h-3 inline mr-1" />
              Anexos
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                isDraggingOver
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-white/20 hover:border-white/40"
              )}
            >
              <Upload className="w-8 h-8 text-gray-500 mx-auto mb-3" />
              <p className="text-sm text-gray-400 mb-1">Arraste arquivos aqui</p>
              <p className="text-xs text-gray-600">ou clique para selecionar</p>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" />

            {/* Resumo */}
            <div className="mt-6">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">
                Resumo
              </label>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Departamentos:</span>
                  <span className="text-white">{departamentos.length}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Itens checklist:</span>
                  <span className="text-white">{checklist.length}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Tags:</span>
                  <span className="text-white">{tags.length}</span>
                </div>
                {/* Indicador visual de modo */}
                <div className="flex justify-between text-gray-400 pt-2 border-t border-white/10">
                  <span>Modo:</span>
                  <span className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded-full",
                    mode === "edit"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-blue-500/20 text-blue-400"
                  )}>
                    {mode === "edit" ? "Editando" : "Novo"}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>{/* /corpo */}

        {/* Rodapé */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-[#1A1A1A]">
          <Button variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!titulo.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4 mr-2" />
            {submitLabel}
          </Button>
        </div>

      </div>
    </div>
  );
}