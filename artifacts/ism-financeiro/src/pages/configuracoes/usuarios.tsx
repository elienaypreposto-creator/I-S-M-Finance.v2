import { useState, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/shared/page-header";
import {
  Plus,
  Shield,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Loader2,
  AlertCircle,
  UserCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApiData } from "@/lib/api-config";
import { RequiresPermission } from "@/components/auth/requires-permission";
import { useToast } from "@/hooks/use-toast";

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type UsuarioRow = {
  id: number;
  nome: string;
  email: string;
  cargo?: string;
  perfil_base?: string;
  telefone: string | null;
  celular: string | null;
  bloqueado: boolean;
  ultimo_acesso: string | null;
  created_at: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const digitsOnly = (v: string) => v.replace(/\D/g, "");

function mascararTelefone(valor: string): string {
  const n = digitsOnly(valor).slice(0, 11);
  return n
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

// ─── Schemas ───────────────────────────────────────────────────────────────────

/**
 * Regras compartilhadas entre criação e edição.
 * Telefone/celular: opcionais, mas quando preenchidos exigem 10-11 dígitos (DDD + número).
 */
const baseUsuarioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Nome deve ter ao menos 2 caracteres.")
    .max(120, "Nome muito longo (máx. 120 caracteres)."),

  email: z
    .string()
    .min(1, "E-mail obrigatório.")
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
      "E-mail inválido — use o formato nome@dominio.com"
    ),

  cargo: z
    .string()
    .max(100, "Cargo muito longo (máx. 100 caracteres).")
    .optional(),

  perfil_base: z.string().optional(),

  telefone: z
    .string()
    .optional()
    .refine((v) => {
      if (!v || v.trim() === "") return true;
      const d = digitsOnly(v);
      return d.length >= 10 && d.length <= 11;
    }, "Telefone inválido — informe DDD + número (10 ou 11 dígitos)"),

  celular: z
    .string()
    .optional()
    .refine((v) => {
      if (!v || v.trim() === "") return true;
      const d = digitsOnly(v);
      return d.length >= 10 && d.length <= 11;
    }, "Celular inválido — informe DDD + número (10 ou 11 dígitos)"),
});

/**
 * Schema de CRIAÇÃO — adiciona campos de senha e confirmação.
 * Regras:
 *   - mínimo 8 caracteres
 *   - ao menos 1 letra maiúscula
 *   - ao menos 1 número
 *   - confirmarSenha deve ser idêntica
 */
const criarUsuarioSchema = baseUsuarioSchema
  .extend({
    senha: z
      .string()
      .min(8, "Senha deve ter ao menos 8 caracteres.")
      .refine((v) => /[A-Z]/.test(v), "Senha deve conter ao menos 1 letra maiúscula.")
      .refine((v) => /[0-9]/.test(v), "Senha deve conter ao menos 1 número."),
    confirmarSenha: z.string().min(1, "Confirmação de senha obrigatória."),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "As senhas não coincidem.",
    path: ["confirmarSenha"],
  });

/** Schema de EDIÇÃO — sem campos de senha. */
const editarUsuarioSchema = baseUsuarioSchema;

type CriarUsuarioFormValues  = z.infer<typeof criarUsuarioSchema>;
type EditarUsuarioFormValues = z.infer<typeof editarUsuarioSchema>;
type UsuarioFormValues = CriarUsuarioFormValues | EditarUsuarioFormValues;

// ─── FieldError ────────────────────────────────────────────────────────────────
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-destructive flex items-center gap-1">
      <span className="inline-block w-1 h-1 rounded-full bg-destructive shrink-0" />
      {message}
    </p>
  );
}

// ─── inputCls helper ───────────────────────────────────────────────────────────
const inputCls = (hasError?: boolean) =>
  `w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors ${
    hasError ? "border-destructive/60 focus:border-destructive" : "border-white/10"
  }`;

