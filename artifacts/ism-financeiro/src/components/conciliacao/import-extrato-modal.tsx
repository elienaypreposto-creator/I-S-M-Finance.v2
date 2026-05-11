import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { Loader2, Upload, X, FileSpreadsheet } from "lucide-react";

type ContaBancariaOption = {
  id: number;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
};

type ImportarExtratoResponse = {
  extrato: { id: number; arquivo_nome?: string | null };
  conciliacao: { id: number };
  linhas: unknown[];
};

type ImportExtratoModalProps = {
  open: boolean;
  onClose: () => void;
  /** Chamado após importação bem-sucedida (ex.: navegar para o extrato). */
  onImported?: (extratoId: number) => void;
};

const importExtratoSchema = z.object({
  contaId: z.string().min(1, "Selecione a conta bancária."),
  arquivo: z.custom<File>((val) => val instanceof File, "Selecione um arquivo CSV ou OFX."),
});

type ImportExtratoForm = z.infer<typeof importExtratoSchema>;

export function ImportExtratoModal({ open, onClose, onImported }: ImportExtratoModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ImportExtratoForm>({
    resolver: zodResolver(importExtratoSchema),
    defaultValues: { contaId: "" },
  });

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const { data: contas = [], isLoading: loadingContas } = useQuery<ContaBancariaOption[]>({
    queryKey: ["contas-bancarias"],
    queryFn: () => fetchApiData<ContaBancariaOption[]>("/contas-bancarias"),
    enabled: open,
  });

  const importMutation = useMutation({
    mutationFn: async (data: ImportExtratoForm) => {
      const formData = new FormData();
      formData.append("conta_id", data.contaId);
      formData.append("arquivo", data.arquivo);
      return fetchApiData<ImportarExtratoResponse>("/conciliacoes/importar", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["conciliacoes"] });
      toast({ title: "Importação concluída", description: "O extrato foi processado e está disponível na lista." });
      reset();
      onClose();
      onImported?.(data.extrato.id);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Falha ao importar o arquivo.";
      toast({ variant: "destructive", title: "Erro na importação", description: msg });
    },
  });

  if (!open) return null;

  const onSubmit = (data: ImportExtratoForm) => {
    importMutation.mutate(data);
  };

  const arquivoSelecionado = watch("arquivo");

  const inputCls =
    "w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary/50 transition-all";
  const labelCls = "text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block";
  const errorCls = "text-[10px] text-destructive mt-1 font-medium";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-[#121417] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-white">Importar extrato</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Envie CSV ou OFX da conta selecionada</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:bg-white/5 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-5">
          <div>
            <label className={labelCls}>Conta bancária *</label>
            <select
              {...register("contaId")}
              disabled={loadingContas || importMutation.isPending}
              className={inputCls}>
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
            <label className={labelCls}>Arquivo (CSV / OFX) *</label>
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-8 cursor-pointer hover:border-primary/40 transition-colors">
              <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
              <span className="text-xs text-white/80 text-center">
                {arquivoSelecionado ? arquivoSelecionado.name : "Clique para escolher ou solte o arquivo aqui"}
              </span>
              <input
                type="file"
                accept=".csv,.CSV,.ofx,.OFX,text/csv,application/x-ofx,application/vnd.intu.qfx"
                className="sr-only"
                disabled={importMutation.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setValue("arquivo", f, { shouldValidate: true });
                }}
              />
            </label>
            {errors.arquivo && <p className={errorCls}>{errors.arquivo.message}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={importMutation.isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              {importMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
