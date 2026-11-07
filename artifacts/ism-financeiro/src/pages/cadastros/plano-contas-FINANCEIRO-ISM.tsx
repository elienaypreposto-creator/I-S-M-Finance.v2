import {tenantQueryKey} from "@/lib/tenant-query";
import {useState, useMemo} from "react";
import {useForm, useWatch, Controller} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";
import {PageHeader} from "@/components/shared/page-header";
import {Plus, Lock, ChevronDown, ChevronUp} from "lucide-react";
import {limparNome, normalizarNome} from "@/lib/nomes";
import {acharPlanoDuplicado, categoriaExistente, grupoDreCompativel} from "@/lib/plano-contas-regras";
import {BotaoEditar, BotaoExcluir} from "@/components/shared/botoes-acao";
import {useQuery, useMutation, useQueryClient} from "@tanstack/react-query";
import {useToast} from "@/hooks/use-toast";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {fetchApi, fetchApiData} from "@/lib/api-config";
import {DISCARD_PROMPT} from "@/hooks/use-escape-close";
import {cn} from "@/lib/utils";
import {SelectCampo} from "@/components/ui/select-campo";
import {
    Modal,
    ModalBody,
    ModalFooter,
    ModalForm,
    ModalHeader,
    modalBtnPrimaryCls,
    modalBtnSecondaryCls,
    modalGridCls,
} from "@/components/ui/modal-responsivo";
import {
    CampoBusca,
    FiltrosAtivos,
    FiltrosPopover,
    casaMulti,
    contemBusca,
    useFiltrosNaUrl,
    type DefinicaoFiltro,
} from "@/components/shared/filtros";

// Filtros da tela (ISMF-33): valores reais do campo `tipo` do plano de contas.
const DEFINICOES_FILTROS: DefinicaoFiltro[] = [
    {
        chave: "tipo",
        rotulo: "Tipo",
        tipo: "multi",
        opcoes: [
            {valor: "receita", rotulo: "Receita"},
            {valor: "custo", rotulo: "Custo"},
            {valor: "despesa", rotulo: "Despesa"},
        ],
    },
];

type PlanoConta = {
    id: number;
    tipo: string;
    categoria: string;
    subcategoria: string | null;
    grupo_dre: string | null;
    ativo: boolean;
};

// Linha da DRE Gerencial onde a conta entra. Vazio = segue o tipo (receita, custo, despesa).
const ROTULO_GRUPO_DRE_AUTOMATICO = "Automático (segue o tipo)";
const OPCOES_GRUPO_DRE = [
    {value: "", label: ROTULO_GRUPO_DRE_AUTOMATICO},
    {value: "receita", label: "Receita bruta"},
    {value: "deducao", label: "Dedução da receita (impostos sobre faturamento)"},
    {value: "custo", label: "Custo dos serviços prestados"},
    {value: "despesa", label: "Despesa operacional"},
    {value: "fora", label: "Fora da DRE (empréstimo, aporte, investimento, retenção repassada)"},
];
const ROTULO_CURTO_GRUPO_DRE: Record<string, string> = {
    receita: "Receita bruta",
    deducao: "Dedução",
    custo: "Custo",
    despesa: "Despesa",
    fora: "Fora da DRE",
};

// Comparador alfabético
const collator = new Intl.Collator("pt-BR", {sensitivity: "base"});

const planoContaFormSchema = z.object({
    tipo: z.enum(["receita", "custo", "despesa"], {
        required_error: "Selecione o tipo.",
        invalid_type_error: "Tipo inválido.",
    }),
    categoria: z.string().trim().min(1, "Categoria é obrigatória."),
    subcategoria: z.string().trim().optional().default(""),
    grupo_dre: z.enum(["", "receita", "deducao", "custo", "despesa", "fora"]).default(""),
}).refine((v) => grupoDreCompativel(v.tipo, v.grupo_dre), {
    path: ["grupo_dre"],
    message: "Esta linha da DRE não combina com o tipo escolhido.",
});

type PlanoContaFormValues = z.infer<typeof planoContaFormSchema>;

type FormModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { id?: number } & PlanoContaFormValues) => void;
    initialData?: Partial<PlanoConta> | null;
    lockedTipo?: boolean;
    lockedCategoria?: boolean;
};

