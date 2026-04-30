import { useState, useRef } from "react";
import { X, Plus, CheckSquare, Square, Upload, GripVertical, Trash2, Send, Clock, User, Tag, ListChecks, Paperclip, Bold, Italic, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ChecklistItem = { id: string; texto: string; completed: boolean };
type Departamento = { value: string; label: string };

const DEPARTAMENTOS: Departamento[] = [
  { value: "financeiro", label: "Financeiro" },
  { value: "operacional", label: "Operacional" },
  { value: "contabil", label: "Contábil" },
  { value: "diretoria", label: "Diretoria" },
  { value: "rh_dp", label: "RH/DP" },
  { value: "administrativo", label: "Administrativo" }
];

const COLUNAS = [
  { value: "solicitado", label: "Solicitado" },
  { value: "em_analise", label: "Em Análise" },
  { value: "em_execucao", label: "Em Execução" },
  { value: "aguardando_aprovacao", label: "Aguardando" },
  { value: "concluido", label: "Concluído" }
];

const PRIORIDADES = [
  { value: "urgente", label: "URGENTE", bg: "bg-red-600", text: "text-white", border: "border-red-500", desc: "Precisa de atenção imediata" },
  { value: "alta", label: "ALTA", bg: "bg-[#D4A574]", text: "text-[#4A3728]", border: "border-[#C49A6C]", desc: "Prioridade alta" },
  { value: "media", label: "MÉDIA", bg: "bg-blue-600", text: "text-white", border: "border-blue-500", desc: "Prioridade moderada" },
  { value: "baixa", label: "BAIXA", bg: "bg-green-800", text: "text-green-300", border: "border-green-700", desc: "Pode esperar" }
];

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    titulo: string;
    descricao: string;
    prioridade: string;
    coluna: string;
    prazo: string | null;
    departamentos: string[];
    checklist: ChecklistItem[];
    tags: string[];
  }) => void;
  initialData?: {
    titulo: string;
    descricao: string;
    prioridade: string;
    coluna: string;
    prazo: string | null;
    departamentos: string[];
    checklist: ChecklistItem[];
    tags: string[];
  };
}

export function TaskModal({ open, onClose, onSave, initialData }: TaskModalProps) {
  const [titulo, setTitulo] = useState(initialData?.titulo || "");
  const [descricao, setDescricao] = useState(initialData?.descricao || "");
  const [prioridade, setPrioridade] = useState(initialData?.prioridade || "media");
  const [coluna, setColuna] = useState(initialData?.coluna || "solicitado");
  const [prazo, setPrazo] = useState(initialData?.prazo || "");
  const [departamentos, setDepartamentos] = useState<string[]>(initialData?.departamentos || []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initialData?.checklist || []);
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [novaTag, setNovaTag] = useState("");
  const [novoChecklist, setNovoChecklist] = useState("");
  const [showNovaTag, setShowNovaTag] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const toggleDepartamento = (value: string) => {
    setDepartamentos(prev => 
      prev.includes(value) 
        ? prev.filter(d => d !== value)
        : [...prev, value]
    );
  };
  
  const handleAddChecklist = () => {
    if (novoChecklist.trim()) {
      setChecklist(prev => [...prev, { 
        id: Date.now().toString(), 
        texto: novoChecklist.trim(), 
        completed: false 
      }]);
      setNovoChecklist("");
    }
  };
  
  const toggleChecklist = (id: string) => {
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };
  
  const removeChecklist = (id: string) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
  };
  
  const handleAddTag = () => {
    if (novaTag.trim() && !tags.includes(novaTag.trim())) {
      setTags(prev => [...prev, novaTag.trim()]);
      setNovaTag("");
      setShowNovaTag(false);
    }
  };
  
  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    // Aqui você implementaria o upload dos arquivos
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  
  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };
  
  const handleSubmit = () => {
    onSave({
      titulo,
      descricao,
      prioridade,
      coluna,
      prazo: prazo || null,
      departamentos,
      checklist,
      tags
    });
    // Reset form
    setTitulo("");
    setDescricao("");
    setPrioridade("media");
    setColuna("solicitado");
    setPrazo("");
    setDepartamentos([]);
    setChecklist([]);
    setTags([]);
    onClose();
  };
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#1A1A1A]">
          <h2 className="text-lg font-bold text-white">Nova Solicitação</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
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
            
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block flex items-center justify-between">
                Descrição
                <div className="flex gap-1">
                  <button className="p-1 hover:bg-white/10 rounded"><Bold className="w-4 h-4 text-gray-500" /></button>
                  <button className="p-1 hover:bg-white/10 rounded"><Italic className="w-4 h-4 text-gray-500" /></button>
                  <button className="p-1 hover:bg-white/10 rounded"><List className="w-4 h-4 text-gray-500" /></button>
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
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Data de Vencimento
                </label>
                <input
                  type="date"
                  value={prazo}
                  onChange={e => setPrazo(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                  Coluna Inicial
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
                  onClick={() => setShowNovaTag(!showNovaTag)}
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
            
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">
                <ListChecks className="w-3 h-3 inline mr-1" />
                Checklist
              </label>
              <div className="space-y-2 mb-3">
                {checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-[#1A1A1A] p-3 rounded-lg border border-white/5 group">
                    <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
                    <button onClick={() => toggleChecklist(item.id)}>
                      {item.completed ? (
                        <CheckSquare className="w-5 h-5 text-green-500" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-500" />
                      )}
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
          </div>
          
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
              <p className="text-sm text-gray-400 mb-1">
                Arraste arquivos aqui
              </p>
              <p className="text-xs text-gray-600">
                ou clique para selecionar
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                // Handle file upload
              }}
            />
            
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
                  <span>Itens checklists:</span>
                  <span className="text-white">{checklist.length}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Tags:</span>
                  <span className="text-white">{tags.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
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
            Criar Tarefa
          </Button>
        </div>
      </div>
    </div>
  );
}