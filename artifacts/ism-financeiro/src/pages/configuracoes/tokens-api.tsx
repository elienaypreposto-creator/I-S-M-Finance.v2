import {tenantQueryKey} from "@/lib/tenant-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/shared/page-header";
import {
  Plus,
  Copy,
  CheckCircle,
  Clock,
  Code,
  Key,
  AlertCircle,
  ShieldOff,
  Shield,
} from "lucide-react";
import { BotaoExcluir } from "@/components/shared/botoes-acao";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { DISCARD_PROMPT } from "@/hooks/use-escape-close";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalForm,
  ModalHeader,
  ModalSpinner,
  focarPrimeiro,
  modalBtnPrimaryCls,
  modalBtnSecondaryCls,
  modalGrid2Cls,
} from "@/components/ui/modal-responsivo";
import { dataCivilIso, formatarData, hojeIsoLocal, parseDataCivil } from "@/lib/datas";
import { CampoBusca, contemBusca, useParametrosUrl } from "@/components/shared/filtros";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type TokenRow = {
  id: number;
  nome: string;
  ativo: boolean;
  created_at: string;
};

type CreatedToken = TokenRow & {
  token: string;
  escopos: string[];
  data_expiracao: string;
};

// ─── Escopos e validade ────────────────────────────────────────────────────────
// Espelha ESCOPOS_V1_DISPONIVEIS (lib/db/src/schema/tokens-api.ts): a API recusa
// qualquer código fora daquela lista.
const ESCOPOS_V1 = [
  { codigo: "v1:lancamentos:ler", nome: "Lançamentos", descricao: "Contas a pagar e a receber" },
  { codigo: "v1:parceiros:ler", nome: "Pessoas", descricao: "Clientes e fornecedores" },
  { codigo: "v1:bancos:ler", nome: "Bancos", descricao: "Contas bancárias" },
  { codigo: "v1:filiais:ler", nome: "Filiais", descricao: "Filiais da empresa" },
  { codigo: "v1:planoContas:ler", nome: "Plano de contas", descricao: "Plano de contas e categorias" },
] as const;

const VALIDADE_PADRAO_DIAS = 90;
// A API aceita no máximo 365 dias a partir de hoje.
const VALIDADE_MAXIMA_DIAS = 365;

/** Hoje + `dias`, como data civil local "YYYY-MM-DD". */
function daquiADias(dias: number): string {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return dataCivilIso(data);
}

// ─── Validação ─────────────────────────────────────────────────────────────────
const tokenFormSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres."),
  escopos: z.array(z.string()).min(1, "Selecione ao menos um escopo."),
  data_expiracao: z.string().superRefine((valor, ctx) => {
    if (!parseDataCivil(valor)) {
      ctx.addIssue({ code: "custom", message: "Informe uma data de expiração válida." });
    } else if (valor <= hojeIsoLocal()) {
      ctx.addIssue({ code: "custom", message: "A data de expiração precisa ser futura." });
    } else if (valor > daquiADias(VALIDADE_MAXIMA_DIAS)) {
      ctx.addIssue({ code: "custom", message: "A validade máxima é de 1 ano a partir de hoje." });
    }
  }),
});
type TokenFormValues = z.infer<typeof tokenFormSchema>;

// ─── Endpoints da documentação (espelham routes/v1.ts da API) ─────────────────
const PAGINACAO = "?limit=10000 (máx. 50000)&offset=0";
const endpoints = [
  { method: "GET", path: "/api/v1/bancos", descricao: "Contas bancárias", escopo: "v1:bancos:ler" },
  { method: "GET", path: "/api/v1/contasPagar", descricao: "Contas a pagar, das alteradas mais recentemente", parametros: PAGINACAO, escopo: "v1:lancamentos:ler" },
  { method: "GET", path: "/api/v1/contasReceber", descricao: "Contas a receber, das alteradas mais recentemente", parametros: PAGINACAO, escopo: "v1:lancamentos:ler" },
  { method: "GET", path: "/api/v1/pessoas", descricao: "Pessoas (clientes e fornecedores)", escopo: "v1:parceiros:ler" },
  { method: "GET", path: "/api/v1/filiais", descricao: "Filiais", escopo: "v1:filiais:ler" },
  { method: "GET", path: "/api/v1/planoContas", descricao: "Plano de contas", escopo: "v1:planoContas:ler" },
  { method: "GET", path: "/api/v1/categoriaPlanoConta", descricao: "Categorias do plano de contas, com o total de contas de cada uma", escopo: "v1:planoContas:ler" },
  { method: "GET", path: "/api/v1/tipoDocumentos", descricao: "Tipos de documento (lista fixa)" },
];

