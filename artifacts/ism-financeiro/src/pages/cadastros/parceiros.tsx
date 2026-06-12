import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Search, Download, Edit2, Trash2, Ban, CheckCircle, X, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { parceiroFormSchema, type ParceiroFormValues } from "@/validations/cadastros.schema";
import { exportToExcel } from "@/lib/export";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

const tiposParceiroOptions = [
  "Cliente",
  "Fornecedor",
  "Sócio(a)",
  "Participante Societário(a)",
  "Funcionário(a)",
  "Prestador(a) de Serviços PJ",
];

// ── Paleta de cores por tipo de parceiro ─────────────────────────────────────
const TIPO_PARCEIRO_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  "Cliente":                      { bg: "bg-teal-500/15",   text: "text-teal-300",   border: "border-teal-500/30"   },
  "Fornecedor":                   { bg: "bg-orange-500/15", text: "text-orange-300", border: "border-orange-500/30" },
  "Sócio(a)":                     { bg: "bg-violet-500/15", text: "text-violet-300", border: "border-violet-500/30" },
  "Participante Societário(a)":   { bg: "bg-purple-500/15", text: "text-purple-300", border: "border-purple-500/30" },
  "Funcionário(a)":               { bg: "bg-sky-500/15",    text: "text-sky-300",    border: "border-sky-500/30"    },
  "Prestador(a) de Serviços PJ":  { bg: "bg-amber-500/15",  text: "text-amber-300",  border: "border-amber-500/30"  },
};

function getTipoStyle(tipo: string) {
  return TIPO_PARCEIRO_STYLE[tipo] ?? { bg: "bg-white/10", text: "text-white/70", border: "border-white/10" };
}

const formaPagamentoOpcoes = ["PIX", "Boleto", "TED", "DOC", "Cheque"] as const;

type FormaPagamentoOption = typeof formaPagamentoOpcoes[number];

function parseFormaPagamento(value: string | null | undefined): FormaPagamentoOption {
  return formaPagamentoOpcoes.includes(value as FormaPagamentoOption)
    ? (value as FormaPagamentoOption)
    : "PIX";
}

