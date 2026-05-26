import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/shared/page-header";
import { Plus, Search, Download, Edit2, Trash2, Ban, CheckCircle, X, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { parceiroFormSchema, type ParceiroFormValues } from "@/validations/cadastros.schema";

const tiposParceiroOptions = [
  "Cliente",
  "Fornecedor",
  "Sócio(a)",
  "Participante Societário(a)",
  "Funcionário(a)",
  "Prestador(a) de Serviços PJ",
];
const formaPagamentoOpcoes = ["PIX", "Boleto", "TED", "DOC", "Cheque"];

function mascararDocumento(valor: string, tipo: "PJ" | "PF") {
  const numeros = valor.replace(/\D/g, "");
  if (tipo === "PF") {
    return numeros
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return numeros
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function mascararTelefone(valor: string) {
  const numeros = valor.replace(/\D/g, "");
  return numeros
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function docNumeros(s: string) {
  return s.replace(/\D/g, "");
}

type DepartamentoRow = { id: number; nome: string };

type ParceiroRow = {
  id: number;
  tipo_pessoa: string;
  cpf_cnpj: string | null;
  nome: string;
  nome_fantasia: string | null;
  tipos: unknown;
  departamento_id: number | null;
  centro_custo_id: number | null;
  ativo: boolean;
  bloqueado: boolean;
  email?: string | null;
  telefone?: string | null;
  chaves_pix?: Array<{ tipo: string; chave: string }>;
  dados_bancarios?: Array<{ banco: string; agencia: string; conta: string }>;
};

function tiposArray(t: unknown): string[] {
  return Array.isArray(t) ? (t as string[]) : [];
}

function parceiroFormToApiBody(values: ParceiroFormValues) {
  const dig = docNumeros(values.documento);
  const deptRaw = values.departamento_id.trim();
  const departamento_id = deptRaw ? Number(deptRaw) : undefined;

  const chaves_pix: Array<{ tipo: string; chave: string }> = [];
  const dados_bancarios: Array<{
    banco: string;
    agencia: string;
    conta: string;
    digito_agencia?: string;
    digito_conta?: string;
  }> = [];

  if (values.formaPagamento === "PIX" && values.pixChave.trim()) {
    chaves_pix.push({ tipo: values.pixTipoRecebedor, chave: values.pixChave.trim() });
  }
  if (values.formaPagamento === "Boleto" || values.formaPagamento === "TED" || values.formaPagamento === "DOC") {
    dados_bancarios.push({
      banco: values.formaPagamento,
      agencia: values.agencia.trim(),
      conta: values.contaNumero.trim(),
    });
  }

  return {
    tipo_pessoa: values.tipoPessoa,
    cpf_cnpj: dig || null,
    nome: values.nomeRazao.trim(),
    nome_fantasia: null as string | null,
    tipos: values.tiposParceiro,
    departamento_id: departamento_id ?? null,
    centro_custo_id: null as number | null,
    ativo: true,
    bloqueado: false,
    chaves_pix,
    dados_bancarios,
  };
}

function parceiroRowToFormValues(p: ParceiroRow): ParceiroFormValues {
  const tipoPessoa = (p.tipo_pessoa === "PF" ? "PF" : "PJ") as "PF" | "PJ";
  const cpf_cnpj = p.cpf_cnpj ? mascararDocumento(String(p.cpf_cnpj).replace(/\D/g, ""), tipoPessoa) : "";

  const pixChave = p.chaves_pix?.[0]?.chave ?? "";
  const pixTipoRecebedor = (p.chaves_pix?.[0]?.tipo ?? "PJ") as "PF" | "PJ";
  const db = p.dados_bancarios?.[0];
  const formaPagamento = db ? (db.banco as "Boleto" | "TED" | "DOC") : pixChave ? "PIX" : "PIX";

  return {
    tipoPessoa,
    nomeRazao: p.nome ?? "",
    documento: cpf_cnpj,
    departamento_id: p.departamento_id ? String(p.departamento_id) : "",
    tiposParceiro: tiposArray(p.tipos),
    formaPagamento,
    email: p.email ?? "",
    telefone: p.telefone ? mascararTelefone(String(p.telefone).replace(/\D/g, "")) : "",
    pixTipoRecebedor,
    pixChave,
    agencia: db?.agencia ?? "",
    contaTipo: "Corrente",
    contaNumero: db?.conta ?? "",
    cpfCnpjBancario: "",
  };
}

function ConfirmacaoCancelModal({ onConfirm, onDismiss }: { onConfirm: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-warning mx-auto mb-3" />
        <h3 className="font-bold text-white text-lg mb-1">Cancelar edição?</h3>
        <p className="text-sm text-muted-foreground mb-5">As alterações não salvas serão perdidas. Deseja realmente cancelar?</p>
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

// ─── Formulário compartilhado (criar e editar) ───────────────────────────────
function ParceiroFormModal({
  title,
  defaultValues,
  isPending,
  onSubmit,
  onClose,
}: {
  title: string;
  defaultValues: ParceiroFormValues;
  isPending: boolean;
  onSubmit: (values: ParceiroFormValues) => void;
  onClose: () => void;
}) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  const { data: departamentos = [] } = useQuery({
    queryKey: ["departamentos"],
    queryFn: () => fetchApiData<DepartamentoRow[]>("/departamentos"),
  });

  const form = useForm<ParceiroFormValues>({
    resolver: zodResolver(parceiroFormSchema),
    defaultValues,
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = form;

  const tipoPessoa = watch("tipoPessoa");
  const formaPagamento = watch("formaPagamento");
  const tiposParceiro = watch("tiposParceiro");
  const pixTipoRecebedor = watch("pixTipoRecebedor");

  const handleCancel = () => {
    if (isDirty) setShowConfirmCancel(true);
    else onClose();
  };

  return (
    <>
      {showConfirmCancel && (
        <ConfirmacaoCancelModal
          onConfirm={() => {
            reset(defaultParceiroForm);
            onClose();
          }}
          onDismiss={() => setShowConfirmCancel(false)}
        />
      )}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-card z-10">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <button type="button" onClick={handleCancel} className="p-1.5 hover:bg-white/5 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
            <div className="p-6 space-y-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Tipo de Pessoa *</label>
                <Controller
                  name="tipoPessoa"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-2">
                      {(["PF", "PJ"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => field.onChange(t)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                            field.value === t
                              ? "bg-primary text-white border-primary"
                              : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                          }`}>
                          {t === "PF" ? "Pessoa Física (PF)" : "Pessoa Jurídica (PJ)"}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    {tipoPessoa === "PF" ? "Nome Completo *" : "Razão Social / Nome Fantasia *"}
                  </label>
                  <input
                    {...register("nomeRazao")}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                    placeholder={tipoPessoa === "PF" ? "Ex: João da Silva" : "Ex: Tech Solutions S.A."}
                  />
                  {errors.nomeRazao && <p className="text-[11px] text-destructive mt-1">{errors.nomeRazao.message}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    {tipoPessoa === "PF" ? "CPF *" : "CNPJ *"}
                  </label>
                  <Controller
                    name="documento"
                    control={control}
                    render={({ field }) => (
                      <input
                        value={field.value}
                        onChange={(e) => field.onChange(mascararDocumento(e.target.value, tipoPessoa as "PF" | "PJ"))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                        placeholder={tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
                      />
                    )}
                  />
                  {errors.documento && <p className="text-[11px] text-destructive mt-1">{errors.documento.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">E-mail</label>
                  <input
                    {...register("email")}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                    placeholder="email@exemplo.com.br"
                  />
                  {errors.email && <p className="text-[11px] text-destructive mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Telefone</label>
                  <Controller
                    name="telefone"
                    control={control}
                    render={({ field }) => (
                      <input
                        value={field.value}
                        onChange={(e) => field.onChange(mascararTelefone(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                        placeholder="(11) 99999-0000"
                      />
                    )}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Lotação / Departamento
                </label>
                <select
                  {...register("departamento_id")}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-black outline-none focus:border-primary/50 transition-colors">
                  <option value="">Selecione...</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Tipo de Parceiro *</label>
                <div className="grid grid-cols-2 gap-2">
                  {tiposParceiroOptions.map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border border-white/10 hover:border-primary/40 hover:bg-primary/5 transition-all">
                      <input
                        type="checkbox"
                        checked={tiposParceiro.includes(t)}
                        onChange={() => {
                          const next = tiposParceiro.includes(t) ? tiposParceiro.filter((x) => x !== t) : [...tiposParceiro, t];
                          setValue("tiposParceiro", next, { shouldValidate: true, shouldDirty: true });
                        }}
                        className="accent-primary w-4 h-4"
                      />
                      <span className="text-sm text-white">{t}</span>
                    </label>
                  ))}
                </div>
                {errors.tiposParceiro && <p className="text-[11px] text-destructive mt-1">{errors.tiposParceiro.message}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Forma de Pagamento Preferencial</label>
                <Controller
                  name="formaPagamento"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-2 flex-wrap mb-3">
                      {formaPagamentoOpcoes.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => field.onChange(f)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                            field.value === f
                              ? "bg-primary text-white border-primary"
                              : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                          }`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                />

                {formaPagamento === "PIX" && (
                  <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Tipo do Recebedor</label>
                      <select
                        {...register("pixTipoRecebedor")}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-black outline-none">
                        <option value="PF">Pessoa Física</option>
                        <option value="PJ">Pessoa Jurídica</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Chave PIX *</label>
                      <input
                        {...register("pixChave")}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
                        placeholder="CPF, CNPJ, e-mail ou telefone"
                      />
                      {errors.pixChave && <p className="text-[11px] text-destructive mt-1">{errors.pixChave.message}</p>}
                    </div>
                  </div>
                )}

                {(formaPagamento === "Boleto" || formaPagamento === "TED" || formaPagamento === "DOC") && (
                  <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-xl p-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Tipo Recebedor</label>
                      <select
                        {...register("pixTipoRecebedor")}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-black outline-none">
                        <option value="PF">Pessoa Física</option>
                        <option value="PJ">Pessoa Jurídica</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{pixTipoRecebedor === "PF" ? "CPF *" : "CNPJ *"}</label>
                      <Controller
                        name="cpfCnpjBancario"
                        control={control}
                        render={({ field }) => (
                          <input
                            value={field.value}
                            onChange={(e) =>
                              field.onChange(mascararDocumento(e.target.value, pixTipoRecebedor as "PF" | "PJ"))
                            }
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
                            placeholder={pixTipoRecebedor === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
                          />
                        )}
                      />
                      {errors.cpfCnpjBancario && <p className="text-[11px] text-destructive mt-1">{errors.cpfCnpjBancario.message}</p>}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Agência *</label>
                      <input
                        {...register("agencia")}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
                        placeholder="0000"
                      />
                      {errors.agencia && <p className="text-[11px] text-destructive mt-1">{errors.agencia.message}</p>}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Tipo de Conta *</label>
                      <select {...register("contaTipo")} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-black outline-none">
                        <option>Corrente</option>
                        <option>Poupança</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Número da Conta *</label>
                      <input
                        {...register("contaNumero")}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
                        placeholder="00000-0"
                      />
                      {errors.contaNumero && <p className="text-[11px] text-destructive mt-1">{errors.contaNumero.message}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0 sticky bottom-0 bg-card border-t border-white/5">
              <button type="button" onClick={handleCancel} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/25 disabled:opacity-50">
                {isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Modal Novo ───────────────────────────────────────────────────────────────
function NovoParceiroModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: (values: ParceiroFormValues) =>
      fetchApiData<ParceiroRow>("/parceiros", {
        method: "POST",
        body: JSON.stringify(parceiroFormToApiBody(values)),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast({ title: "Parceiro cadastrado", description: "O registro foi salvo com sucesso." });
      onClose();
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  return (
    <ParceiroFormModal
      title="Novo Cadastro — Clientes/Fornecedores"
      defaultValues={defaultParceiroForm}
      isPending={createMutation.isPending}
      onSubmit={(v) => createMutation.mutate(v)}
      onClose={onClose}
    />
  );
}

// ─── Modal Editar ─────────────────────────────────────────────────────────────
function EditarParceiroModal({ parceiro, onClose }: { parceiro: ParceiroRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: (values: ParceiroFormValues) =>
      fetchApiData<ParceiroRow>(`/parceiros/${parceiro.id}`, {
        method: "PUT",
        body: JSON.stringify(parceiroFormToApiBody(values)),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast({ title: "Parceiro atualizado", description: "As alterações foram salvas com sucesso." });
      onClose();
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  return (
    <ParceiroFormModal
      title="Editar Cadastro — Clientes/Fornecedores"
      defaultValues={parceiroRowToFormValues(parceiro)}
      isPending={updateMutation.isPending}
      onSubmit={(v) => updateMutation.mutate(v)}
      onClose={onClose}
    />
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Parceiros() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingParceiro, setEditingParceiro] = useState<ParceiroRow | null>(null);

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

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: number; ativo: boolean }) =>
      fetchApiData<ParceiroRow>(`/parceiros/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ativo }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast({ title: "Status atualizado", description: "O parceiro foi atualizado." });
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchApiData<{ deleted?: boolean }>(`/parceiros/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast({ title: "Parceiro removido", description: "O cadastro foi excluído." });
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const getDocDisplay = (p: ParceiroRow) => {
    if (!p.cpf_cnpj) return "—";
    const tipo = (p.tipo_pessoa === "PF" ? "PF" : "PJ") as "PF" | "PJ";
    return mascararDocumento(String(p.cpf_cnpj).replace(/\D/g, ""), tipo);
  };

  return (
    <div className="space-y-6">
      {showModal && <NovoParceiroModal onClose={() => setShowModal(false)} />}
      {editingParceiro && (
        <EditarParceiroModal
          parceiro={editingParceiro}
          onClose={() => setEditingParceiro(null)}
        />
      )}

      <PageHeader
        title="Clientes / Fornecedores"
        description="Cadastro de clientes, fornecedores, funcionários, sócios e parceiros"
        actions={
          <div className="flex gap-3">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all">
              <Download className="w-4 h-4" /> Exportar
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
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded ${
                          tipoUi === "PJ" ? "bg-primary/20 text-primary" : "bg-teal-500/20 text-teal-400"
                        }`}>
                        {tipoUi}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-white">{p.nome}</td>
                    <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{getDocDisplay(p)}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {tipos.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          tipos.map((t) => (
                            <span key={t} className="bg-white/10 text-white text-[10px] px-2 py-0.5 rounded-full border border-white/10">
                              {t}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground text-sm">{lotacao}</td>
                    <td className="px-5 py-4 text-center">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          statusAtivo ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                        }`}>
                        {statusAtivo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingParceiro(p)}
                          className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                          title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatusMutation.mutate({ id: p.id, ativo: !statusAtivo })}
                          className={`p-1.5 rounded-md transition-colors ${
                            statusAtivo ? "hover:bg-success/20 text-success" : "hover:bg-destructive/20 text-destructive"
                          }`}
                          title={statusAtivo ? "Desativar" : "Ativar"}>
                          {statusAtivo ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => confirm("Excluir este parceiro?") && deleteMutation.mutate(p.id)}
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
      </div>
    </div>
  );
}