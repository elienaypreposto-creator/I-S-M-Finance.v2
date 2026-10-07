import {PageHeader} from "@/components/shared/page-header";
import {RegraConciliacaoModal} from "@/components/conciliacao/regra-conciliacao-modal";

export default function RegrasConciliacao() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Regras de Conciliação"
                description="Cadastre textos-gatilho para classificar linhas do extrato automaticamente, sem precisar importar um arquivo."
            />
            <RegraConciliacaoModal open variant="page" onClose={() => undefined} />
        </div>
    );
}
