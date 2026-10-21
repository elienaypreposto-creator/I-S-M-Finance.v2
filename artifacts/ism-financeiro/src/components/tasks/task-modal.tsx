import {useState, useRef, useEffect} from "react";
import {
    X, Plus, CheckSquare, Square, Upload, GripVertical, Trash2,
    Send, Clock, Tag, ListChecks, Paperclip, Bold, Italic, List, ListOrdered
} from "lucide-react";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {DISCARD_PROMPT} from "@/hooks/use-escape-close";
import {Modal, ModalBody, ModalFooter, ModalHeader, modalBtnPrimaryCls, modalBtnSecondaryCls, modalGrid2Cls} from "@/components/ui/modal-responsivo";
import {SelectCampo} from "@/components/ui/select-campo";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ChecklistItem = { id: string; texto: string; completed: boolean };
type Departamento = { value: string; label: string };

// ─── Constantes ───────────────────────────────────────────────────────────────
const DEPARTAMENTOS: Departamento[] = [
    {value: "financeiro", label: "Financeiro"},
    {value: "operacional", label: "Operacional"},
    {value: "contabil", label: "Contábil"},
    {value: "diretoria", label: "Diretoria"},
    {value: "rh_dp", label: "RH/DP"},
    {value: "administrativo", label: "Administrativo"},
];

const COLUNAS = [
    {value: "solicitado", label: "Solicitado"},
    {value: "em_analise", label: "Em Análise"},
    {value: "em_execucao", label: "Em Execução"},
    {value: "aguardando_aprovacao", label: "Aguardando"},
    {value: "concluido", label: "Concluído"},
];

const PRIORIDADES = [
    {
        value: "urgente",
        label: "URGENTE",
        bg: "bg-red-600",
        text: "text-white",
        border: "border-red-500",
        desc: "Precisa de atenção imediata"
    },
    {
        value: "alta",
        label: "ALTA",
        bg: "bg-[#D4A574]",
        text: "text-[#4A3728]",
        border: "border-[#C49A6C]",
        desc: "Prioridade alta"
    },
    {
        value: "media",
        label: "MÉDIA",
        bg: "bg-blue-600",
        text: "text-white",
        border: "border-blue-500",
        desc: "Prioridade moderada"
    },
    {
        value: "baixa",
        label: "BAIXA",
        bg: "bg-green-800",
        text: "text-green-300",
        border: "border-green-700",
        desc: "Pode esperar"
    },
];