// ─── Permissões (estáticas) ────────────────────────────────────────────────────
const permissoesGranulares = [
  {
    grupo: "Dashboard & Relatórios (Home e Relatórios)",
    itens: [
      { nome: "Dashboard", codigo: "dashboard:ver" },
      { nome: "Demonstrativo de Resultado", codigo: "relatorios:dre" },
      { nome: "Fluxo de Caixa Diário", codigo: "relatorios:fluxo-caixa-diario" },
      { nome: "Fluxo de Caixa Mensal", codigo: "relatorios:fluxo-caixa-mensal" },
      { nome: "Relatório Econômico", codigo: "relatorios:economico" },
      { nome: "Relatório Financeiro", codigo: "relatorios:financeiro" },
      { nome: "Relatório por Vencimento", codigo: "relatorios:vencimento" },
      { nome: "Extrato Financeiro", codigo: "relatorios:extrato" },
      { nome: "Análise de Metas", codigo: "relatorios:metas" },
    ],
  },
  {
    grupo: "Contas a Pagar (Lançamentos)",
    itens: [
      { nome: "Cadastro de Contas a Pagar", codigo: "financeiro:contas-pagar:criar" },
      { nome: "Consulta de Contas a Pagar", codigo: "financeiro:contas-pagar:listar" },
      { nome: "Baixa de Contas a Pagar", codigo: "financeiro:contas-pagar:baixar" },
      { nome: "Cancelamento de Contas a Pagar", codigo: "financeiro:contas-pagar:cancelar" },
      { nome: "Importar CR e CP", codigo: "financeiro:importar" },
    ],
  },
  {
    grupo: "Contas a Receber (Lançamentos)",
    itens: [
      { nome: "Cadastro de Contas a Receber", codigo: "financeiro:contas-receber:criar" },
      { nome: "Consulta de Contas a Receber", codigo: "financeiro:contas-receber:listar" },
      { nome: "Baixa de Contas a Receber", codigo: "financeiro:contas-receber:baixar" },
      { nome: "Cancelamento de Contas a Receber", codigo: "financeiro:contas-receber:cancelar" },
      { nome: "Exportar Contas a Receber", codigo: "financeiro:contas-receber:exportar" },
    ],
  },
  {
    grupo: "Conciliação Bancária (Conciliação)",
    itens: [
      { nome: "Conciliação Bancária", codigo: "financeiro:conciliacao:acessar" },
      { nome: "Conciliação Bancária - Conciliar Transações", codigo: "financeiro:conciliacao:conciliar" },
      { nome: "Conciliação Bancária - Importar Arquivo", codigo: "financeiro:conciliacao:importar" },
    ],
  },
  {
    grupo: "Contas Bancárias (Cadastros)",
    itens: [
      { nome: "Cadastro de Contas", codigo: "configuracoes:contas-bancarias:criar" },
      { nome: "Consulta de Contas", codigo: "configuracoes:contas-bancarias:listar" },
      { nome: "Exclusão de Contas", codigo: "configuracoes:contas-bancarias:deletar" },
    ],
  },
  {
    grupo: "Clientes/Fornecedores (Cadastros)",
    itens: [
      { nome: "Cadastro de Pessoa", codigo: "financeiro:parceiros:criar" },
      { nome: "Consulta de Pessoa", codigo: "financeiro:parceiros:listar" },
      { nome: "Exclusão de Pessoa", codigo: "financeiro:parceiros:deletar" },
    ],
  },
  {
    grupo: "Plano de Contas (Cadastros)",
    itens: [
      { nome: "Cadastro de Plano de Contas", codigo: "configuracoes:plano-contas:criar" },
      { nome: "Consulta de Plano de Contas", codigo: "configuracoes:plano-contas:listar" },
      { nome: "Exclusão de Plano de Contas", codigo: "configuracoes:plano-contas:deletar" },
      { nome: "Exportar Plano de Contas", codigo: "configuracoes:plano-contas:exportar" },
    ],
  },
  {
    grupo: "Categorias (Cadastros)",
    itens: [
      { nome: "Cadastro de Categoria", codigo: "configuracoes:categorias:criar" },
      { nome: "Consulta de Categoria", codigo: "configuracoes:categorias:listar" },
      { nome: "Exclusão de Categoria", codigo: "configuracoes:categorias:deletar" },
    ],
  },
  {
    grupo: "Departamentos (Cadastros)",
    itens: [
      { nome: "Cadastro de Departamento", codigo: "configuracoes:departamentos:criar" },
      { nome: "Consulta de Departamento", codigo: "configuracoes:departamentos:listar" },
      { nome: "Exclusão de Departamento", codigo: "configuracoes:departamentos:deletar" },
    ],
  },
  {
    grupo: "Metas Financeiras (Cadastros)",
    itens: [
      { nome: "Cadastro de Metas", codigo: "financeiro:metas:criar" },
      { nome: "Consulta de Metas", codigo: "financeiro:metas:listar" },
      { nome: "Exclusão de Metas", codigo: "financeiro:metas:deletar" },
    ],
  },
  {
    grupo: "Fechamento Mensal (Relatórios)",
    itens: [
      { nome: "Cadastro de Fechamentos Financeiros", codigo: "financeiro:fechamentos:criar" },
      { nome: "Consulta de Fechamentos Financeiros", codigo: "financeiro:fechamentos:listar" },
      { nome: "Exclusão de Fechamentos Financeiros", codigo: "financeiro:fechamentos:deletar" },
    ],
  },
  {
    grupo: "Movimentações (Lançamentos)",
    itens: [
      { nome: "Cadastro de Movimentação Financeira", codigo: "financeiro:lancamentos:criar" },
      { nome: "Consulta de Movimentação Financeira", codigo: "financeiro:lancamentos:listar" },
      { nome: "Exclusão de Movimentação Financeira", codigo: "financeiro:lancamentos:deletar" },
    ],
  },
  {
    grupo: "Configurações do Sistema (Configurações)",
    itens: [
      { nome: "Cadastro de Usuários", codigo: "admin:usuarios:criar" },
      { nome: "Consulta de Usuários", codigo: "admin:usuarios:listar" },
      { nome: "Exclusão de Usuários", codigo: "admin:usuarios:deletar" },
      { nome: "Cadastro de Token de API", codigo: "admin:tokens-api:criar" },
      { nome: "Consulta de Tokens de API", codigo: "admin:tokens-api:listar" },
      { nome: "Exclusão de Token de API", codigo: "admin:tokens-api:deletar" },
    ],
  },
];