// Modal simples para formulário de Conta
function FormModal({
                       isOpen,
                       onClose,
                       onSubmit,
                       initialData,
                       lockedTipo = false,
                       lockedCategoria = false,
                   }: FormModalProps) {
    const {confirm, ConfirmDialogProps} = useConfirm();
    const {
        register,
        control,
        handleSubmit,
        setValue,
        getValues,
        formState: {errors, isDirty},
    } = useForm<PlanoContaFormValues>({
        resolver: zodResolver(planoContaFormSchema),
        defaultValues: {
            tipo: (initialData?.tipo as PlanoContaFormValues["tipo"]) ?? "despesa",
            categoria: initialData?.categoria ?? "",
            subcategoria: initialData?.subcategoria ?? "",
            grupo_dre: (initialData?.grupo_dre as PlanoContaFormValues["grupo_dre"]) ?? "",
        },
    });

    // Só as linhas da DRE coerentes com o tipo (receita não vai para despesa etc.).
    const tipoAtual = useWatch({control, name: "tipo"});
    const opcoesGrupoDre = OPCOES_GRUPO_DRE.filter((o) => grupoDreCompativel(tipoAtual, o.value));

    function handleTipoChange(novoTipo: string, onChange: (v: string) => void) {
        onChange(novoTipo);
        // Trocar o tipo apaga a linha da DRE que deixou de combinar.
        if (!grupoDreCompativel(novoTipo, getValues("grupo_dre"))) {
            setValue("grupo_dre", "", {shouldDirty: true, shouldValidate: true});
        }
    }

    async function handleRequestClose() {
        if (isDirty) {
            const ok = await confirm(DISCARD_PROMPT);
            if (!ok) return;
        }
        onClose();
    }

    if (!isOpen) return null;

    return (
        <Modal
            onClose={() => void handleRequestClose()}
            // Ao adicionar subcategoria (tipo e categoria travados), o foco vai direto para a subcategoria.
            initialFocus={lockedCategoria
                ? (content) => content.querySelector<HTMLElement>("#plano-conta-subcategoria")
                : "first-field"}
        >
            <ModalHeader
                title={initialData?.id
                    ? 'Editar Categoria'
                    : lockedCategoria
                        ? 'Nova Subcategoria'
                        : 'Nova Categoria'}
            />

            <ModalForm
                onSubmit={handleSubmit((values) => onSubmit({id: initialData?.id, ...values}))}
                noValidate
            >
                <ModalBody>
                    <div className={modalGridCls}>
                        {/* Tipo */}
                        <div>
                            <label htmlFor="plano-conta-tipo"
                                   className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                Tipo
                                {lockedTipo && <Lock aria-hidden="true" className="w-3 h-3 text-red-400"/>}
                            </label>
                            <Controller
                                name="tipo"
                                control={control}
                                render={({field}) => (
                                    <SelectCampo
                                        id="plano-conta-tipo"
                                        value={field.value}
                                        disabled={lockedTipo}
                                        aria-invalid={!!errors.tipo}
                                        aria-describedby={lockedTipo ? "plano-conta-tipo-travado" : undefined}
                                        className={cn("mt-1", lockedTipo && "border-red-400/30 text-white/70")}
                                        onBlur={field.onBlur}
                                        onChange={(v) => handleTipoChange(v, field.onChange)}
                                        opcoes={[
                                            {value: "receita", label: "Receita"},
                                            {value: "custo", label: "Custo"},
                                            {value: "despesa", label: "Despesa"},
                                        ]}
                                    />
                                )}
                            />
                            {lockedTipo && (
                                <p id="plano-conta-tipo-travado" className="text-xs text-red-400/80 mt-1">Tipo travado pelo grupo selecionado</p>
                            )}
                            {errors.tipo && (
                                <p className="text-xs text-destructive mt-1">{errors.tipo.message}</p>
                            )}
                        </div>

                        {/* Categoria */}
                        <div>
                            <label htmlFor="plano-conta-categoria"
                                   className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                Grupo Principal (Categoria)
                                {lockedCategoria && <Lock aria-hidden="true" className="w-3 h-3 text-red-400"/>}
                            </label>
                            <input
                                id="plano-conta-categoria"
                                type="text"
                                {...register("categoria")}
                                readOnly={lockedCategoria}
                                aria-invalid={!!errors.categoria}
                                aria-describedby={lockedCategoria ? "plano-conta-categoria-travada" : undefined}
                                className={`mt-1 w-full border rounded-lg p-2.5 outline-none focus:border-primary/50 transition-colors ${
                                    lockedCategoria
                                        ? 'bg-white/5 border-red-400/30 text-white/70 cursor-not-allowed'
                                        : errors.categoria
                                            ? 'bg-black/20 border-destructive/60 text-white'
                                            : 'bg-black/20 border-white/10 text-white'
                                }`}
                                placeholder="Ex: Despesas Administrativas"
                            />
                            {lockedCategoria && (
                                <p id="plano-conta-categoria-travada" className="text-xs text-red-400/80 mt-1">Categoria travada - você está adicionando uma
                                    subcategoria</p>
                            )}
                            {errors.categoria && (
                                <p className="text-xs text-destructive mt-1">{errors.categoria.message}</p>
                            )}
                        </div>

                        {/* Subcategoria */}
                        <div>
                            <label htmlFor="plano-conta-subcategoria" className="text-sm font-medium text-muted-foreground">Subcategoria (Opcional)</label>
                            <input
                                id="plano-conta-subcategoria"
                                type="text"
                                {...register("subcategoria")}
                                className="mt-1 w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white outline-none focus:border-primary/50"
                                placeholder="Ex: Aluguel"
                            />
                        </div>

                        {/* Linha da DRE */}
                        <div>
                            <label htmlFor="plano-conta-grupo-dre" className="text-sm font-medium text-muted-foreground">Linha da DRE</label>
                            <Controller
                                name="grupo_dre"
                                control={control}
                                render={({field}) => (
                                    <SelectCampo
                                        id="plano-conta-grupo-dre"
                                        value={field.value}
                                        aria-invalid={!!errors.grupo_dre}
                                        aria-describedby="plano-conta-grupo-dre-ajuda"
                                        className="mt-1"
                                        onBlur={field.onBlur}
                                        onChange={field.onChange}
                                        // Vazio é escolha válida (segue o tipo) e precisa poder voltar a ele.
                                        permitirVazio
                                        placeholder={ROTULO_GRUPO_DRE_AUTOMATICO}
                                        opcoes={opcoesGrupoDre}
                                    />
                                )}
                            />
                            <p id="plano-conta-grupo-dre-ajuda" className="text-xs text-muted-foreground/80 mt-1">
                                Em que linha a conta aparece na DRE Gerencial. Sem escolha, segue o tipo. Pode ser alterada mesmo com lançamentos.
                            </p>
                            {errors.grupo_dre && (
                                <p className="text-xs text-destructive mt-1">{errors.grupo_dre.message}</p>
                            )}
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter hint="Esc fecha">
                    <button type="button" onClick={() => void handleRequestClose()} className={modalBtnSecondaryCls}>
                        Cancelar
                    </button>
                    <button type="submit" className={modalBtnPrimaryCls}>
                        Salvar
                    </button>
                </ModalFooter>
            </ModalForm>
            <ConfirmDialog {...ConfirmDialogProps} />
        </Modal>
    );
}

