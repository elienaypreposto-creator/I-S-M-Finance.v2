import {Link} from "wouter";
import {ShieldOff} from "lucide-react";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import {permissoesGranulares} from "@/lib/perfis-acesso";

function nomePermissao(codigo: string): string | undefined {
    for (const grupo of permissoesGranulares) {
        const item = grupo.itens.find((i) => i.codigo === codigo);
        if (item) return item.nome;
    }
    return undefined;
}

/**
 * Tela aberta pela URL sem a permissão que a libera. Substitui a tela (que
 * tomaria 403 da API) por uma explicação e o caminho de volta.
 */
export function AcessoNegado({permissao, superadminOnly}: { permissao?: string; superadminOnly?: boolean }) {
    const nome = permissao ? nomePermissao(permissao) : undefined;
    return (
        <div className="p-4 sm:p-8">
            <Empty role="alert" className="glass-panel rounded-2xl border border-white/10">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <ShieldOff aria-hidden="true"/>
                    </EmptyMedia>
                    <EmptyTitle className="text-white">Acesso negado</EmptyTitle>
                    <EmptyDescription>
                        {superadminOnly
                            ? "Esta tela é restrita à equipe ISM."
                            : "Seu usuário não tem permissão para abrir esta tela nesta empresa."}
                        {nome && (
                            <>
                                {" "}Permissão necessária: <strong className="text-white">{nome}</strong>.
                            </>
                        )}
                        {!superadminOnly && " Se precisar dela, peça ao administrador da empresa."}
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Link
                        href="/"
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all"
                    >
                        Voltar para o início
                    </Link>
                </EmptyContent>
            </Empty>
        </div>
    );
}
