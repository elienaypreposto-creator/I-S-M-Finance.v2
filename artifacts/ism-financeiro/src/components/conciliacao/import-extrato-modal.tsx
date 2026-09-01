import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {Loader2, Upload, X, FileSpreadsheet} from "lucide-react";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {DISCARD_PROMPT, useEscapeClose} from "@/hooks/use-escape-close";
import {ViewportOverlay} from "@/components/shared/viewport-overlay";

type ContaBancariaOption = {
    id: number;
    nome: string;
    banco: string | null;
    agencia: string | null;
    conta: string | null;
};

type PreAnaliseResponse = {
    total_linhas: number;
    ja_existentes: number;
    ja_conciliadas: number;
    novas: number;
    periodo_inicio: string;
    periodo_fim: string;
};

type ImportarExtratoResponse = {
    extrato: { id: number; arquivo_nome?: string | null };
    conciliacao: { id: number };
    linhas_ignoradas_duplicadas?: number;
    linhas_classificadas_automaticamente?: number;
};

type ImportExtratoModalProps = {
    open: boolean;
    onClose: () => void;
    onImported?: (extratoId: number) => void;
};

const importExtratoSchema = z.object({
    contaId: z.string().min(1, "Selecione a conta bancária."),
    arquivo: z
        .custom<File>((val) => val instanceof File, "Selecione um arquivo OFX.")
        .refine(
            (f) => f.name.split(".").pop()?.toLowerCase() === "ofx",
            "Apenas arquivos OFX são aceitos.",
        ),
});

type ImportExtratoForm = z.infer<typeof importExtratoSchema>;