const todasPermissoes = permissoesGranulares.flatMap((g) => g.itens.map((i) => i.codigo));

const perfisBase: Record<string, string[]> = {
  Admin: todasPermissoes,
  Financeiro: [
    "dashboard:ver", "relatorios:extrato", "relatorios:fluxo-caixa-mensal", "relatorios:dre",
    "financeiro:contas-pagar:criar", "financeiro:contas-pagar:listar", "financeiro:contas-pagar:baixar",
    "financeiro:contas-receber:criar", "financeiro:contas-receber:listar", "financeiro:contas-receber:baixar",
    "financeiro:conciliacao:acessar", "financeiro:conciliacao:conciliar",
    "configuracoes:contas-bancarias:listar", "financeiro:parceiros:listar", "configuracoes:plano-contas:listar",
    "financeiro:lancamentos:criar", "financeiro:lancamentos:listar",
    "financeiro:metas:criar", "financeiro:metas:listar",
  ],
  Gestor: [
    "dashboard:ver", "relatorios:dre", "relatorios:fluxo-caixa-mensal", "relatorios:metas",
    "financeiro:contas-pagar:listar", "financeiro:contas-receber:listar",
    "configuracoes:contas-bancarias:listar", "financeiro:parceiros:listar", "configuracoes:plano-contas:listar",
    "financeiro:lancamentos:listar", "financeiro:metas:listar",
  ],
  Visualizador: [
    "dashboard:ver", "financeiro:contas-pagar:listar", "financeiro:contas-receber:listar", "financeiro:metas:listar",
  ],
};