const methodColors: Record<string, string> = {
  GET: "bg-success/20 text-success",
  POST: "bg-primary/20 text-primary",
  PUT: "bg-warning/20 text-warning",
  DELETE: "bg-destructive/20 text-destructive",
};

// ─── Modal Criar Token ─────────────────────────────────────────────────────────
function NovoTokenModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const { confirm, ConfirmDialogProps } = useConfirm();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<TokenFormValues>({
    resolver: zodResolver(tokenFormSchema),
    defaultValues: { nome: "", escopos: [], data_expiracao: daquiADias(VALIDADE_PADRAO_DIAS) },
  });
  const dataMinima = daquiADias(1);
  const dataMaxima = daquiADias(VALIDADE_MAXIMA_DIAS);

  const createMutation = useMutation({
    mutationFn: (data: TokenFormValues) =>
      fetchApiData<CreatedToken>("/tokens-api", {
        method: "POST",
        body: JSON.stringify({
          nome: data.nome,
          escopos: data.escopos,
          data_expiracao: data.data_expiracao,
        }),
      }),
    onSuccess: (data) => {
      setCreatedToken(data);
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey("tokens-api") });
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao criar token", description: err.message, variant: "destructive" }),
  });

  async function handleRequestClose() {
    if (createdToken && !copied) {
      const ok = await confirm({
        title: "Fechar sem copiar o token?",
        description: "O token não será exibido novamente. Copie-o antes de sair.",
        confirmLabel: "Sair mesmo assim",
        cancelLabel: "Voltar",
        variant: "destructive",
      });
      if (!ok) return;
      onClose();
      return;
    }
    if (!createdToken && isDirty) {
      const ok = await confirm(DISCARD_PROMPT);
      if (!ok) return;
    }
    onClose();
  }

  const copyToken = async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Ao trocar para a etapa "token gerado" o formulário some: leva o foco ao botão Copiar.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (createdToken) focarPrimeiro(bodyRef.current);
  }, [createdToken]);

  return (
    <Modal onClose={() => void handleRequestClose()}>
      <ModalHeader title={createdToken ? "Token Gerado" : "Gerar Novo Token"} />

      {!createdToken ? (
        <ModalForm onSubmit={handleSubmit((v) => createMutation.mutate(v))}>
          <ModalBody>
            <div className={modalGrid2Cls}>
              <div>
                <label htmlFor="token-nome" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Nome do Token <span className="text-destructive">*</span>
                </label>
                <input
                  id="token-nome"
                  {...register("nome")}
                  aria-invalid={!!errors.nome}
                  aria-describedby="token-nome-aviso"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="Ex: Power BI Produção"
                />
                {errors.nome && (
                  <p className="text-xs text-destructive mt-1">{errors.nome.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="token-expiracao" className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Expira em <span className="text-destructive">*</span>
                </label>
                <input
                  id="token-expiracao"
                  type="date"
                  {...register("data_expiracao")}
                  min={dataMinima}
                  max={dataMaxima}
                  aria-invalid={!!errors.data_expiracao}
                  aria-describedby="token-expiracao-dica"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                />
                {errors.data_expiracao ? (
                  <p className="text-xs text-destructive mt-1">{errors.data_expiracao.message}</p>
                ) : (
                  <p id="token-expiracao-dica" className="text-xs text-muted-foreground mt-1">
                    Padrão de {VALIDADE_PADRAO_DIAS} dias; máximo até {formatarData(dataMaxima)}.
                  </p>
                )}
              </div>
              <Controller
                control={control}
                name="escopos"
                render={({ field }) => {
                  const marcados = field.value;
                  const todos = marcados.length === ESCOPOS_V1.length;
                  const alternar = (codigo: string) =>
                    field.onChange(
                      marcados.includes(codigo)
                        ? marcados.filter((c) => c !== codigo)
                        : [...marcados, codigo],
                    );
                  return (
                    <fieldset
                      className="col-span-full"
                      aria-invalid={!!errors.escopos}
                      aria-describedby={errors.escopos ? "token-escopos-erro" : undefined}
                    >
                      <legend className="float-left mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Escopos (o que o token pode ler) <span className="text-destructive">*</span>
                      </legend>
                      <button
                        type="button"
                        onClick={() => field.onChange(todos ? [] : ESCOPOS_V1.map((e) => e.codigo))}
                        className="float-right mb-1.5 text-xs text-primary hover:underline"
                      >
                        {todos ? "Desmarcar todos" : "Marcar todos"}
                      </button>
                      <div className="clear-both grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ESCOPOS_V1.map((escopo) => (
                          <label
                            key={escopo.codigo}
                            className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                          >
                            <input
                              type="checkbox"
                              className="accent-primary w-4 h-4 shrink-0 mt-0.5"
                              checked={marcados.includes(escopo.codigo)}
                              onChange={() => alternar(escopo.codigo)}
                              onBlur={field.onBlur}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm text-white">{escopo.nome}</span>
                              <span className="block text-xs text-muted-foreground">{escopo.descricao}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      {errors.escopos && (
                        <p id="token-escopos-erro" className="text-xs text-destructive mt-1">
                          {errors.escopos.message}
                        </p>
                      )}
                    </fieldset>
                  );
                }}
              />
              <p id="token-nome-aviso" className="col-span-full text-xs text-muted-foreground">
                O token será gerado no servidor e exibido uma única vez. Guarde-o em local seguro.
              </p>
            </div>
          </ModalBody>
          <ModalFooter hint="* Campos obrigatórios · Esc fecha">
            <button type="button" onClick={() => void handleRequestClose()} className={modalBtnSecondaryCls}>
              Cancelar
            </button>
            <button type="submit" disabled={createMutation.isPending} className={modalBtnPrimaryCls}>
              {createMutation.isPending ? <ModalSpinner label="Gerando..." /> : "Gerar Token"}
            </button>
          </ModalFooter>
        </ModalForm>
      ) : (
        <>
          <ModalBody ref={bodyRef}>
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="text-center py-2">
                <CheckCircle aria-hidden="true" className="w-10 h-10 text-success mx-auto mb-2" />
                <p className="font-bold text-white">Token "{createdToken.nome}" criado!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Válido até {formatarData(createdToken.data_expiracao)}.
                </p>
                <p className="text-xs text-destructive mt-1 font-semibold">
                  ⚠ Copie agora - não será exibido novamente.
                </p>
              </div>
              <div className="bg-black/40 rounded-xl p-4 font-mono text-xs text-success break-all border border-success/20 select-all leading-relaxed">
                {createdToken.token}
              </div>
              <button
                type="button"
                onClick={copyToken}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-white transition-colors border border-white/10"
              >
                {copied ? <CheckCircle aria-hidden="true" className="w-4 h-4 text-success" /> : <Copy aria-hidden="true" className="w-4 h-4" />}
                {copied ? "Copiado!" : "Copiar Token"}
              </button>
              <p className="sr-only" aria-live="polite">{copied ? "Token copiado." : ""}</p>
            </div>
          </ModalBody>
          <ModalFooter hint="Esc fecha">
            <button type="button" onClick={onClose} className={modalBtnPrimaryCls}>
              Concluído
            </button>
          </ModalFooter>
        </>
      )}
      <ConfirmDialog {...ConfirmDialogProps} />
    </Modal>
  );
}

// ─── Página Principal ──────────────────────────────────────────────────────────
export default function TokensApi() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<"tokens" | "docs">("tokens");
  const { confirm, ConfirmDialogProps } = useConfirm();

  const { data: tokens = [], isLoading, isError } = useQuery<TokenRow[]>({
    queryKey: tenantQueryKey("tokens-api"),
    queryFn: () => fetchApiData<TokenRow[]>("/tokens-api"),
  });

  // ── Toggle ativo/inativo ────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: number; ativo: boolean }) =>
      fetchApiData<TokenRow>(`/tokens-api/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: tenantQueryKey("tokens-api") }),
    onError: (err: Error) =>
      toast({ title: "Erro ao atualizar token", description: err.message, variant: "destructive" }),
  });

  // ── Deletar ─────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApiData<{ deleted: boolean }>(`/tokens-api/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tenantQueryKey("tokens-api") });
      toast({ title: "Token removido com sucesso." });
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao remover token", description: err.message, variant: "destructive" }),
  });

  const handleDelete = async (token: TokenRow) => {
    const ok = await confirm({
      title: `Excluir token "${token.nome}"?`,
      description: "Integrações que usam este token perderão acesso imediatamente.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (ok) deleteMutation.mutate(token.id);
  };

  const ativos = tokens.filter((t) => t.ativo).length;

  // ── Busca por nome (?q=) filtrada no navegador ─────────────────────────────
  const { ler, atualizar } = useParametrosUrl();
  const busca = ler("q");
  const tokensFiltrados = useMemo(
    () => tokens.filter((t) => contemBusca(busca, t.nome)),
    [tokens, busca],
  );
  const anuncio = isLoading || !busca
    ? ""
    : `${tokensFiltrados.length} ${tokensFiltrados.length === 1 ? "token encontrado" : "tokens encontrados"}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Dialog de confirmação de exclusão */}
      <ConfirmDialog {...ConfirmDialogProps} />

      {showModal && <NovoTokenModal onClose={() => setShowModal(false)} />}

      <PageHeader
        title="Tokens de API"
        description="Gerencie tokens de acesso para integrações externas (Power BI, ERPs)"
        actions={
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
          >
            <Plus className="w-4 h-4" />
            Gerar Token
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-full sm:w-fit">
        {(["tokens", "docs"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === t ? "bg-primary text-white" : "text-muted-foreground hover:text-white"
            }`}
          >
            {t === "tokens" ? <Key className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
            {t === "tokens" ? "Tokens Ativos" : "Documentação"}
          </button>
        ))}
      </div>

      {/* ── Tab Tokens ── */}
      {tab === "tokens" && (
        <>
          {/* Aviso de segurança */}
          <div className="glass-panel rounded-2xl p-4 border border-warning/20 bg-warning/5">
            <p className="text-xs text-warning flex items-start gap-2">
              <span className="font-bold shrink-0">⚠ Segurança:</span>
              <span>
                Tokens concedem acesso de leitura à API. Nunca compartilhe publicamente. Use o
                header{" "}
                <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono">
                  Authorization: Bearer &lt;token&gt;
                </code>
              </span>
            </p>
          </div>

          {/* Loading - skeleton */}
          {isLoading && <TableSkeleton rows={4} columns={3} showHeader={false} />}

          {/* Erro */}
          {isError && !isLoading && (
            <div className="glass-panel rounded-2xl p-5 border border-destructive/20 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground">Erro ao carregar tokens. Tente novamente.</p>
            </div>
          )}

          {/* Lista */}
          {!isLoading && !isError && (
            <div className="glass-panel rounded-2xl overflow-hidden">
              {/* Barra padrão: resumo à esquerda, busca à direita */}
              <div className="px-4 py-2.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 bg-black/10">
                <p className="text-sm text-muted-foreground">
                  {busca && (
                    <>
                      <span className="font-semibold text-white">{tokensFiltrados.length}</span> de{" "}
                    </>
                  )}
                  <span className="font-semibold text-white">{tokens.length}</span> token
                  {tokens.length !== 1 ? "s" : ""} ·{" "}
                  <span className="text-success">{ativos} ativo{ativos !== 1 ? "s" : ""}</span>
                </p>
                {tokens.length > 0 && (
                  <CampoBusca
                    valor={busca}
                    onBuscar={(termo) => atualizar({ q: termo || null })}
                    placeholder="Buscar por nome…"
                    rotulo="Buscar tokens por nome"
                  />
                )}
              </div>
              <p className="sr-only" aria-live="polite" aria-atomic="true">{anuncio}</p>

              {tokens.length > 0 && tokensFiltrados.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum token encontrado para a busca “{busca}”.
                </div>
              )}

              {tokens.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Key className="text-muted-foreground/40" />
                    </EmptyMedia>
                    <EmptyTitle className="text-white">Nenhum token criado</EmptyTitle>
                    <EmptyDescription>
                      Gere um token para conectar integrações externas como Power BI ou ERPs.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <button
                      type="button"
                      onClick={() => setShowModal(true)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
                    >
                      <Plus className="w-4 h-4" />
                      Gerar Token
                    </button>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="divide-y divide-white/5">
                  {tokensFiltrados.map((t) => (
                    <div key={t.id} className="p-4 sm:p-5 hover:bg-white/5 transition-colors group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-bold text-white text-sm sm:text-base">{t.nome}</p>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                t.ativo
                                  ? "bg-success/20 text-success"
                                  : "bg-white/10 text-muted-foreground"
                              }`}
                            >
                              {t.ativo ? "Ativo" : "Inativo"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 bg-black/30 rounded-xl px-3 py-2 font-mono text-xs text-muted-foreground mb-2">
                            <span className="flex-1 truncate">
                              {"•".repeat(20)}{" "}
                              <span className="text-[10px] italic">(visível apenas na criação)</span>
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Criado:{" "}
                              {new Date(t.created_at).toLocaleDateString("pt-BR")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> ID #{t.id}
                            </span>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title={t.ativo ? "Inativar token" : "Ativar token"}
                            disabled={toggleMutation.isPending}
                            onClick={() => toggleMutation.mutate({ id: t.id, ativo: !t.ativo })}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40"
                          >
                            {t.ativo ? (
                              <Shield className="w-4 h-4 text-success" />
                            ) : (
                              <ShieldOff className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                          <BotaoExcluir
                            onClick={() => handleDelete(t)}
                            disabled={deleteMutation.isPending}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Tab Docs (estático) ── */}
      {tab === "docs" && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-4 sm:p-5">
            <h3 className="font-bold text-white mb-2">Autenticação</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-3">
              Todas as requisições devem incluir o token no cabeçalho HTTP:
            </p>
            <div className="bg-black/50 rounded-xl p-3 sm:p-4 font-mono text-xs text-success border border-success/10 overflow-x-auto">
              <p className="text-muted-foreground mb-1"># Exemplo de requisição curl:</p>
              <p className="whitespace-nowrap">curl -H "Authorization: Bearer &lt;token&gt;" \</p>
              <p className="pl-4 whitespace-nowrap">https://api.ismtecnologia.com.br/api/v1/bancos</p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-white/5">
              <h3 className="font-bold text-white">Endpoints Disponíveis</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Base URL:{" "}
                <code className="text-primary">https://api.ismtecnologia.com.br</code>
              </p>
            </div>
            <div className="divide-y divide-white/5">
              {endpoints.map((ep, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-white/5 transition-colors"
                >
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded font-mono shrink-0 ${methodColors[ep.method]}`}
                  >
                    {ep.method}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs sm:text-sm text-white break-all">{ep.path}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ep.descricao}</p>
                    {ep.parametros && (
                      <p className="text-xs text-primary/70 mt-1 font-mono break-all">
                        {ep.parametros}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Escopo:{" "}
                      {ep.escopo ? (
                        <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono">{ep.escopo}</code>
                      ) : (
                        "nenhum (basta um token válido)"
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}