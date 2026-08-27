import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/shared/page-header";
import {
  Plus,
  Copy,
  CheckCircle,
  Clock,
  X,
  Code,
  Key,
  Trash2,
  Loader2,
  AlertCircle,
  ShieldOff,
  Shield,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchApiData } from "@/lib/api-config";
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

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type TokenRow = {
  id: number;
  nome: string;
  ativo: boolean;
  created_at: string;
};

type CreatedToken = TokenRow & {
  token: string;
};

// ─── Validação ─────────────────────────────────────────────────────────────────
const tokenFormSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres."),
});
type TokenFormValues = z.infer<typeof tokenFormSchema>;

// ─── Endpoints da documentação (estáticos) ────────────────────────────────────
const endpoints = [
  { method: "GET", path: "/api/v1/kpis", descricao: "KPIs do dashboard principal", parametros: "?periodo=mensal|anual" },
  { method: "GET", path: "/api/v1/fluxo-caixa", descricao: "Dados de fluxo de caixa", parametros: "?ano=&mes=1-12" },
  { method: "GET", path: "/api/v1/lancamentos", descricao: "Lista de lançamentos", parametros: "?tipo=CR|CP&status=&page=1" },
  { method: "GET", path: "/api/v1/dre", descricao: "DRE Gerencial consolidado", parametros: "?ano=" },
  { method: "GET", path: "/api/v1/parceiros", descricao: "Lista de parceiros/clientes", parametros: "?tipo=cliente|fornecedor" },
  { method: "GET", path: "/api/v1/metas", descricao: "Metas vs realizado", parametros: "?ano=" },
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TokenFormValues>({ resolver: zodResolver(tokenFormSchema) });

  const createMutation = useMutation({
    mutationFn: (data: TokenFormValues) =>
      fetchApiData<CreatedToken>("/tokens-api", {
        method: "POST",
        body: JSON.stringify({ nome: data.nome }),
      }),
    onSuccess: (data) => {
      setCreatedToken(data);
      void queryClient.invalidateQueries({ queryKey: ["tokens-api"] });
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao criar token", description: err.message, variant: "destructive" }),
  });

  const copyToken = async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/5">
          <h2 className="text-base sm:text-lg font-bold text-white">
            {createdToken ? "Token Gerado" : "Gerar Novo Token"}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!createdToken ? (
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))}>
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Nome do Token <span className="text-destructive">*</span>
                </label>
                <input
                  {...register("nome")}
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors"
                  placeholder="Ex: Power BI Produção"
                />
                {errors.nome && (
                  <p className="text-xs text-destructive mt-1">{errors.nome.message}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                O token será gerado no servidor e exibido uma única vez. Guarde-o em local seguro.
              </p>
            </div>
            <div className="flex gap-3 p-4 sm:p-6 pt-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Gerar Token
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="text-center py-2">
              <CheckCircle className="w-10 h-10 text-success mx-auto mb-2" />
              <p className="font-bold text-white">Token "{createdToken.nome}" criado!</p>
              <p className="text-xs text-destructive mt-1 font-semibold">
                ⚠ Copie agora — não será exibido novamente.
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
              {copied ? <CheckCircle className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado!" : "Copiar Token"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium"
            >
              Concluído
            </button>
          </div>
        )}
      </div>
    </div>
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
    queryKey: ["tokens-api"],
    queryFn: () => fetchApiData<TokenRow[]>("/tokens-api"),
  });

  // ── Toggle ativo/inativo ────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: number; ativo: boolean }) =>
      fetchApiData<TokenRow>(`/tokens-api/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tokens-api"] }),
    onError: (err: Error) =>
      toast({ title: "Erro ao atualizar token", description: err.message, variant: "destructive" }),
  });

  // ── Deletar ─────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApiData<{ deleted: boolean }>(`/tokens-api/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tokens-api"] });
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

          {/* Loading — skeleton */}
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
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-white">{tokens.length}</span> token
                  {tokens.length !== 1 ? "s" : ""} ·{" "}
                  <span className="text-success">{ativos} ativo{ativos !== 1 ? "s" : ""}</span>
                </p>
              </div>

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
                  {tokens.map((t) => (
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
                          <button
                            type="button"
                            title="Excluir token"
                            disabled={deleteMutation.isPending}
                            onClick={() => handleDelete(t)}
                            className="p-2 hover:bg-destructive/20 rounded-lg transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
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
              <p className="pl-4 whitespace-nowrap">https://api.ismtecnologia.com.br/api/v1/kpis</p>
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