export function ImportExtratoModal({open, onClose, onImported}: ImportExtratoModalProps) {
    const {toast} = useToast();
    const queryClient = useQueryClient();
    const [preAnalise, setPreAnalise] = useState<PreAnaliseResponse | null>(null);
    const [pendingForm, setPendingForm] = useState<ImportExtratoForm | null>(null);
    const {confirm, ConfirmDialogProps} = useConfirm();

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        getValues,
        formState: {errors},
    } = useForm<ImportExtratoForm>({
        resolver: zodResolver(importExtratoSchema),
        defaultValues: {contaId: ""},
    });

    useEffect(() => {
        if (open) {
            reset();
            setPreAnalise(null);
            setPendingForm(null);
        }
    }, [open, reset]);

    const {data: contas = [], isLoading: loadingContas} = useQuery<ContaBancariaOption[]>({
        queryKey: ["contas-bancarias"],
        queryFn: () => fetchApiData<ContaBancariaOption[]>("/contas-bancarias"),
        enabled: open,
    });

    const preAnaliseMutation = useMutation({
        mutationFn: async (data: ImportExtratoForm) => {
            const formData = new FormData();
            formData.append("conta_id", data.contaId);
            formData.append("arquivo", data.arquivo);
            return fetchApiData<PreAnaliseResponse>("/conciliacoes/pre-analise", {
                method: "POST",
                body: formData,
            });
        },
        onSuccess: (data, variables) => {
            setPreAnalise(data);
            setPendingForm(variables);
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Falha na pré-análise.";
            toast({variant: "destructive", title: "Erro na pré-análise", description: msg});
        },
    });

    const importMutation = useMutation({
        mutationFn: async (data: ImportExtratoForm) => {
            const formData = new FormData();
            formData.append("conta_id", data.contaId);
            formData.append("arquivo", data.arquivo);
            formData.append("apenas_novas", "true");
            return fetchApiData<ImportarExtratoResponse>("/conciliacoes/importar", {
                method: "POST",
                body: formData,
            });
        },
        onSuccess: (data) => {
            void queryClient.invalidateQueries({queryKey: ["conciliacoes"]});
            const dup = data.linhas_ignoradas_duplicadas ?? 0;
            const auto = data.linhas_classificadas_automaticamente ?? 0;
            const parts: string[] = [];
            if (auto > 0) parts.push(`${auto} classificada(s) automaticamente`);
            if (dup > 0) parts.push(`${dup} duplicata(s) ignorada(s)`);
            toast({
                title: "Importação concluída",
                description:
                    parts.length > 0
                        ? parts.join(" · ")
                        : "O extrato foi processado e está disponível na lista.",
            });
            reset();
            setPreAnalise(null);
            setPendingForm(null);
            onClose();
            onImported?.(data.extrato.id);
        },
        onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : "Falha ao importar o arquivo.";
            toast({variant: "destructive", title: "Erro na importação", description: msg});
        },
    });

    async function handleRequestClose() {
        const dirty = Boolean(getValues("arquivo")) || Boolean(preAnalise);
        if (dirty) {
            const ok = await confirm(DISCARD_PROMPT);
            if (!ok) return;
        }
        onClose();
    }

    useEscapeClose(open && !ConfirmDialogProps.open, () => {
        void handleRequestClose();
    });

    if (!open) return null;

    const onSubmit = (data: ImportExtratoForm) => {
        preAnaliseMutation.mutate(data);
    };

    const confirmarImportarNovas = () => {
        if (pendingForm) importMutation.mutate(pendingForm);
    };

    const arquivoSelecionado = watch("arquivo");
    const pending = preAnaliseMutation.isPending || importMutation.isPending;

    const inputCls =
        "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all";
    const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";
    const errorCls = "text-[10px] text-destructive mt-1 font-medium";

    return (
        <ViewportOverlay className="bg-black/70 backdrop-blur-md">
            <div className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <div>
                        <h2 className="text-lg font-bold text-white">Importar extrato</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Envie OFX da conta selecionada</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleRequestClose()}
                        className="p-2 rounded-xl text-muted-foreground hover:bg-white/5 hover:text-white transition-colors">
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                {!preAnalise ? (
                    <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-5">
                        <div>
                            <label className={labelCls}>Conta bancária *</label>
                            <select {...register("contaId")} disabled={loadingContas || pending} className={inputCls}>
                                <option value="">{loadingContas ? "Carregando contas…" : "Selecione a conta"}</option>
                                {contas.map((c) => (
                                    <option key={c.id} value={String(c.id)}>
                                        {c.nome}
                                        {c.agencia ? ` · Ag. ${c.agencia}` : ""}
                                        {c.conta ? ` · ${c.conta}` : ""}
                                    </option>
                                ))}
                            </select>
                            {errors.contaId && <p className={errorCls}>{errors.contaId.message}</p>}
                        </div>

                        <div>
                            <label className={labelCls}>Arquivo OFX *</label>
                            <label
                                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-8 cursor-pointer hover:border-primary/40 transition-colors">
                                <FileSpreadsheet className="w-8 h-8 text-muted-foreground"/>
                                <span className="text-xs text-white/80 text-center">
                  {arquivoSelecionado ? arquivoSelecionado.name : "Clique para escolher ou solte o arquivo aqui"}
                </span>
                                <input
                                    type="file"
                                    accept=".ofx,.OFX,application/x-ofx,application/vnd.intu.qfx"
                                    className="sr-only"
                                    disabled={pending}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) setValue("arquivo", f, {shouldValidate: true});
                                    }}
                                />
                            </label>
                            {errors.arquivo && <p className={errorCls}>{errors.arquivo.message}</p>}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => void handleRequestClose()}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5 transition-colors">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={pending}
                                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                                {preAnaliseMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin"/>
                                ) : (
                                    <Upload className="w-4 h-4"/>
                                )}
                                Analisar arquivo
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="p-5 space-y-4">
                        <p className="text-sm text-white/90 leading-relaxed">
                            Este arquivo tem <strong>{preAnalise.total_linhas}</strong> linhas;{" "}
                            <strong>{preAnalise.ja_existentes}</strong> já existem nesta conta
                            {preAnalise.ja_conciliadas > 0 ? ` (${preAnalise.ja_conciliadas} já tratadas)` : ""}.
                            {preAnalise.novas > 0 ? (
                                <>
                                    {" "}
                                    Importar apenas as <strong>{preAnalise.novas}</strong> novas?
                                </>
                            ) : (
                                <> Não há linhas novas para importar.</>
                            )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            Período {preAnalise.periodo_inicio} - {preAnalise.periodo_fim}
                        </p>
                        <div className="flex flex-col gap-2 pt-2">
                            <button
                                type="button"
                                disabled={pending || preAnalise.novas === 0}
                                onClick={confirmarImportarNovas}
                                className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                                {importMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                                Importar apenas as {preAnalise.novas} novas
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreAnalise(null);
                                    setPendingForm(null);
                                }}
                                className="w-full py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5">
                                Voltar
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleRequestClose()}
                                className="w-full py-2.5 rounded-xl text-sm text-muted-foreground hover:text-white">
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <ConfirmDialog {...ConfirmDialogProps} />
        </ViewportOverlay>
    );
}
