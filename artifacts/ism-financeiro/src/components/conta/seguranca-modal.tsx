import {useEffect, useId, useRef, useState, type FormEvent} from "react";
import {Eye, EyeOff, Loader2, Shield} from "lucide-react";
import {ApiError, fetchApi, fetchApiData} from "@/lib/api-config";
import {useAuth} from "@/hooks/use-auth";
import {useToast} from "@/hooks/use-toast";
import {SenhaForca} from "@/components/auth/senha-forca";
import {
    Modal,
    ModalBody,
    ModalHeader,
    modalBtnDangerCls,
    modalBtnPrimaryCls,
    modalBtnSecondaryCls,
} from "@/components/ui/modal-responsivo";
import {formatarQuando, haQuantoTempo} from "./formatos";

type Sessao = {
    id: string;
    dispositivo: string;
    ip: string;
    inicio: string;
    ultimoUso: string;
    atual: boolean;
};

type RespostaSessoes = {
    sessoes: Sessao[];
    ultimo_acesso: string | null;
    ultimo_acesso_dispositivo: string | null;
    tentativas: { total: number; ips: string[] } | null;
};

function CampoSenha({
                        id,
                        label,
                        value,
                        onChange,
                        autoComplete,
                        erroId,
                        erro,
                        describedBy,
                    }: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    autoComplete: string;
    erroId?: string;
    erro?: string | null;
    describedBy?: string;
}) {
    const [visivel, setVisivel] = useState(false);
    return (
        <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1" htmlFor={id}>
                {label} <span className="text-destructive">*</span>
            </label>
            <div className="relative">
                <input
                    id={id}
                    type={visivel ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    autoComplete={autoComplete}
                    required
                    aria-invalid={erro ? true : undefined}
                    aria-describedby={[describedBy, erro ? erroId : null].filter(Boolean).join(" ") || undefined}
                    className={`w-full rounded-xl bg-black/30 border px-3 py-2.5 pr-10 text-sm text-white outline-none focus:border-primary ${erro ? "border-destructive" : "border-white/10"}`}
                />
                <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-white"
                    aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setVisivel((v) => !v)}
                >
                    {visivel ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
            </div>
            {erro && (
                <p id={erroId} className="mt-1 text-xs text-destructive" role="alert">
                    {erro}
                </p>
            )}
        </div>
    );
}

export function SegurancaModal({onClose}: { onClose: () => void }) {
    const {user} = useAuth();
    const {toast} = useToast();
    const atualId = useId();
    const novaId = useId();
    const confId = useId();
    const forcaId = useId();
    const erroConfId = useId();
    const erroAtualId = useId();
    const erroNovaId = useId();
    const cancelarRef = useRef<HTMLButtonElement>(null);
    const [sessoes, setSessoes] = useState<Sessao[]>([]);
    const [ultimo, setUltimo] = useState<string | null>(user?.ultimo_acesso ?? null);
    const [dispositivo, setDispositivo] = useState<string | null>(null);
    const [tentativas, setTentativas] = useState<RespostaSessoes["tentativas"]>(null);
    const [carregando, setCarregando] = useState(true);
    const [atual, setAtual] = useState("");
    const [nova, setNova] = useState("");
    const [confirma, setConfirma] = useState("");
    const [erroAtual, setErroAtual] = useState<string | null>(null);
    const [erroNova, setErroNova] = useState<string | null>(null);
    const [erroConf, setErroConf] = useState<string | null>(null);
    const [trocando, setTrocando] = useState(false);
    const [encerrando, setEncerrando] = useState<string | null>(null);
    const [confirmarTodas, setConfirmarTodas] = useState(false);

    async function recarregar() {
        const res = await fetchApiData<RespostaSessoes>("/me/sessoes");
        setSessoes(res.sessoes);
        setUltimo(res.ultimo_acesso);
        setDispositivo(res.ultimo_acesso_dispositivo);
        setTentativas(res.tentativas);
    }

    useEffect(() => {
        let ativo = true;
        void recarregar()
            .catch(() => undefined)
            .finally(() => {
                if (ativo) setCarregando(false);
            });
        return () => {
            ativo = false;
        };
    }, []);

    const outras = sessoes.filter((s) => !s.atual);

    async function trocarSenha(e: FormEvent) {
        e.preventDefault();
        setErroAtual(null);
        setErroNova(null);
        setErroConf(null);
        if (nova !== confirma) {
            setErroConf("As senhas não conferem.");
            return;
        }
        setTrocando(true);
        try {
            await fetchApi("/me/senha", {
                method: "POST",
                body: JSON.stringify({senha_atual: atual, senha_nova: nova}),
            });
            setAtual("");
            setNova("");
            setConfirma("");
            await recarregar().catch(() => undefined);
            toast({title: "Senha alterada", description: "As outras sessões foram encerradas. Esta continua ativa."});
        } catch (err: unknown) {
            if (err instanceof ApiError && err.code === "WEAK_PASSWORD") {
                setErroNova(err.message);
            } else {
                const message = err instanceof ApiError ? err.message : "Não foi possível alterar a senha.";
                setErroAtual(message);
            }
        } finally {
            setTrocando(false);
        }
    }

    async function encerrar(id: string) {
        setEncerrando(id);
        try {
            await fetchApi(`/me/sessoes/${id}`, {method: "DELETE"});
            await recarregar();
        } catch (err: unknown) {
            const message = err instanceof ApiError ? err.message : "Não foi possível encerrar a sessão.";
            toast({variant: "destructive", title: "Sessões", description: message});
        } finally {
            setEncerrando(null);
        }
    }

    async function encerrarOutras() {
        setConfirmarTodas(false);
        setTrocando(true);
        try {
            await fetchApi("/me/sessoes?outras=true", {method: "DELETE"});
            await recarregar();
            toast({title: "Sessões encerradas", description: "Só esta sessão continua ativa."});
        } catch (err: unknown) {
            const message = err instanceof ApiError ? err.message : "Não foi possível encerrar as sessões.";
            toast({variant: "destructive", title: "Sessões", description: message});
        } finally {
            setTrocando(false);
        }
    }

    return (
        <Modal onClose={onClose} initialFocus="content">
            <ModalHeader
                title="Segurança"
                description={`Senha, sessões ativas e acessos da conta ${user?.email ?? ""}`}
                icon={<Shield className="w-5 h-5 text-primary"/>}
            />
            <ModalBody>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <form
                        onSubmit={(e) => void trocarSenha(e)}
                        onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                                e.preventDefault();
                                e.currentTarget.requestSubmit();
                            }
                        }}
                        className="space-y-3"
                        aria-labelledby="trocar-senha"
                    >
                        <h3 id="trocar-senha"
                            className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Trocar senha
                        </h3>
                        <CampoSenha
                            id={atualId}
                            label="Senha atual"
                            value={atual}
                            onChange={setAtual}
                            autoComplete="current-password"
                            erro={erroAtual}
                            erroId={erroAtualId}
                        />
                        <CampoSenha
                            id={novaId}
                            label="Nova senha"
                            value={nova}
                            onChange={setNova}
                            autoComplete="new-password"
                            erro={erroNova}
                            erroId={erroNovaId}
                            describedBy={forcaId}
                        />
                        <div id={forcaId}>
                            <SenhaForca senha={nova} email={user?.email} nome={user?.nome}/>
                        </div>
                        <CampoSenha
                            id={confId}
                            label="Confirmar nova senha"
                            value={confirma}
                            onChange={setConfirma}
                            autoComplete="new-password"
                            erro={erroConf}
                            erroId={erroConfId}
                        />
                        <p className="text-xs text-muted-foreground rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                            Ao trocar a senha, as outras sessões são encerradas. Esta sessão continua ativa.
                        </p>
                        <button type="submit" className={modalBtnPrimaryCls} disabled={trocando}>
                            {trocando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true"/> : null}
                            Trocar senha
                        </button>
                    </form>

                    <section aria-labelledby="sessoes-ativas">
                        <div className="flex items-center justify-between mb-2">
                            <h3 id="sessoes-ativas"
                                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Sessões ativas
                            </h3>
                            <span className="text-[11px] text-muted-foreground">
                                {sessoes.length === 1 ? "1 dispositivo" : `${sessoes.length} dispositivos`}
                            </span>
                        </div>
                        {carregando ? (
                            <p className="text-sm text-muted-foreground">Carregando sessões…</p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-white/10">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-white/5 text-muted-foreground">
                                    <tr>
                                        <th scope="col" className="px-3 py-2 font-semibold">Dispositivo / navegador</th>
                                        <th scope="col" className="px-3 py-2 font-semibold">IP</th>
                                        <th scope="col" className="px-3 py-2 font-semibold">Início</th>
                                        <th scope="col" className="px-3 py-2 font-semibold">Último uso</th>
                                        <th scope="col" className="px-3 py-2 font-semibold"><span
                                            className="sr-only">Ações</span></th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {sessoes.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                                                Nenhuma sessão registrada neste servidor. Entre de novo para ela
                                                aparecer aqui.
                                            </td>
                                        </tr>
                                    ) : sessoes.map((s) => (
                                        <tr key={s.id} className="border-t border-white/5">
                                            <th scope="row" className="px-3 py-2 font-medium text-white">
                                                {s.dispositivo}
                                                {s.atual && (
                                                    <span
                                                        className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                                                            Esta sessão
                                                        </span>
                                                )}
                                            </th>
                                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{s.ip}</td>
                                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatarQuando(s.inicio)}</td>
                                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                                {s.atual ? "agora" : haQuantoTempo(s.ultimoUso)}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {s.atual ? (
                                                    <span className="text-[10px] text-muted-foreground">Atual</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border border-destructive/40 px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
                                                        aria-label={`Encerrar sessão ${s.dispositivo}`}
                                                        disabled={encerrando === s.id}
                                                        onClick={() => void encerrar(s.id)}
                                                    >
                                                        Encerrar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="mt-2 text-[11px] text-muted-foreground">IP mascarado · dispositivo lido do
                            navegador.</p>
                        <div className="mt-3 flex justify-end">
                            <button
                                type="button"
                                className={modalBtnDangerCls}
                                disabled={outras.length === 0}
                                onClick={() => setConfirmarTodas(true)}
                            >
                                Sair de todos os outros dispositivos ({outras.length})
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
                                Último acesso: {formatarQuando(ultimo)}
                                {dispositivo ? <span className="block mt-0.5">{dispositivo}</span> : null}
                            </p>
                            {tentativas && tentativas.total > 0 && (
                                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                                   role="status">
                                    {tentativas.total === 1
                                        ? "1 tentativa sem sucesso"
                                        : `${tentativas.total} tentativas sem sucesso`}
                                    {tentativas.ips.length > 0 && (
                                        <span
                                            className="block mt-0.5 text-amber-100/80">{tentativas.ips.join(" · ")}</span>
                                    )}
                                </p>
                            )}
                        </div>
                    </section>
                </div>
            </ModalBody>

            {confirmarTodas && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirmar-sessoes"
                    className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-4"
                >
                    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1c23] p-5 shadow-2xl">
                        <h4 id="confirmar-sessoes" className="text-base font-bold text-white">
                            Sair de todos os outros dispositivos?
                        </h4>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {outras.length === 1
                                ? "1 sessão será encerrada. Esta sessão continua ativa."
                                : `${outras.length} sessões serão encerradas. Esta sessão continua ativa.`}
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                ref={cancelarRef}
                                type="button"
                                autoFocus
                                className={modalBtnSecondaryCls}
                                onClick={() => setConfirmarTodas(false)}
                            >
                                Cancelar
                            </button>
                            <button type="button" className={modalBtnDangerCls} onClick={() => void encerrarOutras()}>
                                Encerrar {outras.length} {outras.length === 1 ? "sessão" : "sessões"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