function getInitials(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// ─── Modal Permissões ──────────────────────────────────────────────────────────
function PermissoesModal({ usuario, onClose }: { usuario: UsuarioRow; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [expandidos, setExpandidos] = useState<string[]>([permissoesGranulares[0].grupo]);
  const [busca, setBusca] = useState("");

  const { isLoading: loadingPerms, data: fetchedPerms } = useQuery<string[]>({
    queryKey: ["usuario-permissoes", usuario.id],
    queryFn: () => fetchApiData<string[]>(`/usuarios/${usuario.id}/permissoes`),
  });

  useEffect(() => {
    if (fetchedPerms) setSelecionadas(fetchedPerms);
  }, [fetchedPerms]);

  const saveMutation = useMutation({
    mutationFn: (perms: string[]) =>
      fetchApiData(`/usuarios/${usuario.id}/permissoes`, {
        method: "PUT",
        body: JSON.stringify({ permissoes: perms }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["usuario-permissoes", usuario.id] });
      toast({ title: "Permissões atualizadas com sucesso." });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao salvar permissões", description: err.message, variant: "destructive" }),
  });

  const toggle = (p: string) =>
    setSelecionadas((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  const toggleGrupo = (grupo: string) =>
    setExpandidos((e) => (e.includes(grupo) ? e.filter((x) => x !== grupo) : [...e, grupo]));

  const toggleTodosGrupo = (grupo: string, itens: { nome: string; codigo: string }[]) => {
    const todos = itens.every((i) => selecionadas.includes(i.codigo));
    setSelecionadas((s) =>
      todos
        ? s.filter((x) => !itens.map((i) => i.codigo).includes(x))
        : [...new Set([...s, ...itens.map((i) => i.codigo)])],
    );
  };

  const filtered = busca
    ? permissoesGranulares
        .map((g) => ({
          ...g,
          itens: g.itens.filter((i) => i.nome.toLowerCase().includes(busca.toLowerCase())),
        }))
        .filter((g) => g.itens.length > 0)
    : permissoesGranulares;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/5">
          <div>
            <h3 className="font-bold text-white text-sm sm:text-base">Permissões — {usuario.nome}</h3>
            <p className="text-xs text-muted-foreground">
              {selecionadas.length} de {todasPermissoes.length} permissões ativas
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-2 border-b border-white/5 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Perfil rápido:</span>
          {Object.keys(perfisBase).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSelecionadas(perfisBase[p] ?? [])}
              className="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors border border-white/10"
            >
              {p}
            </button>
          ))}
        </div>

        <div className="p-3 sm:p-4 border-b border-white/5">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar permissão..."
              className="bg-transparent outline-none text-sm text-white placeholder:text-muted-foreground w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1">
          {loadingPerms ? (
            <div className="flex items-center justify-center h-24 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Carregando permissões…</span>
            </div>
          ) : (
            filtered.map((grupo) => (
              <div key={grupo.grupo} className="border border-white/5 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGrupo(grupo.grupo)}
                  className="w-full flex items-center justify-between px-3 sm:px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3 text-left">
                    <input
                      type="checkbox"
                      className="accent-primary w-4 h-4 shrink-0"
                      checked={grupo.itens.every((i) => selecionadas.includes(i.codigo))}
                      onChange={() => toggleTodosGrupo(grupo.grupo, grupo.itens)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="font-semibold text-white text-xs sm:text-sm">
                      {(() => {
                        const matches = grupo.grupo.match(/^(.*?)( \([^)]+\))?$/);
                        if (!matches) return grupo.grupo;
                        return (
                          <>
                            {matches[1]}
                            {matches[2] && <span className="text-muted-foreground">{matches[2]}</span>}
                          </>
                        );
                      })()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {grupo.itens.filter((i) => selecionadas.includes(i.codigo)).length}/{grupo.itens.length}
                    </span>
                  </div>
                  {expandidos.includes(grupo.grupo) ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                {expandidos.includes(grupo.grupo) && (
                  <div className="divide-y divide-white/5">
                    {grupo.itens.map((item) => (
                      <label
                        key={item.codigo}
                        className="flex items-center gap-3 px-4 sm:px-5 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                      >
                        <input
                          type="checkbox"
                          className="accent-primary w-4 h-4 shrink-0"
                          checked={selecionadas.includes(item.codigo)}
                          onChange={() => toggle(item.codigo)}
                        />
                        <span className="text-xs sm:text-sm text-muted-foreground flex-1">{item.nome}</span>
                        {selecionadas.includes(item.codigo) && (
                          <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 p-4 sm:p-5 border-t border-white/5">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate(selecionadas)}
            disabled={saveMutation.isPending}
            className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar Permissões
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Autocomplete de Parceiro ──────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function ParceiroAutocomplete({
  value,
  onChange,
  onSelectFull,
  disabled,
  hasError,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelectFull: (parceiro: any) => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const [search, setSearch] = useState(value || "");
  const debouncedSearch = useDebounce(search, 200);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: parceiros = [], isLoading } = useQuery<
    { id: number; nome: string; email: string | null; telefone: string | null; celular: string | null }[]
  >({
    queryKey: ["parceiros-search", debouncedSearch],
    queryFn: () => fetchApiData(`/parceiros?limit=20&search=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.length >= 3,
  });

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        disabled={disabled}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className={inputCls(hasError) + " disabled:opacity-50"}
        placeholder="Digite pelo menos 3 letras para buscar..."
        autoComplete="off"
      />
      {isOpen && search.length >= 3 && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#1A1A24] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
            </div>
          ) : parceiros.length > 0 ? (
            <ul className="py-1">
              {parceiros.map((p) => (
                <li
                  key={p.id}
                  onClick={() => {
                    setSearch(p.nome);
                    onChange(p.nome);
                    onSelectFull(p);
                    setIsOpen(false);
                  }}
                  className="px-4 py-2.5 text-sm text-white hover:bg-white/10 cursor-pointer transition-colors"
                >
                  {p.nome}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3 text-xs text-muted-foreground text-center">Nenhum parceiro encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal Criar / Editar Usuário ──────────────────────────────────────────────
interface UserModalProps {
  initialData?: UsuarioRow;
  onClose: () => void;
  isPending: boolean;
  onSave: (values: UsuarioFormValues) => void;
}

function UserModal({ initialData, onClose, isPending, onSave }: UserModalProps) {
  const isEdit = !!initialData;
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);

  // Seleciona o schema correto conforme modo (criar vs editar)
  const schema = isEdit ? editarUsuarioSchema : criarUsuarioSchema;

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<UsuarioFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome:          initialData?.nome          ?? "",
      email:         initialData?.email         ?? "",
      cargo:         initialData?.cargo         ?? "",
      perfil_base:   initialData?.perfil_base   ?? "",
      telefone:      initialData?.telefone      ?? "",
      celular:       initialData?.celular       ?? "",
      // Campos de senha só existem na criação — não há defaultValue no modo edição
      ...(!isEdit && { senha: "", confirmarSenha: "" }),
    } as UsuarioFormValues,
  });

  const e = errors as any; // cast para acessar campos condicionais sem type error

  const handleParceiroSelect = (parceiro: any) => {
    if (parceiro.email)    setValue("email",    parceiro.email,    { shouldValidate: true });
    if (parceiro.telefone) setValue("telefone", mascararTelefone(parceiro.telefone));
    if (parceiro.celular)  setValue("celular",  mascararTelefone(parceiro.celular));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/5 sticky top-0 bg-card z-10">
          <h2 className="text-base sm:text-lg font-bold text-white">
            {isEdit ? "Editar Usuário" : "Novo Usuário"}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSave)} noValidate>
          <div className="p-4 sm:p-6 space-y-4">

            {/* Nome */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Nome Completo <span className="text-destructive">*</span>
              </label>
              <Controller
                name="nome"
                control={control}
                render={({ field }) => (
                  <ParceiroAutocomplete
                    value={field.value}
                    onChange={field.onChange}
                    onSelectFull={handleParceiroSelect}
                    disabled={isEdit}
                    hasError={!!e.nome}
                  />
                )}
              />
              <FieldError message={e.nome?.message} />
            </div>

            {/* E-mail */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                E-mail (Login) <span className="text-destructive">*</span>
              </label>
              <input
                {...register("email")}
                type="email"
                disabled={isEdit}
                className={inputCls(!!e.email) + " disabled:opacity-50"}
                placeholder="joao@empresa.com.br"
              />
              <FieldError message={e.email?.message} />
            </div>

            {/* Cargo + Perfil Base */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Cargo
                </label>
                <input
                  {...register("cargo")}
                  className={inputCls(!!e.cargo)}
                  placeholder="Ex: Analista"
                />
                <FieldError message={e.cargo?.message} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Perfil Base
                </label>
                <select
                  {...register("perfil_base")}
                  className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors [&>option]:bg-[#1A1A24] [&>option]:text-white ${
                    e.perfil_base ? "border-destructive/60" : "border-white/10"
                  }`}
                >
                  <option value="">Nenhum</option>
                  {Object.keys(perfisBase).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Telefone + Celular — com máscara em tempo real */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Telefone
                </label>
                <Controller
                  name="telefone"
                  control={control}
                  render={({ field }) => (
                    <input
                      value={field.value ?? ""}
                      onChange={(ev) => field.onChange(mascararTelefone(ev.target.value))}
                      className={inputCls(!!e.telefone)}
                      placeholder="(11) 3456-7890"
                      inputMode="tel"
                    />
                  )}
                />
                <FieldError message={e.telefone?.message} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Celular
                </label>
                <Controller
                  name="celular"
                  control={control}
                  render={({ field }) => (
                    <input
                      value={field.value ?? ""}
                      onChange={(ev) => field.onChange(mascararTelefone(ev.target.value))}
                      className={inputCls(!!e.celular)}
                      placeholder="(11) 9 9999-9999"
                      inputMode="tel"
                    />
                  )}
                />
                <FieldError message={e.celular?.message} />
              </div>
            </div>

            {/* Senha — apenas no modo criação */}
            {!isEdit && (
              <>
                <div className="border-t border-white/5 pt-4">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
                    Credenciais de Acesso
                  </p>

                  {/* Aviso */}
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-primary mb-4">
                    <strong>Atenção:</strong> A senha definida será enviada ao e-mail cadastrado junto com as instruções de primeiro acesso.
                  </div>

                  {/* Senha */}
                  <div className="mb-4">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Senha <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <input
                        {...register("senha" as any)}
                        type={showSenha ? "text" : "password"}
                        className={inputCls(!!e.senha) + " pr-10"}
                        placeholder="Mín. 8 caracteres, 1 maiúscula, 1 número"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowSenha((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                      >
                        {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <FieldError message={e.senha?.message} />
                  </div>

                  {/* Confirmar Senha */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Confirmar Senha <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <input
                        {...register("confirmarSenha" as any)}
                        type={showConfirmar ? "text" : "password"}
                        className={inputCls(!!e.confirmarSenha) + " pr-10"}
                        placeholder="Repita a senha"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowConfirmar((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                      >
                        {showConfirmar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <FieldError message={e.confirmarSenha?.message} />
                  </div>
                </div>
              </>
            )}
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
              disabled={isPending}
              className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Salvar Alterações" : "Criar Usuário"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página Principal ──────────────────────────────────────────────────────────
export default function Usuarios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<UsuarioRow | null>(null);
  const [permissoesUsuario, setPermissoesUsuario] = useState<UsuarioRow | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [tab, setTab] = useState<"usuarios" | "perfis">("usuarios");

  const openCreate = () => {
    setEditingUsuario(null);
    setModalKey((k) => k + 1);
    setShowUserModal(true);
  };

  const openEdit = (u: UsuarioRow) => {
    setEditingUsuario(u);
    setModalKey((k) => k + 1);
    setShowUserModal(true);
  };

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUsuario(null);
  };

  const { data: usuarios = [], isLoading, isError, error } = useQuery<UsuarioRow[]>({
    queryKey: ["usuarios"],
    queryFn: () => fetchApiData<UsuarioRow[]>("/usuarios?limit=100"),
  });

  const createMutation = useMutation({
    mutationFn: (data: CriarUsuarioFormValues) =>
      fetchApiData<UsuarioRow>("/usuarios", {
        method: "POST",
        body: JSON.stringify({
          nome:        data.nome,
          email:       data.email,
          senha:       data.senha,
          cargo:       data.cargo       || undefined,
          perfil_base: data.perfil_base || undefined,
          telefone:    data.telefone    || undefined,
          celular:     data.celular     || undefined,
        }),
      }),
    onSuccess: async (createdUser, variables) => {
      if (variables.perfil_base && perfisBase[variables.perfil_base]) {
        await fetchApiData(`/usuarios/${createdUser.id}/permissoes`, {
          method: "PUT",
          body: JSON.stringify({ permissoes: perfisBase[variables.perfil_base] }),
        }).catch(console.error);
      }
      void queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: "Usuário criado com sucesso." });
      closeUserModal();
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditarUsuarioFormValues }) =>
      fetchApiData<UsuarioRow>(`/usuarios/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          nome:        data.nome,
          email:       data.email,
          cargo:       data.cargo       || undefined,
          perfil_base: data.perfil_base || undefined,
          telefone:    data.telefone    || undefined,
          celular:     data.celular     || undefined,
        }),
      }).then((res) => ({ user: res, variables: data })),
    onSuccess: async ({ user, variables }) => {
      if (variables.perfil_base && perfisBase[variables.perfil_base]) {
        await fetchApiData(`/usuarios/${user.id}/permissoes`, {
          method: "PUT",
          body: JSON.stringify({ permissoes: perfisBase[variables.perfil_base] }),
        }).catch(console.error);
      }
      void queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: "Usuário atualizado com sucesso." });
      closeUserModal();
    },
    onError: (err: Error) =>
      toast({ title: "Erro ao atualizar usuário", description: err.message, variant: "destructive" }),
  });

  const toggleBloqueadoMutation = useMutation({
    mutationFn: ({ id, bloqueado }: { id: number; bloqueado: boolean }) =>
      fetchApiData<UsuarioRow>(`/usuarios/${id}`, {
        method: "PUT",
        body: JSON.stringify({ bloqueado }),
      }),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      toast({ title: vars.bloqueado ? "Usuário bloqueado." : "Usuário desbloqueado." });
    },
    onError: (err: Error) =>
      toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleSave = (values: UsuarioFormValues) => {
    if (editingUsuario) {
      updateMutation.mutate({ id: editingUsuario.id, data: values as EditarUsuarioFormValues });
    } else {
      createMutation.mutate(values as CriarUsuarioFormValues);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const ativos = usuarios.filter((u) => !u.bloqueado).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {showUserModal && (
        <UserModal
          key={`user-modal-${modalKey}`}
          initialData={editingUsuario ?? undefined}
          onClose={closeUserModal}
          isPending={isSaving}
          onSave={handleSave}
        />
      )}
      {permissoesUsuario && (
        <PermissoesModal usuario={permissoesUsuario} onClose={() => setPermissoesUsuario(null)} />
      )}

      <PageHeader
        title="Usuários & Permissões"
        description="Gerencie usuários e níveis de acesso ao sistema"
        actions={
          <RequiresPermission permission="admin:usuarios:criar">
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary/25"
            >
              <Plus className="w-4 h-4" />
              Novo Usuário
            </button>
          </RequiresPermission>
        }
      />

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-full sm:w-fit">
        {(["usuarios", "perfis"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? "bg-primary text-white" : "text-muted-foreground hover:text-white"
            }`}
          >
            {t === "usuarios" ? "Usuários" : "Perfis de Acesso"}
          </button>
        ))}
      </div>

      {tab === "usuarios" && (
        <>
          {isLoading && (
            <div className="flex items-center justify-center h-40 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Carregando usuários…</span>
            </div>
          )}

          {isError && !isLoading && (
            <div className="glass-panel rounded-2xl p-6 border border-destructive/20 flex flex-col items-center justify-center text-center gap-3 bg-destructive/5">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-2">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white">Acesso Restrito</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {error instanceof Error ? error.message : "Você não tem permissão para visualizar esta página ou ocorreu um erro."}
              </p>
            </div>
          )}

          {!isLoading && !isError && (
            <>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span><span className="font-semibold text-white">{usuarios.length}</span> usuário{usuarios.length !== 1 ? "s" : ""}</span>
                <span className="text-success"><span className="font-semibold">{ativos}</span> ativo{ativos !== 1 ? "s" : ""}</span>
                <span className="text-muted-foreground/60"><span className="font-semibold">{usuarios.length - ativos}</span> bloqueado{usuarios.length - ativos !== 1 ? "s" : ""}</span>
              </div>

              {usuarios.length === 0 ? (
                <div className="glass-panel rounded-2xl py-12 text-center border border-white/5">
                  <UserCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
                </div>
              ) : (
                <>
                  {/* Tabela Desktop */}
                  <div className="glass-panel rounded-2xl overflow-hidden hidden md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-5 py-3 text-left font-medium text-muted-foreground">Usuário</th>
                          <th className="px-5 py-3 text-left font-medium text-muted-foreground">Contato</th>
                          <th className="px-5 py-3 text-center font-medium text-muted-foreground">Status</th>
                          <th className="px-5 py-3 text-center font-medium text-muted-foreground">Último Acesso</th>
                          <th className="px-5 py-3 text-right font-medium text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {usuarios.map((u) => (
                          <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                                  {getInitials(u.nome)}
                                </div>
                                <div>
                                  <p className="font-semibold text-white">{u.nome}</p>
                                  <p className="text-xs text-muted-foreground">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-xs text-muted-foreground">
                              {u.telefone || u.celular ? (
                                <div>
                                  {u.telefone && <p>{u.telefone}</p>}
                                  {u.celular && <p>{u.celular}</p>}
                                </div>
                              ) : (
                                <span className="opacity-40">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-center">
                              {!u.bloqueado ? (
                                <span className="inline-flex items-center gap-1 text-xs text-success">
                                  <CheckCircle className="w-3.5 h-3.5" /> Ativo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                  <XCircle className="w-3.5 h-3.5" /> Bloqueado
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-center text-xs text-muted-foreground">
                              {u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex justify-end gap-1">
                                <RequiresPermission permission="admin:usuarios:criar">
                                  <button
                                    type="button"
                                    title="Permissões"
                                    className="px-2 py-1.5 hover:bg-primary/10 rounded-lg text-xs text-primary font-medium transition-colors"
                                    onClick={() => setPermissoesUsuario(u)}
                                  >
                                    <Shield className="w-3.5 h-3.5 inline mr-1" />
                                    Permissões
                                  </button>
                                  <button
                                    type="button"
                                    title="Editar"
                                    className="p-1.5 hover:bg-white/10 rounded-lg"
                                    onClick={() => openEdit(u)}
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </RequiresPermission>
                                <RequiresPermission permission="admin:usuarios:deletar">
                                  <button
                                    type="button"
                                    title={u.bloqueado ? "Desbloquear" : "Bloquear"}
                                    disabled={toggleBloqueadoMutation.isPending}
                                    className="p-1.5 hover:bg-warning/20 rounded-lg disabled:opacity-40"
                                    onClick={() => toggleBloqueadoMutation.mutate({ id: u.id, bloqueado: !u.bloqueado })}
                                  >
                                    <Trash2 className={`w-3.5 h-3.5 ${u.bloqueado ? "text-success" : "text-destructive"}`} />
                                  </button>
                                </RequiresPermission>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Cards Mobile */}
                  <div className="space-y-3 md:hidden">
                    {usuarios.map((u) => (
                      <div key={u.id} className="glass-panel rounded-2xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                            {getInitials(u.nome)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-white text-sm truncate">{u.nome}</p>
                              {!u.bloqueado ? (
                                <span className="inline-flex items-center gap-1 text-xs text-success shrink-0">
                                  <CheckCircle className="w-3 h-3" /> Ativo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-destructive shrink-0">
                                  <XCircle className="w-3 h-3" /> Bloqueado
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            {(u.telefone || u.celular) && (
                              <p className="text-xs text-muted-foreground mt-0.5">{u.telefone ?? u.celular}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                          <RequiresPermission permission="admin:usuarios:criar">
                            <button
                              type="button"
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 hover:bg-primary/10 rounded-lg text-xs text-primary font-medium"
                              onClick={() => setPermissoesUsuario(u)}
                            >
                              <Shield className="w-3.5 h-3.5" /> Permissões
                            </button>
                            <button type="button" className="p-2 hover:bg-white/10 rounded-lg" onClick={() => openEdit(u)}>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </RequiresPermission>
                          <RequiresPermission permission="admin:usuarios:deletar">
                            <button
                              type="button"
                              disabled={toggleBloqueadoMutation.isPending}
                              className="p-2 hover:bg-warning/20 rounded-lg disabled:opacity-40"
                              onClick={() => toggleBloqueadoMutation.mutate({ id: u.id, bloqueado: !u.bloqueado })}
                            >
                              <Trash2 className={`w-3.5 h-3.5 ${u.bloqueado ? "text-success" : "text-destructive"}`} />
                            </button>
                          </RequiresPermission>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {tab === "perfis" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(perfisBase).map(([nome, perms]) => (
            <div key={nome} className="glass-panel rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-white">{nome}</p>
                  <p className="text-xs text-muted-foreground">{perms.length} permissões</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {perms.slice(0, 12).map((p) => (
                  <span key={p} className="text-[10px] bg-white/5 border border-white/10 text-muted-foreground px-2 py-0.5 rounded">
                    {p}
                  </span>
                ))}
                {perms.length > 12 && (
                  <span className="text-[10px] text-primary">+{perms.length - 12} mais</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
