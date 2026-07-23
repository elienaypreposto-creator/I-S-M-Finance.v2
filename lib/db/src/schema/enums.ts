import {pgEnum} from "drizzle-orm/pg-core";

export const tipoLancamentoEnum = pgEnum("tipo_lancamento", ["CP", "CR"]);

export const statusLancamentoEnum = pgEnum("status_lancamento", [
    "pendente",
    "pago",
    "recebido",
    "atrasado",
    "cancelado",
    "pago_parcial",
]);

export const origemLancamentoEnum = pgEnum("origem_lancamento", [
    "manual",
    "conciliacao",
    "importacao",
    "transferencia",
    "residuo_parcial",
]);

export const tipoMovimentoExtratoEnum = pgEnum("tipo_movimento_extrato", [
    "debito",
    "credito",
]);

export const statusConciliacaoEnum = pgEnum("status_conciliacao", [
    "pendente",
    "conciliado",
]);

export const statusItemConciliacaoEnum = pgEnum("status_item_conciliacao", [
    "pendente",
    "vinculado",
    "ignorado",
]);

export const acaoHistoricoConciliacaoEnum = pgEnum("acao_historico_conciliacao", [
    "vincular",
    "ignorar",
    "desfazer_vinculo",
    "criar_transferencia",
    "criar_residuo_parcial",
    "salvar",
]);

export const statusExtratoEnum = pgEnum("status_extrato", [
    "pendente",
    "parcial",
    "conciliado",
    "cancelado",
]);

export const statusCadastroEnum = pgEnum("status_cadastro", ["ativo", "bloqueado"]);