// ─── Props ────────────────────────────────────────────────────────────────────
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
    /** Dados existentes - presentes quando mode === "edit" */
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
    /** Coluna pré-selecionada ao criar via botão "+" de uma coluna específica */
    defaultColuna?: string;
    /** "create" (padrão) ou "edit" */
    mode?: "create" | "edit";
    /** Esconde o botão de gravar quando a ação não é permitida. */
    podeSalvar?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyForm(defaultColuna = "solicitado") {
    return {
        titulo: "",
        descricao: "",
        prioridade: "media",
        coluna: defaultColuna,
        prazo: "",
        departamentos: [] as string[],
        checklist: [] as ChecklistItem[],
        tags: [] as string[],
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
                              podeSalvar = true,
                          }: TaskModalProps) {

    // Estado do formulário - inicializado de forma lazy para evitar re-render desnecessário
    const [titulo, setTitulo] = useState(initialData?.titulo ?? "");
    const [descricao, setDescricao] = useState(initialData?.descricao ?? "");
    const [prioridade, setPrioridade] = useState(initialData?.prioridade ?? "media");
    const [coluna, setColuna] = useState(initialData?.coluna ?? defaultColuna);
    const [prazo, setPrazo] = useState(initialData?.prazo ?? "");
    const [departamentos, setDepartamentos] = useState<string[]>(initialData?.departamentos ?? []);
    const [checklist, setChecklist] = useState<ChecklistItem[]>(initialData?.checklist ?? []);
    const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);

    // Auxiliares de UI
    const [novaTag, setNovaTag] = useState("");
    const [novoChecklist, setNovoChecklist] = useState("");
    const [showNovaTag, setShowNovaTag] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const {confirm, ConfirmDialogProps} = useConfirm();

    /**
     * Sempre que o modal abrir, sincroniza os campos:
     * - modo "edit"   -> preenche com initialData
     * - modo "create" -> reseta para formulário vazio respeitando defaultColuna
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
            // Criação - limpa tudo e aplica coluna default
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

    function isFormDirty() {
        const baseTitulo = mode === "edit" && initialData ? initialData.titulo : "";
        const baseDesc = mode === "edit" && initialData ? (initialData.descricao ?? "") : "";
        const basePrioridade = mode === "edit" && initialData ? (initialData.prioridade ?? "media") : "media";
        const baseColuna = mode === "edit" && initialData ? (initialData.coluna ?? defaultColuna) : defaultColuna;
        const basePrazo = mode === "edit" && initialData ? (initialData.prazo ?? "") : "";
        return (
            titulo !== baseTitulo ||
            descricao !== baseDesc ||
            prioridade !== basePrioridade ||
            coluna !== baseColuna ||
            prazo !== basePrazo ||
            novaTag !== "" ||
            novoChecklist !== ""
        );
    }

    async function handleRequestClose() {
        if (isFormDirty()) {
            const ok = await confirm(DISCARD_PROMPT);
            if (!ok) return;
        }
        onClose();
    }

    // ── Checklist ──────────────────────────────────────────────────────────────
    const handleAddChecklist = () => {
        if (!novoChecklist.trim()) return;
        setChecklist(prev => [
            ...prev,
            {id: Date.now().toString(), texto: novoChecklist.trim(), completed: false},
        ]);
        setNovoChecklist("");
    };

    const toggleChecklist = (id: string) =>
        setChecklist(prev => prev.map(item =>
            item.id === id ? {...item, completed: !item.completed} : item
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
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOver(false);
    };
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOver(true);
    };
    const handleDragLeave = () => setIsDraggingOver(false);

    // ── Submit ─────────────────────────────────────────────────────────────────
    const handleSubmit = () => {
        if (!titulo.trim()) return;
        onSave({titulo, descricao, prioridade, coluna, prazo: prazo || null, departamentos, checklist, tags});
        // onClose é chamado pelo pai após onSave; não fechamos aqui para evitar duplo-fechamento
    };

    // ─── Labels dinâmicos por modo ─────────────────────────────────────────────
    const modalTitle = mode === "edit" ? "Editar Tarefa" : "Nova Solicitação";
    const submitLabel = mode === "edit" ? "Salvar Alterações" : "Criar Tarefa";
    const colunaLabel = mode === "edit" ? "Mover para" : "Coluna Inicial";

    if (!open) return null;

    const labelCls = "text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block";
    const fieldCls = "w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none";

    return (
        <Modal onClose={() => void handleRequestClose()}>
            <ModalHeader title={modalTitle}/>

            <ModalBody>
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20em] gap-x-[1.8em] gap-y-[1.4em]">

                    {/* Coluna principal */}
                    <div className="min-w-0 space-y-6">
                        <div className={modalGrid2Cls}>
                            {/* Título */}
                            <div className="col-span-full">
                                <label htmlFor="tarefa-titulo" className={labelCls}>Título da Tarefa</label>
                                <input
                                    id="tarefa-titulo"
                                    type="text"
                                    value={titulo}
                                    onChange={e => setTitulo(e.target.value)}
                                    placeholder="Digite o título da solicitação..."
                                    className={fieldCls}
                                />
                            </div>

                            {/* Descrição */}
                            <div className="col-span-full">
                                <div className="flex items-center justify-between mb-2">
                                    <label htmlFor="tarefa-descricao" className={cn(labelCls, "mb-0")}>Descrição</label>
                                    <div className="flex gap-1">
                                        <button type="button" aria-label="Negrito" className="p-1 hover:bg-white/10 rounded"><Bold
                                            aria-hidden="true" className="w-4 h-4 text-gray-500"/></button>
                                        <button type="button" aria-label="Itálico" className="p-1 hover:bg-white/10 rounded"><Italic
                                            aria-hidden="true" className="w-4 h-4 text-gray-500"/></button>
                                        <button type="button" aria-label="Lista" className="p-1 hover:bg-white/10 rounded"><List
                                            aria-hidden="true" className="w-4 h-4 text-gray-500"/></button>
                                        <button type="button" aria-label="Lista numerada" className="p-1 hover:bg-white/10 rounded"><ListOrdered
                                            aria-hidden="true" className="w-4 h-4 text-gray-500"/></button>
                                    </div>
                                </div>
                                <textarea
                                    id="tarefa-descricao"
                                    value={descricao}
                                    onChange={e => setDescricao(e.target.value)}
                                    placeholder="Adicione uma descrição detalhada..."
                                    rows={5}
                                    className={cn(fieldCls, "resize-none")}
                                />
                            </div>

                            {/* Prioridade */}
                            <div className="col-span-full" role="group" aria-labelledby="tarefa-prioridade-label">
                                <span id="tarefa-prioridade-label" className={cn(labelCls, "mb-3")}>Prioridade</span>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {PRIORIDADES.map(p => (
                                        <button
                                            key={p.value}
                                            type="button"
                                            aria-pressed={prioridade === p.value}
                                            onClick={() => setPrioridade(p.value)}
                                            className={cn(
                                                "p-3 rounded-xl border transition-all text-center",
                                                prioridade === p.value
                                                    ? `${p.bg} ${p.text} ${p.border} shadow-lg`
                                                    : "bg-[#1A1A1A] border-white/10 text-gray-400 hover:border-white/30"
                                            )}
                                        >
                                            <div className="font-bold text-sm">{p.label}</div>
                                            <div
                                                className={cn("text-xs mt-1", prioridade === p.value ? "opacity-80" : "text-gray-500")}>
                                                {p.desc}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Prazo + Coluna */}
                            <div>
                                <label htmlFor="tarefa-prazo" className={labelCls}>
                                    <Clock aria-hidden="true" className="w-3 h-3 inline mr-1"/>
                                    Data de Vencimento
                                </label>
                                <input
                                    id="tarefa-prazo"
                                    type="date"
                                    value={prazo ?? ""}
                                    onChange={e => setPrazo(e.target.value)}
                                    className={fieldCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="tarefa-coluna" className={labelCls}>{colunaLabel}</label>
                                <SelectCampo
                                    id="tarefa-coluna"
                                    value={coluna}
                                    onChange={setColuna}
                                    opcoes={COLUNAS.map((c) => ({value: c.value, label: c.label}))}
                                />
                            </div>
                        </div>

                        {/* Departamentos + Tags */}
                        <div role="group" aria-labelledby="tarefa-departamentos-label">
                            <span id="tarefa-departamentos-label" className={cn(labelCls, "mb-3")}>
                                <Tag aria-hidden="true" className="w-3 h-3 inline mr-1"/>
                                Departamentos
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {DEPARTAMENTOS.map(d => (
                                    <button
                                        key={d.value}
                                        type="button"
                                        aria-pressed={departamentos.includes(d.value)}
                                        onClick={() => toggleDepartamento(d.value)}
                                        className={cn(
                                            "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                                            departamentos.includes(d.value)
                                                ? "bg-blue-600 border-blue-500 text-white"
                                                : "bg-[#1A1A1A] border-white/10 text-gray-400 hover:border-white/30"
                                        )}
                                    >
                                        {departamentos.includes(d.value) &&
                                            <CheckSquare aria-hidden="true" className="w-4 h-4 inline mr-2"/>}
                                        {d.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    aria-expanded={showNovaTag}
                                    onClick={() => setShowNovaTag(v => !v)}
                                    className="px-4 py-2 rounded-lg border border-dashed border-white/20 text-gray-400 hover:border-white/40 hover:text-white text-sm font-medium transition-all"
                                >
                                    <Plus aria-hidden="true" className="w-4 h-4 inline mr-1"/>
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
                                        aria-label="Nova tag"
                                        className="flex-1 bg-[#1A1A1A] border-white/10 h-auto py-2"
                                    />
                                    <Button onClick={handleAddTag} size="sm" className="bg-blue-600 hover:bg-blue-700 h-auto py-2">
                                        Adicionar
                                    </Button>
                                </div>
                            )}

                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {tags.map((tag, i) => (
                                        <span key={i}
                                              className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-gray-700 text-gray-300">
                                            {tag}
                                            <button type="button" aria-label={`Remover tag ${tag}`} onClick={() => removeTag(tag)}>
                                                <X aria-hidden="true" className="w-3 h-3"/>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Checklist */}
                        <div>
                            <span className={cn(labelCls, "mb-3")}>
                                <ListChecks aria-hidden="true" className="w-3 h-3 inline mr-1"/>
                                Checklist
                            </span>
                            <div className="space-y-2 mb-3">
                                {checklist.map(item => (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-3 bg-[#1A1A1A] p-3 rounded-lg border border-white/5 group"
                                    >
                                        <GripVertical aria-hidden="true" className="w-4 h-4 text-gray-600 cursor-grab"/>
                                        <button type="button" role="checkbox" aria-checked={item.completed}
                                                aria-label={item.texto} onClick={() => toggleChecklist(item.id)}>
                                            {item.completed
                                                ? <CheckSquare aria-hidden="true" className="w-5 h-5 text-green-500"/>
                                                : <Square aria-hidden="true" className="w-5 h-5 text-gray-500"/>}
                                        </button>
                                        <span
                                            className={cn("flex-1 text-sm", item.completed && "line-through text-gray-500")}>
                                            {item.texto}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label={`Remover item ${item.texto}`}
                                            onClick={() => removeChecklist(item.id)}
                                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                                        >
                                            <Trash2 aria-hidden="true" className="w-4 h-4 text-red-500"/>
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
                                    aria-label="Novo item do checklist"
                                    className="flex-1 bg-[#1A1A1A] border-white/10 h-auto py-2"
                                />
                                <Button onClick={handleAddChecklist} size="sm" variant="secondary" aria-label="Adicionar item"
                                        className="h-auto py-2">
                                    <Plus aria-hidden="true" className="w-4 h-4"/>
                                </Button>
                            </div>
                        </div>
                    </div>
                    {/* /coluna principal */}

                    {/* Coluna lateral */}
                    <div className="min-w-0 p-6 rounded-xl border border-white/10 bg-[#1A1A1A] self-start">
                        <span className={cn(labelCls, "mb-3")}>
                            <Paperclip aria-hidden="true" className="w-3 h-3 inline mr-1"/>
                            Anexos
                        </span>
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="Anexar arquivos"
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    fileInputRef.current?.click();
                                }
                            }}
                            className={cn(
                                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                                isDraggingOver
                                    ? "border-blue-500 bg-blue-500/10"
                                    : "border-white/20 hover:border-white/40"
                            )}
                        >
                            <Upload aria-hidden="true" className="w-8 h-8 text-gray-500 mx-auto mb-3"/>
                            <p className="text-sm text-gray-400 mb-1">Arraste arquivos aqui</p>
                            <p className="text-xs text-gray-600">ou clique para selecionar</p>
                        </div>
                        <input ref={fileInputRef} type="file" multiple className="hidden"/>

                        {/* Resumo */}
                        <div className="mt-6">
                            <span className={cn(labelCls, "mb-3")}>Resumo</span>
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
                </div>
            </ModalBody>

            <ModalFooter hint="Esc fecha">
                <button type="button" onClick={() => void handleRequestClose()} className={modalBtnSecondaryCls}>
                    {podeSalvar ? "Cancelar" : "Fechar"}
                </button>
                {podeSalvar && (
                <button type="button" onClick={handleSubmit} disabled={!titulo.trim()} className={modalBtnPrimaryCls}>
                    <Send aria-hidden="true" className="w-4 h-4"/>
                    {submitLabel}
                </button>
                )}
            </ModalFooter>
            <ConfirmDialog {...ConfirmDialogProps} />
        </Modal>
    );
}
