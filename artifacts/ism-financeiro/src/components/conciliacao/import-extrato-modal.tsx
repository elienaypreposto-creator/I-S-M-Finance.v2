import {tenantQueryKey} from "@/lib/tenant-query";
import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useForm, Controller} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {z} from "zod";
import {useToast} from "@/hooks/use-toast";
import {fetchApiData} from "@/lib/api-config";
import {Upload, FileSpreadsheet} from "lucide-react";
import {cn} from "@/lib/utils";
import {ConfirmDialog} from "@/components/shared/confirm-dialog";
import {useConfirm} from "@/hooks/use-confirm";
import {DISCARD_PROMPT} from "@/hooks/use-escape-close";
import {Modal, ModalBody, ModalFooter, ModalForm, ModalHeader, ModalSpinner, modalBtnPrimaryCls, modalBtnSecondaryCls, modalGrid2Cls} from "@/components/ui/modal-responsivo";
import {SelectCampo} from "@/components/ui/select-campo";

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
        control,
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
        queryKey: tenantQueryKey("contas-bancarias"),
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
            void queryClient.invalidateQueries({queryKey: tenantQueryKey("conciliacoes")});
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
    const labelCls = "text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";
    const errorCls = "text-xs text-destructive mt-1 font-medium";

    return (
        <Modal onClose={() => void handleRequestClose()}>
            <ModalHeader title="Importar extrato" description="Envie OFX da conta selecionada"/>

            {!preAnalise ? (
                <ModalForm onSubmit={handleSubmit(onSubmit)}>
                    <ModalBody>
                        <div className={modalGrid2Cls}>
                            <div>
                                <label htmlFor="import-extrato-conta" className={labelCls}>Conta bancária *</label>
                                <Controller
                                    name="contaId"
                                    control={control}
                                    render={({field}) => (
                                        <SelectCampo
                                            id="import-extrato-conta"
                                            value={field.value ?? ""}
                                            permitirVazio
                                            disabled={loadingContas || pending}
                                            aria-invalid={!!errors.contaId}
                                            placeholder={loadingContas ? "Carregando contas…" : "Selecione a conta"}
                                            onBlur={field.onBlur}
                                            onChange={field.onChange}
                                            opcoes={contas.map((c) => ({
                                                value: String(c.id),
                                                label: `${c.nome}${c.agencia ? ` · Ag. ${c.agencia}` : ""}${c.conta ? ` · ${c.conta}` : ""}`,
                                            }))}
                                        />
                                    )}
                                />
                                {errors.contaId && <p className={errorCls}>{errors.contaId.message}</p>}
                            </div>

                            <div>
                                <span id="import-extrato-arquivo-label" className={labelCls}>Arquivo OFX *</span>
                                <label
                                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-8 cursor-pointer hover:border-primary/40 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
                                    <FileSpreadsheet aria-hidden="true" className="w-8 h-8 text-muted-foreground"/>
                                    <span className="text-xs text-white/80 text-center">
                                        {arquivoSelecionado ? arquivoSelecionado.name : "Clique para escolher ou solte o arquivo aqui"}
                                    </span>
                                    <input
                                        type="file"
                                        accept=".ofx,.OFX,application/x-ofx,application/vnd.intu.qfx"
                                        className="sr-only"
                                        aria-labelledby="import-extrato-arquivo-label"
                                        disabled={pending}
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) setValue("arquivo", f, {shouldValidate: true});
                                        }}
                                    />
                                </label>
                                {errors.arquivo && <p className={errorCls}>{errors.arquivo.message}</p>}
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter hint="* Campos obrigatórios · Esc fecha">
                        <button type="button" onClick={() => void handleRequestClose()} className={modalBtnSecondaryCls}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={pending} className={modalBtnPrimaryCls}>
                            {preAnaliseMutation.isPending ? (
                                <ModalSpinner label="Analisando..."/>
                            ) : (
                                <Upload aria-hidden="true" className="w-4 h-4"/>
                            )}
                            Analisar arquivo
                        </button>
                    </ModalFooter>
                </ModalForm>
            ) : (
                <>
                    <ModalBody className="space-y-4">
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
                        <p className="text-xs text-muted-foreground">
                            Período {preAnalise.periodo_inicio} - {preAnalise.periodo_fim}
                        </p>
                    </ModalBody>
                    <ModalFooter hint="Esc fecha">
                        <button type="button" onClick={() => void handleRequestClose()} className={modalBtnSecondaryCls}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setPreAnalise(null);
                                setPendingForm(null);
                            }}
                            className={modalBtnSecondaryCls}>
                            Voltar
                        </button>
                        <button
                            type="button"
                            disabled={pending || preAnalise.novas === 0}
                            onClick={confirmarImportarNovas}
                            className={cn(modalBtnPrimaryCls, "col-span-2")}>
                            {importMutation.isPending ? <ModalSpinner label="Importando..."/> : null}
                            Importar apenas as {preAnalise.novas} novas
                        </button>
                    </ModalFooter>
                </>
            )}
            <ConfirmDialog {...ConfirmDialogProps} />
        </Modal>
    );
}