function mascararDocumento(valor: string, tipo: "PJ" | "PF") {
  const numeros = valor.replace(/\D/g, "");
  if (tipo === "PF") {
    return numeros.slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return numeros.slice(0, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function mascararTelefone(valor: string) {
  const numeros = valor.replace(/\D/g, "");
  return numeros.slice(0, 11).replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function docNumeros(s: string) {
  return s.replace(/\D/g, "");
}

function parceiroRowToFormValues(p: ParceiroRow): ParceiroFormValues {
  const tipo = (p.tipo_pessoa === "PF" ? "PF" : "PJ") as "PF" | "PJ";
  const rawDoc = docNumeros(String(p.cpf_cnpj ?? ""));

  let pixChave = "";
  let pixTipoRecebedor = tipo;
  const cpix = p.chaves_pix as Array<{ tipo: string; chave: string }> | null;
  if (cpix && Array.isArray(cpix) && cpix.length > 0) {
    pixChave = cpix[0].chave;
    pixTipoRecebedor = cpix[0].tipo as "PF" | "PJ";
  }

  let agencia = "";
  let contaNumero = "";
  const dbanc = p.dados_bancarios as Array<any> | null;
  if (dbanc && Array.isArray(dbanc) && dbanc.length > 0) {
    agencia = dbanc[0].agencia || "";
    contaNumero = dbanc[0].conta || "";
  }

  return {
    tipoPessoa: tipo,
    nomeRazao: p.nome,
    documento: rawDoc ? mascararDocumento(rawDoc, tipo) : "",
    departamento_id: p.departamento_id ? String(p.departamento_id) : "",
    tiposParceiro: tiposArray(p.tipos),
    formaPagamento: parseFormaPagamento(p.forma_pagamento_preferencial),
    email: p.email || "",
    telefone: p.telefone ? mascararTelefone(p.telefone) : "",
    pixTipoRecebedor,
    pixChave,
    agencia,
    contaTipo: "Corrente",
    contaNumero,
    cpfCnpjBancario: "",
  };
}

type DepartamentoRow = { id: number; nome: string };

type ParceiroRow = {
  id: number;
  tipo_pessoa: string;
  cpf_cnpj: string | null;
  nome: string;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
  forma_pagamento_preferencial: string | null;
  tipos: unknown;
  departamento_id: number | null;
  centro_custo_id: number | null;
  ativo: boolean;
  bloqueado: boolean;
  chaves_pix: unknown;
  dados_bancarios: unknown;
};

function tiposArray(t: unknown): string[] {
  return Array.isArray(t) ? (t as string[]) : [];
}

function parceiroFormToApiBody(values: ParceiroFormValues) {
  const dig = docNumeros(values.documento);
  const deptRaw = values.departamento_id?.trim() ?? "";
  const departamento_id = deptRaw ? Number(deptRaw) : undefined;

  const chaves_pix: Array<{ tipo: string; chave: string }> = [];
  const dados_bancarios: Array<{ banco: string; agencia: string; conta: string }> = [];

  if (values.formaPagamento === "PIX" && values.pixChave?.trim()) {
    chaves_pix.push({ tipo: values.pixTipoRecebedor, chave: values.pixChave.trim() });
  }
  if (values.formaPagamento === "Boleto" || values.formaPagamento === "TED" || values.formaPagamento === "DOC") {
    dados_bancarios.push({ banco: values.formaPagamento, agencia: values.agencia?.trim() ?? "", conta: values.contaNumero?.trim() ?? "" });
  }

  return {
    tipo_pessoa: values.tipoPessoa,
    cpf_cnpj: dig || null,
    nome: values.nomeRazao.trim(),
    nome_fantasia: null as string | null,
    email: values.email?.trim() || null,
    telefone: docNumeros(values.telefone ?? "") || null,
    forma_pagamento_preferencial: values.formaPagamento,
    tipos: values.tiposParceiro,
    departamento_id: departamento_id ?? null,
    centro_custo_id: null as number | null,
    ativo: true,
    bloqueado: false,
    chaves_pix,
    dados_bancarios,
  };
}

function ConfirmacaoCancelModal({ onConfirm, onDismiss }: { onConfirm: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-warning mx-auto mb-3" />
        <h3 className="font-bold text-white text-lg mb-1">Cancelar cadastro?</h3>
        <p className="text-sm text-muted-foreground mb-5">As informações preenchidas serão perdidas. Deseja realmente cancelar?</p>
        <div className="flex gap-3">
          <button type="button" onClick={onDismiss} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">
            Não, continuar
          </button>
          <button type="button" onClick={onConfirm} className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-xl text-sm font-medium">
            Sim, cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

const defaultParceiroForm: ParceiroFormValues = {
  tipoPessoa: "PJ",
  nomeRazao: "",
  documento: "",
  departamento_id: "",
  tiposParceiro: [],
  formaPagamento: "PIX",
  email: "",
  telefone: "",
  pixTipoRecebedor: "PJ",
  pixChave: "",
  agencia: "",
  contaTipo: "Corrente",
  contaNumero: "",
  cpfCnpjBancario: "",
};

function NovoParceiroModal({ onClose, initialData }: { onClose: () => void; initialData?: ParceiroRow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const isEdit = !!initialData;

  const { data: departamentos = [] } = useQuery({
    queryKey: ["departamentos"],
    queryFn: () => fetchApiData<DepartamentoRow[]>("/departamentos"),
  });

  const form = useForm<ParceiroFormValues>({
    resolver: zodResolver(parceiroFormSchema),
    mode: "onTouched",
    defaultValues: isEdit ? parceiroRowToFormValues(initialData) : defaultParceiroForm,
  });

  const { register, control, handleSubmit, watch, setValue, reset, trigger, formState: { errors, isDirty } } = form;

  useEffect(() => {
    if (isEdit) reset(parceiroRowToFormValues(initialData));
    else reset(defaultParceiroForm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tipoPessoa      = watch("tipoPessoa");
  const formaPagamento  = watch("formaPagamento");
  const tiposParceiro   = watch("tiposParceiro");
  const pixTipoRecebedor = watch("pixTipoRecebedor");

  useEffect(() => { void trigger("documento"); }, [tipoPessoa]);
  useEffect(() => { void trigger(["pixChave", "agencia", "contaNumero", "cpfCnpjBancario"]); }, [formaPagamento]);
  useEffect(() => { void trigger("cpfCnpjBancario"); }, [pixTipoRecebedor]);

  const saveMutation = useMutation({
    mutationFn: (values: ParceiroFormValues) => {
      const body = parceiroFormToApiBody(values);
      if (isEdit) return fetchApiData<ParceiroRow>(`/parceiros/${initialData.id}`, { method: "PUT", body: JSON.stringify(body) });
      return fetchApiData<ParceiroRow>("/parceiros", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast({ title: isEdit ? "Parceiro atualizado" : "Parceiro cadastrado", description: "O registro foi salvo com sucesso." });
      reset(defaultParceiroForm);
      onClose();
    },
    onError: (e: unknown) => {
      toast({ variant: "destructive", title: "Erro ao salvar", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const handleCancel = () => {
    if (isDirty) setShowConfirmCancel(true);
    else onClose();
  };

  const fieldCls = (hasError?: boolean) =>
    `w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors ${
      hasError ? "border-destructive/60 focus:border-destructive" : "border-white/10"
    }`;

  return (
    <>
      {showConfirmCancel && (
        <ConfirmacaoCancelModal
          onConfirm={() => { reset(defaultParceiroForm); onClose(); }}
          onDismiss={() => setShowConfirmCancel(false)}
        />
      )}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-card z-10">
            <h2 className="text-lg font-bold text-white">
              {isEdit ? "Editar Cadastro" : "Novo Cadastro"} — Clientes/Fornecedores
            </h2>
            <button type="button" onClick={handleCancel} className="p-1.5 hover:bg-white/5 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} noValidate className="flex flex-col">
            <div className="p-6 space-y-5">
              {/* Tipo de Pessoa */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Tipo de Pessoa *</label>
                <Controller
                  name="tipoPessoa"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-2">
                      {(["PF", "PJ"] as const).map((t) => (
                        <button key={t} type="button"
                          onClick={() => { field.onChange(t); setValue("documento", "", { shouldDirty: true }); }}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                            field.value === t ? "bg-primary text-white border-primary" : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                          }`}>
                          {t === "PF" ? "Pessoa Física (PF)" : "Pessoa Jurídica (PJ)"}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>

              {/* Nome + Documento */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    {tipoPessoa === "PF" ? "Nome Completo *" : "Razão Social / Nome Fantasia *"}
                  </label>
                  <input {...register("nomeRazao")} className={fieldCls(!!errors.nomeRazao)} placeholder={tipoPessoa === "PF" ? "Ex: João da Silva" : "Ex: Tech Solutions S.A."} />
                  {errors.nomeRazao && <p className="text-[11px] text-destructive mt-1">{errors.nomeRazao.message}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    {tipoPessoa === "PF" ? "CPF *" : "CNPJ *"}
                  </label>
                  <Controller name="documento" control={control} render={({ field }) => (
                    <input value={field.value} onChange={(e) => field.onChange(mascararDocumento(e.target.value, tipoPessoa as "PF" | "PJ"))} onBlur={field.onBlur} className={fieldCls(!!errors.documento)} placeholder={tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} />
                  )} />
                  {errors.documento && <p className="text-[11px] text-destructive mt-1">{errors.documento.message}</p>}
                </div>
              </div>

              {/* E-mail + Telefone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">E-mail</label>
                  <input {...register("email")} type="email" className={fieldCls(!!errors.email)} placeholder="email@exemplo.com.br" />
                  {errors.email && <p className="text-[11px] text-destructive mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Telefone</label>
                  <Controller name="telefone" control={control} render={({ field }) => (
                    <input value={field.value} onChange={(e) => field.onChange(mascararTelefone(e.target.value))} onBlur={field.onBlur} className={fieldCls(!!errors.telefone)} placeholder="(11) 99999-0000" />
                  )} />
                  {errors.telefone && <p className="text-[11px] text-destructive mt-1">{errors.telefone.message}</p>}
                </div>
              </div>

              {/* Departamento */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Lotação / Departamento</label>
                <select {...register("departamento_id")} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors [&>option]:bg-[#1A1A24] [&>option]:text-white">
                  <option value="">Selecione...</option>
                  {departamentos.map((d) => <option key={d.id} value={String(d.id)}>{d.nome}</option>)}
                </select>
              </div>

              {/* Tipos de Parceiro */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Tipo de Parceiro *</label>
                <div className="grid grid-cols-2 gap-2">
                  {tiposParceiroOptions.map((t) => {
                    const style = getTipoStyle(t);
                    const checked = tiposParceiro.includes(t);
                    return (
                      <label key={t} className={`flex items-center gap-2 cursor-pointer p-3 rounded-xl border transition-all ${
                        checked
                          ? `${style.bg} ${style.border} border`
                          : "border-white/10 hover:border-primary/40 hover:bg-primary/5"
                      }`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const next = checked ? tiposParceiro.filter((x) => x !== t) : [...tiposParceiro, t];
                            setValue("tiposParceiro", next, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                          }}
                          className="accent-primary w-4 h-4" />
                        <span className={`text-sm font-medium ${checked ? style.text : "text-white"}`}>{t}</span>
                      </label>
                    );
                  })}
                </div>
                {errors.tiposParceiro && <p className="text-[11px] text-destructive mt-1">{errors.tiposParceiro.message}</p>}
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Forma de Pagamento Preferencial</label>
                <Controller name="formaPagamento" control={control} render={({ field }) => (
                  <div className="flex gap-2 flex-wrap mb-3">
                    {formaPagamentoOpcoes.map((f) => (
                      <button key={f} type="button" onClick={() => field.onChange(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                          field.value === f ? "bg-primary text-white border-primary" : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                        }`}>
                        {f}
                      </button>
                    ))}
                  </div>
                )} />

                {formaPagamento === "PIX" && (
                  <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Tipo do Recebedor</label>
                      <select {...register("pixTipoRecebedor")} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 [&>option]:bg-[#1A1A24] [&>option]:text-white">
                        <option value="PF">Pessoa Física</option>
                        <option value="PJ">Pessoa Jurídica</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Chave PIX *</label>
                      <input {...register("pixChave")} className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 ${errors.pixChave ? "border-destructive/60" : "border-white/10"}`} placeholder="CPF, CNPJ, e-mail ou telefone" />
                      {errors.pixChave && <p className="text-[11px] text-destructive mt-1">{errors.pixChave.message}</p>}
                    </div>
                  </div>
                )}

                {(formaPagamento === "Boleto" || formaPagamento === "TED" || formaPagamento === "DOC") && (
                  <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Tipo Recebedor</label>
                      <select {...register("pixTipoRecebedor")} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 [&>option]:bg-[#1A1A24] [&>option]:text-white">
                        <option value="PF">Pessoa Física</option>
                        <option value="PJ">Pessoa Jurídica</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{pixTipoRecebedor === "PF" ? "CPF *" : "CNPJ *"}</label>
                      <Controller name="cpfCnpjBancario" control={control} render={({ field }) => (
                        <input value={field.value} onChange={(e) => field.onChange(mascararDocumento(e.target.value, pixTipoRecebedor as "PF" | "PJ"))} onBlur={field.onBlur}
                          className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 ${errors.cpfCnpjBancario ? "border-destructive/60" : "border-white/10"}`}
                          placeholder={pixTipoRecebedor === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} />
                      )} />
                      {errors.cpfCnpjBancario && <p className="text-[11px] text-destructive mt-1">{errors.cpfCnpjBancario.message}</p>}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Agência *</label>
                      <input {...register("agencia")} className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 ${errors.agencia ? "border-destructive/60" : "border-white/10"}`} placeholder="0000" />
                      {errors.agencia && <p className="text-[11px] text-destructive mt-1">{errors.agencia.message}</p>}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Tipo de Conta *</label>
                      <select {...register("contaTipo")} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 [&>option]:bg-[#1A1A24] [&>option]:text-white">
                        <option>Corrente</option>
                        <option>Poupança</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Número da Conta *</label>
                      <input {...register("contaNumero")} className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50 ${errors.contaNumero ? "border-destructive/60" : "border-white/10"}`} placeholder="00000-0" />
                      {errors.contaNumero && <p className="text-[11px] text-destructive mt-1">{errors.contaNumero.message}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0 sticky bottom-0 bg-card border-t border-white/5">
              <button type="button" onClick={handleCancel} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">Cancelar</button>
              <button type="submit" disabled={saveMutation.isPending} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/25 disabled:opacity-50">
                {saveMutation.isPending ? "Salvando…" : isEdit ? "Salvar Alterações" : "Salvar Cadastro"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default function Parceiros() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingParceiro, setEditingParceiro] = useState<ParceiroRow | null>(null);
  const { confirm, ConfirmDialogProps } = useConfirm();

  const { data: departamentos = [] } = useQuery({
    queryKey: ["departamentos"],
    queryFn: () => fetchApiData<DepartamentoRow[]>("/departamentos"),
  });

  const deptNomeById = useMemo(() => new Map(departamentos.map((d) => [d.id, d.nome])), [departamentos]);

  const { data: parceirosLista = [], isLoading } = useQuery({
    queryKey: ["parceiros", search],
    queryFn: () => {
      const q = search.trim();
      const qs = new URLSearchParams({ limit: "200", page: "1" });
      if (q) qs.set("search", q);
      return fetchApiData<ParceiroRow[]>(`/parceiros?${qs.toString()}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: number; ativo: boolean }) =>
      fetchApiData<ParceiroRow>(`/parceiros/${id}`, { method: "PUT", body: JSON.stringify({ ativo }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast({ title: "Status atualizado", description: "O parceiro foi atualizado." });
    },
    onError: (e: unknown) => {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchApiData<{ deleted?: boolean }>(`/parceiros/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast({ title: "Parceiro removido", description: "O cadastro foi excluído." });
    },
    onError: (e: unknown) => {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    },
  });

  const handleDelete = async (p: ParceiroRow) => {
    const ok = await confirm({
      title: `Excluir "${p.nome.toUpperCase()}"?`,
      description: "Esta ação não pode ser desfeita. O cadastro será removido permanentemente.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (ok) deleteMutation.mutate(p.id);
  };

  const handleEdit = async (p: ParceiroRow) => {
    const ok = await confirm({
      title: `Editar "${p.nome.toUpperCase()}"?`,
      description: "Você será direcionado ao formulário de edição deste cadastro.",
      confirmLabel: "Editar",
      cancelLabel: "Cancelar",
      variant: "default",
    });
    if (ok) setEditingParceiro(p);
  };

  const handleToggleAtivo = async (p: ParceiroRow) => {
    const statusAtivo = p.ativo && !p.bloqueado;
    const ok = await confirm({
      title: statusAtivo ? `Desativar "${p.nome}"?` : `Ativar "${p.nome}"?`,
      description: statusAtivo
        ? "O parceiro não aparecerá nas listagens de lançamentos."
        : "O parceiro voltará a ficar disponível para lançamentos.",
      confirmLabel: statusAtivo ? "Desativar" : "Ativar",
      cancelLabel: "Cancelar",
      variant: statusAtivo ? "destructive" : "default",
    });
    if (ok) updateMutation.mutate({ id: p.id, ativo: !statusAtivo });
  };

  const getDocDisplay = (p: ParceiroRow) => {
    if (!p.cpf_cnpj) return "—";
    const tipo = (p.tipo_pessoa === "PF" ? "PF" : "PJ") as "PF" | "PJ";
    return mascararDocumento(String(p.cpf_cnpj).replace(/\D/g, ""), tipo);
  };

  const EXPORT_COLUMNS_PARCEIROS = [
    { header: "Tipo Pessoa",     key: "tipo_pessoa",   width: 12 },
    { header: "Nome / Razão",    key: "nome",          width: 40 },
    { header: "CPF / CNPJ",      key: "cpf_cnpj_fmt",  width: 22 },
    { header: "Tipos Parceiro",  key: "tipos_fmt",     width: 34 },
    { header: "Departamento",    key: "dept_nome",     width: 26 },
    { header: "Status",          key: "status",        width: 12 },
  ];

  function handleExportParceiros() {
    const rows = parceirosLista.map((p) => ({
      tipo_pessoa:  p.tipo_pessoa,
      nome:         p.nome,
      cpf_cnpj_fmt: getDocDisplay(p),
      tipos_fmt:    tiposArray(p.tipos).join(", ") || "—",
      dept_nome:    p.departamento_id ? (deptNomeById.get(p.departamento_id) ?? "—") : "—",
      status:       p.ativo && !p.bloqueado ? "Ativo" : "Inativo",
    })) as Record<string, unknown>[];

    exportToExcel(`Parceiros_${new Date().toISOString().split("T")[0]}`, rows, EXPORT_COLUMNS_PARCEIROS);
  }

  return (
    <div className="space-y-6">
      {/* Dialog de confirmação */}
      <ConfirmDialog {...ConfirmDialogProps} />

      {(showModal || editingParceiro) && (
        <NovoParceiroModal
          key={editingParceiro?.id ?? "new"}
          initialData={editingParceiro ?? undefined}
          onClose={() => { setShowModal(false); setEditingParceiro(null); }}
        />
      )}

      <PageHeader
        title="Clientes / Fornecedores"
        description="Cadastro de clientes, fornecedores, funcionários, sócios e parceiros"
        actions={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleExportParceiros}
              disabled={parceirosLista.length === 0 || isLoading}
              title="Exportar XLSX"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> Exportar XLSX
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4" /> Cadastrar Novo
            </button>
          </div>
        }
      />

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-black/10">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/5 focus-within:border-primary/50 transition-all w-80">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="text"
              placeholder="Buscar por nome ou CPF/CNPJ..."
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground text-white"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {isLoading ? "…" : `${parceirosLista.length} cadastros`}
          </span>
        </div>

        {/* Loading */}
        {isLoading && <TableSkeleton rows={6} columns={7} />}

        {/* Empty state */}
        {!isLoading && parceirosLista.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search className="text-muted-foreground/40" />
              </EmptyMedia>
              <EmptyTitle className="text-white">
                {search ? "Nenhum resultado encontrado" : "Nenhum parceiro cadastrado"}
              </EmptyTitle>
              <EmptyDescription>
                {search
                  ? `Não encontramos cadastros para "${search}". Tente outro termo.`
                  : "Cadastre clientes, fornecedores e parceiros para usar nos lançamentos."}
              </EmptyDescription>
            </EmptyHeader>
            {!search && (
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar Novo
                </button>
              </EmptyContent>
            )}
          </Empty>
        )}

        {/* Tabela */}
        {!isLoading && parceirosLista.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-black/20 text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium w-16 text-center">Tipo</th>
                  <th className="px-5 py-3 font-medium">Nome / Razão Social</th>
                  <th className="px-5 py-3 font-medium">CPF / CNPJ</th>
                  <th className="px-5 py-3 font-medium">Tipo de Parceiro</th>
                  <th className="px-5 py-3 font-medium">Lotação</th>
                  <th className="px-5 py-3 font-medium text-center">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {parceirosLista.map((p) => {
                  const tipoUi = p.tipo_pessoa === "PJ" ? "PJ" : "PF";
                  const statusAtivo = p.ativo && !p.bloqueado;
                  const lotacao = p.departamento_id ? deptNomeById.get(p.departamento_id) ?? "—" : "—";
                  const tipos = tiposArray(p.tipos);
                  return (
                    <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-5 py-4 text-center">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${tipoUi === "PJ" ? "bg-primary/20 text-primary" : "bg-teal-500/20 text-teal-400"}`}>
                          {tipoUi}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-white">{p.nome}</td>
                      <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{getDocDisplay(p)}</td>
                      {/* ── Tipos de Parceiro com badges coloridos ── */}
                      <td className="px-5 py-4">
                        <div className="flex gap-1 flex-wrap">
                          {tipos.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            tipos.map((t) => {
                              const s = getTipoStyle(t);
                              return (
                                <span
                                  key={t}
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}
                                >
                                  {t}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground text-sm">{lotacao}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusAtivo ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                          {statusAtivo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(p)}
                            className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                            title="Editar">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleAtivo(p)}
                            className={`p-1.5 rounded-md transition-colors ${statusAtivo ? "hover:bg-success/20 text-success" : "hover:bg-destructive/20 text-destructive"}`}
                            title={statusAtivo ? "Desativar" : "Ativar"}>
                            {statusAtivo ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                            title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}