export default function PlanoContas() {
    const queryClient = useQueryClient();
    const {toast} = useToast();
    const {confirm, ConfirmDialogProps} = useConfirm();

    const [modal, setModal] = useState<{
        open: boolean;
        data: PlanoConta | null;
        key: number;
        lockedTipo: boolean;
        lockedCategoria: boolean;
    }>({
        open: false,
        data: null,
        key: 0,
        lockedTipo: false,
        lockedCategoria: false,
    });

    type TipoPlano = "receita" | "custo" | "despesa";
    const [tiposAbertos, setTiposAbertos] = useState<Record<TipoPlano, boolean>>({
        receita: true,
        custo: true,
        despesa: true,
    });
    const [catsAbertas, setCatsAbertas] = useState<Record<string, boolean>>({});

    const {data: contas = [], isLoading} = useQuery<PlanoConta[]>({
        queryKey: tenantQueryKey('plano-contas'),
        queryFn: () => fetchApiData("/plano-contas")
    });

    const nomeConta = (c: { categoria: string; subcategoria?: string | null }) =>
        c.subcategoria ? `${c.categoria} / ${c.subcategoria}` : c.categoria;

    type PlanoContaPayload = {
        id?: number;
        tipo: string;
        categoria: string;
        subcategoria: string | null;
        grupo_dre: string | null;
    };

    const saveMutation = useMutation({
        mutationFn: (data: PlanoContaPayload) => {
            const method = data.id ? 'PUT' : 'POST';
            const path = data.id ? `/plano-contas/${data.id}` : "/plano-contas";
            return fetchApi(path, {
                method,
                body: JSON.stringify(data)
            });
        },
        onSuccess: (_, data) => {
            queryClient.invalidateQueries({queryKey: tenantQueryKey('plano-contas')});
            setModal(prev => ({...prev, open: false, data: null}));
            toast({
                title: data.id ? 'Categoria atualizada' : 'Categoria criada',
                description: `"${nomeConta(data)}" foi salva.`,
            });
        },
        onError: (error) => {
            toast({variant: 'destructive', title: 'Erro ao salvar', description: error.message});
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => fetchApi(`/plano-contas/${id}`, {method: 'DELETE'}),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({queryKey: tenantQueryKey('plano-contas')});
            const removida = contas.find((c) => c.id === id);
            toast({
                title: 'Categoria removida',
                description: removida ? `"${nomeConta(removida)}" foi excluída.` : 'Excluída com sucesso.',
            });
        },
        onError: async (error: Error) => {
            const vinculada = /vincul|em uso|associad|relacionad/i.test(error.message);
            await confirm({
                title: vinculada ? 'Não é possível excluir' : 'Erro ao excluir',
                description: vinculada
                    ? 'Categorias com lançamentos vinculados não podem ser removidas.'
                    : error.message,
                confirmLabel: 'Entendi',
                variant: vinculada ? 'default' : 'destructive',
            });
        }
    });

    const handleCreate = (tipoDef?: string) => {
        setModal(prev => ({
            open: true,
            data: tipoDef ? {tipo: tipoDef} as any : null,
            key: prev.key + 1,
            lockedTipo: !!tipoDef,
            lockedCategoria: false,
        }));
    };

    const handleAddSubcategoria = (categoria: string, tipo: string) => {
        setModal(prev => ({
            open: true,
            data: {tipo, categoria} as any,
            key: prev.key + 1,
            lockedTipo: true,
            lockedCategoria: true,
        }));
    };

    const handleEdit = (item: PlanoConta) => {
        setModal(prev => ({
            open: true,
            data: item,
            key: prev.key + 1,
            lockedTipo: false,
            lockedCategoria: false,
        }));
    };

    const handleDelete = async (cat: PlanoConta) => {
        const label = cat.subcategoria
            ? `"${cat.subcategoria.toUpperCase()}"`
            : `"${cat.categoria.toUpperCase()}"`;
        const ok = await confirm({
            title: `Excluir ${label}?`,
            description: 'Esta ação não pode ser desfeita. A categoria será removida permanentemente.',
            confirmLabel: 'Excluir',
            cancelLabel: 'Cancelar',
            variant: 'destructive',
        });
        if (ok) deleteMutation.mutate(cat.id);
    };

    // Duplicata = mesmo tipo + categoria + subcategoria (sem caixa/acento/espaços),
    // sem contar o próprio registro. Irmãos do mesmo grupo não são duplicata.
    const handleSubmit = (data: { id?: number } & PlanoContaFormValues) => {
        const categoriaDigitada = limparNome(data.categoria);
        // Conta nova cai no grupo existente com a grafia já cadastrada.
        const categoria = data.id
            ? categoriaDigitada
            : categoriaExistente(contas, data.tipo, categoriaDigitada) ?? categoriaDigitada;
        const subcategoria = limparNome(data.subcategoria) || null;

        const duplicada = acharPlanoDuplicado(contas, {id: data.id, tipo: data.tipo, categoria, subcategoria});
        if (duplicada) {
            toast({
                variant: 'destructive',
                title: 'Categoria duplicada',
                description: `Já existe "${nomeConta(duplicada)}" neste tipo do plano de contas.`,
            });
            return;
        }

        saveMutation.mutate({
            id: data.id,
            tipo: data.tipo,
            categoria,
            subcategoria,
            grupo_dre: data.grupo_dre || null,
        });
    };

    // ── Filtros na URL (?tipo=receita,custo&q=) aplicados no navegador ──
    const filtros = useFiltrosNaUrl(DEFINICOES_FILTROS);
    const busca = filtros.ler("q");
    const filtroTipo = filtros.valores.tipo;
    const tipoVisivel = (tipo: TipoPlano) => casaMulti(filtroTipo, tipo);

    const contasFiltradas = useMemo(
        () => contas.filter((c) => contemBusca(busca, c.categoria, c.subcategoria)),
        [contas, busca],
    );

    const receitas = contasFiltradas.filter(c => c.tipo === 'receita');
    const custos = contasFiltradas.filter(c => c.tipo === 'custo');
    const despesas = contasFiltradas.filter(c => c.tipo === 'despesa');

    const totalVisivel = contasFiltradas.filter((c) => casaMulti(filtroTipo, c.tipo)).length;
    const temFiltroOuBusca = filtros.contagem > 0 || Boolean(busca);
    const nenhumTipoVisivel = !(['receita', 'custo', 'despesa'] as TipoPlano[]).some(tipoVisivel);
    const anuncio = isLoading
        ? ''
        : `${totalVisivel} ${totalVisivel === 1 ? 'item do plano de contas encontrado' : 'itens do plano de contas encontrados'}`;

    const isCatAberta = (tipo: string, categoria: string) =>
        catsAbertas[`${tipo}:${normalizarNome(categoria)}`] !== false;

    const toggleCat = (tipo: string, categoria: string) => {
        const key = `${tipo}:${normalizarNome(categoria)}`;
        setCatsAbertas((prev) => ({...prev, [key]: prev[key] === false}));
    };

    // Agrupa por categoria normalizada (mesma regra da duplicata: sem caixa/acento/espaços)
    const groupByCategoriaOrdenado = (items: PlanoConta[]) => {
        const grouped: Record<string, { label: string; items: PlanoConta[] }> = {};

        items.forEach(item => {
            const key = normalizarNome(item.categoria);
            const labelLimpo = limparNome(item.categoria);
            if (!grouped[key]) {
                grouped[key] = {label: labelLimpo, items: []};
            }
            grouped[key].items.push(item);
        });

        Object.values(grouped).forEach(group => {
            group.items.sort((a, b) =>
                collator.compare((a.subcategoria || "").trim(), (b.subcategoria || "").trim())
            );
        });

        return Object.values(grouped)
            .sort((a, b) => collator.compare(a.label, b.label))
            .map(group => [group.label, group.items] as [string, PlanoConta[]]);
    };

    const renderSection = (title: string, tipoCode: string, colorConfig: any, items: PlanoConta[], tipoDef: TipoPlano) => {
        const groupedEntries = groupByCategoriaOrdenado(items);
        const tipoAberto = tiposAbertos[tipoDef];

        return (
            <div className={`glass-panel rounded-2xl overflow-hidden ${colorConfig.border}`}>
                <div
                    className={`${colorConfig.bg} p-4 border-b ${colorConfig.borderHeader} flex justify-between items-center`}>
                    <button
                        type="button"
                        onClick={() => setTiposAbertos((s) => ({...s, [tipoDef]: !s[tipoDef]}))}
                        className={`flex items-center gap-2 font-bold ${colorConfig.text} hover:opacity-90 transition-opacity`}
                        aria-expanded={tipoAberto}
                    >
                        {tipoAberto
                            ? <ChevronUp className="w-4 h-4 shrink-0"/>
                            : <ChevronDown className="w-4 h-4 shrink-0"/>}
                        <h3>{title}</h3>
                    </button>
                    <span
                        className={`text-xs ${colorConfig.bgBadge} ${colorConfig.textBadge} px-2 py-1 rounded`}>Grupo {tipoCode}</span>
                </div>

                {tipoAberto && (
                <div className="p-4 space-y-4">
                    {isLoading ? (
                        <div className="text-sm text-muted-foreground animate-pulse p-2">Carregando...</div>
                    ) : groupedEntries.length === 0 ? (
                        <div className="text-sm text-muted-foreground p-4 text-center">
                            {busca ? 'Nenhum resultado para os filtros aplicados.' : 'Nenhuma categoria cadastrada'}
                        </div>
                    ) : (
                        groupedEntries.map(([categoria, subcontas]) => {
                            const catAberta = isCatAberta(tipoDef, categoria);
                            return (
                            <div key={categoria} className="space-y-1">
                                <div
                                    className="flex items-center justify-between pl-2 mb-2 border-l-2 border-white/20 group/cat">
                                    <button
                                        type="button"
                                        onClick={() => toggleCat(tipoDef, categoria)}
                                        className="flex items-center gap-1.5 text-sm font-bold text-white/80 capitalize hover:text-white transition-colors"
                                        aria-expanded={catAberta}
                                    >
                                        {catAberta
                                            ? <ChevronUp className="w-3.5 h-3.5 shrink-0 text-muted-foreground"/>
                                            : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground"/>}
                                        {categoria}
                                    </button>
                                    <button
                                        onClick={() => handleAddSubcategoria(categoria, tipoDef)}
                                        title="Adicionar subcategoria"
                                        className="p-1 rounded text-muted-foreground/70 hover:text-white hover:bg-white/10 transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5"/>
                                    </button>
                                </div>
                                {catAberta && subcontas.map(cat => (
                                    <div key={cat.id}
                                         className="p-3 bg-white/5 rounded-lg border border-white/5 flex justify-between items-center hover:bg-white/10 transition-colors group">
                                        <span className="flex items-center gap-2 min-w-0 pl-4">
                                            {cat.subcategoria?.trim() ? (
                                                <span className="text-sm font-medium text-white capitalize truncate max-w-[200px]">
                                                    {cat.subcategoria.trim()}
                                                </span>
                                            ) : (
                                                <span className="text-sm italic text-muted-foreground truncate max-w-[200px]">
                                                    Sem subcategoria
                                                </span>
                                            )}
                                            {cat.grupo_dre && ROTULO_CURTO_GRUPO_DRE[cat.grupo_dre] && (
                                                <span
                                                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground"
                                                    title="Linha da DRE">
                                                    DRE: {ROTULO_CURTO_GRUPO_DRE[cat.grupo_dre]}
                                                </span>
                                            )}
                                        </span>
                                        {/* Com mouse: aparecem no hover/foco. Toque (sem hover): sempre visíveis. */}
                                        <div
                                            className="flex gap-2 shrink-0 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
                                            <BotaoEditar onClick={() => handleEdit(cat)}/>
                                            <BotaoExcluir onClick={() => handleDelete(cat)}/>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            );
                        })
                    )}

                    <button onClick={() => handleCreate(tipoDef)}
                            className="w-full py-2 border-2 border-dashed border-white/10 rounded-lg text-sm text-muted-foreground hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2 mt-4">
                        <Plus className="w-4 h-4"/> Adicionar Categoria
                    </button>
                </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <ConfirmDialog {...ConfirmDialogProps} />

            <PageHeader
                title="Plano de Contas"
                description="Estrutura hierárquica de categorias financeiras para receitas, custos e despesas"
                actions={
                    <button onClick={() => handleCreate()}
                            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
                        <Plus className="w-4 h-4"/>
                        Nova Categoria
                    </button>
                }
            />

            {/* Barra de filtros: painel à esquerda, busca à direita */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 bg-black/10">
                    <div className="flex flex-wrap items-center gap-2">
                        <FiltrosPopover
                            definicoes={DEFINICOES_FILTROS}
                            valores={filtros.valores}
                            contagem={filtros.contagem}
                            onAplicar={filtros.aplicar}
                        />
                    </div>
                    <CampoBusca
                        valor={busca}
                        onBuscar={(termo) => filtros.atualizar({q: termo || null})}
                        placeholder="Buscar por categoria ou subcategoria…"
                        rotulo="Buscar no plano de contas por categoria ou subcategoria"
                    />
                </div>
                <FiltrosAtivos
                    chips={filtros.chips}
                    onRemover={filtros.remover}
                    onLimparTodos={filtros.limpar}
                    anuncio={anuncio}
                    className="border-b-0 border-t"
                />
            </div>

            {nenhumTipoVisivel && temFiltroOuBusca && (
                <div className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground">
                    Nenhum resultado para os filtros aplicados.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {tipoVisivel('receita') && renderSection('Receitas (+)', '1.0', {
                    border: 'border-teal-500/20',
                    bg: 'bg-teal-500/20',
                    borderHeader: 'border-teal-500/30',
                    text: 'text-teal-400',
                    bgBadge: 'bg-teal-500/20',
                    textBadge: 'text-teal-300'
                }, receitas, 'receita')}

                {tipoVisivel('custo') && renderSection('Custos (-)', '2.0', {
                    border: 'border-blue-500/20',
                    bg: 'bg-blue-500/20',
                    borderHeader: 'border-blue-500/30',
                    text: 'text-blue-400',
                    bgBadge: 'bg-blue-500/20',
                    textBadge: 'text-blue-300'
                }, custos, 'custo')}

                {tipoVisivel('despesa') && renderSection('Despesas (-)', '3.0', {
                    border: 'border-orange-500/20',
                    bg: 'bg-orange-500/20',
                    borderHeader: 'border-orange-500/30',
                    text: 'text-orange-400',
                    bgBadge: 'bg-orange-500/20',
                    textBadge: 'text-orange-300'
                }, despesas, 'despesa')}
            </div>

            <FormModal
                key={modal.key}
                isOpen={modal.open}
                onClose={() => setModal(prev => ({...prev, open: false, data: null}))}
                onSubmit={handleSubmit}
                initialData={modal.data}
                lockedTipo={modal.lockedTipo}
                lockedCategoria={modal.lockedCategoria}
            />
        </div>
    );
}