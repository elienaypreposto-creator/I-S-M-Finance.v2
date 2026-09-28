/**
 * Códigos de permissão da API (padrão dominio:recurso:acao).
 *
 * O catálogo canónico vive em `@workspace/db/permissoes` e é reexportado aqui
 * para o schema Zod (`z.enum`) e para withPermission / rotas.
 */
import {z} from "zod";
import {PERMISSOES_ADMIN, type PermissaoCatalogo} from "@workspace/db/permissoes";

export {PERMISSOES_ADMIN, type PermissaoCatalogo};

export const PERM = {
    CONCILIACAO_ACESSAR: "financeiro:conciliacao:acessar",
    CONCILIACAO_IMPORTAR: "financeiro:conciliacao:importar",
    CONCILIACAO_VINCULAR: "financeiro:conciliacao:vincular",
    CONCILIACAO_IGNORAR: "financeiro:conciliacao:ignorar",
    CONCILIACAO_DESFAZER: "financeiro:conciliacao:desfazer",
    CONCILIACAO_CONCLUIR: "financeiro:conciliacao:concluir",
    /** Configuração do módulo (ex.: motivo_ignorar_obrigatorio) + jobs manuais. */
    CONCILIACAO_CONFIGURAR: "financeiro:conciliacao:configurar",
    /** Legacy (UI antiga). Preferir as ações granulares acima. */
    CONCILIACAO_CONCILIAR: "financeiro:conciliacao:conciliar",
    LANCAMENTOS_EDITAR: "financeiro:lancamentos:editar",
    LANCAMENTOS_ALTERAR_VALOR: "financeiro:lancamentos:alterar_valor",
    RELATORIOS_CONCILIACAO: "relatorios:conciliacao",
    RELATORIOS_METAS: "relatorios:metas",
    RELATORIOS_DRE: "relatorios:dre",
    RELATORIOS_FLUXO_CAIXA: "relatorios:fluxo-caixa-mensal",
    RELATORIOS_FECHAMENTO: "relatorios:financeiro",
    RELATORIOS_CONTABIL: "relatorios:contabil-fiscal",
    REGRAS_CONCILIACAO_LISTAR: "financeiro:regras-conciliacao:listar",
    REGRAS_CONCILIACAO_CRIAR: "financeiro:regras-conciliacao:criar",
    REGRAS_CONCILIACAO_EDITAR: "financeiro:regras-conciliacao:editar",
    REGRAS_CONCILIACAO_DELETAR: "financeiro:regras-conciliacao:deletar",
    ADMIN_PERMISSOES_CONCEDER: "admin:permissoes:conceder",
    ADMIN_EMPRESAS_LISTAR: "admin:empresas:listar",
    ADMIN_EMPRESAS_CRIAR: "admin:empresas:criar",
    ADMIN_EMPRESAS_EDITAR: "admin:empresas:editar",
    ADMIN_USUARIOS_LISTAR: "admin:usuarios:listar",
    ADMIN_USUARIOS_CRIAR: "admin:usuarios:criar",
    ADMIN_USUARIOS_EDITAR: "admin:usuarios:editar",
    ADMIN_USUARIOS_DELETAR: "admin:usuarios:deletar",
} as const;

export type PermissaoCodigo = (typeof PERM)[keyof typeof PERM];

/**
 * NOVO — Card 2 (Permissões). Concedido automaticamente pelo `fetchPermissions`
 * (routes/auth.ts) a quem tem `papel = "admin"` em `usuario_empresas` para a
 * empresa ativa — NÃO é uma linha gravada em `usuario_permissoes`, é
 * calculado no momento de emitir o token. Cobre as ações de gestão de
 * usuários DENTRO da empresa (distinto de `superadmin`, que é acesso
 * irrestrito a TODAS as empresas — ver usuarios.ts).
 *
 * Lista de códigos concretos (não um wildcard `"admin:usuarios:*"`): assim
 * `withPermission`/`permissions.includes(...)` continua sendo comparação
 * exata em todo lugar, sem precisar de lógica de prefixo em lugar nenhum.
 */
export const ADMIN_USUARIOS_AUTOMATICAS = [
    PERM.ADMIN_USUARIOS_LISTAR,
    PERM.ADMIN_USUARIOS_CRIAR,
    PERM.ADMIN_USUARIOS_EDITAR,
    PERM.ADMIN_USUARIOS_DELETAR,
] as const satisfies readonly PermissaoCatalogo[];

/** Tuple não-vazia exigida por `z.enum`. `"*"` não faz parte do catálogo. */
const PERMISSOES_ENUM_VALUES = PERMISSOES_ADMIN as unknown as [
    PermissaoCatalogo,
    ...PermissaoCatalogo[],
];

export const codigoPermissaoCatalogoSchema = z.enum(PERMISSOES_ENUM_VALUES);