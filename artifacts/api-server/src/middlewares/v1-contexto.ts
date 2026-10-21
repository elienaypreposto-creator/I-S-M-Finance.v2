import type {Request} from "express";

// Extensão de tipos do Express.
declare global {
    namespace Express {
        interface Request {
            tenant?: {empresaId: number};
            apiToken?: {id: number; escopos: string[]};
        }
    }
}

export function popularContexto(
    req: Request,
    tokenRow: {
        id: number;
        empresa_id: number;
        escopos: string[] | null;
    },
) {
    req.tenant = {
        empresaId: tokenRow.empresa_id,
    };

    req.apiToken = {
        id: tokenRow.id,
        escopos: tokenRow.escopos ?? [],
    };

    // Identidade do token para a auditoria (logs_auditoria.token_api_id).
    req.tokenApiId = tokenRow.id;

    // Nenhum usuário herdado: o token não é identidade de pessoa.
    req.user = undefined;

    // req.user NÃO é preenchido: tokens de API não são usuários. Antes o id do
    // token ia em req.user.id e a auditoria atribuía a chamada ao usuário real
    // com o mesmo id. Sem req.user, usuario_id fica NULL e o tenant vem de
    // req.tenant (resolveAuditEmpresaId, tenant-tx e rotas v1 já o usam).
}