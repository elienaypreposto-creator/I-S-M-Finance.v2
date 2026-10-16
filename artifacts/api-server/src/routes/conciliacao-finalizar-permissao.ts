import {PERM} from "../constants/permissoes";
import {hasPermission} from "../middlewares/withPermission";

type UsuarioPermissao = {
    superadmin?: boolean;
    permissions?: string[];
};

/** `POST /conciliacoes/:id/salvar` com `finalizar=true` exige concluir, além de vincular. */
export function finalizarConciliacaoNegada(user: UsuarioPermissao | undefined, finalizar: boolean): boolean {
    return Boolean(
        finalizar
        && !user?.superadmin
        && !hasPermission(user?.permissions, PERM.CONCILIACAO_CONCLUIR),
    );
}

export const MSG_FINALIZAR_CONCILIACAO_NEGADA =
    `Acesso negado: permissão "${PERM.CONCILIACAO_CONCLUIR}" necessária.`;
