import {useEffect, useId, useState, type FormEvent} from "react";
import {Info, Lock, User} from "lucide-react";
import {ApiError, fetchApiData} from "@/lib/api-config";
import {useAuth} from "@/hooks/use-auth";
import {useToast} from "@/hooks/use-toast";
import {
    gravarPreferencias,
    lerPreferencias,
    PAGINAS_INICIAIS,
    type PreferenciasUsuario,
} from "@/lib/preferencias-usuario";
import {SelectCampo} from "@/components/ui/select-campo";
import {
    Modal,
    ModalBody,
    ModalFooter,
    ModalForm,
    ModalHeader,
    ModalSpinner,
    modalBtnPrimaryCls,
    modalBtnSecondaryCls,
} from "@/components/ui/modal-responsivo";
import {formatarQuando, iniciaisDe} from "./formatos";

type Perfil = {
    nome: string;
    email: string;
    telefone: string | null;
    cargo: string | null;
    ultimo_acesso: string | null;
    ultimo_acesso_dispositivo: string | null;
};

export function PerfilModal({
                                foco,
                                onClose,
                            }: {
    foco: "perfil" | "preferencias";
    onClose: () => void;
}) {
    const {user, definirUsuario} = useAuth();
    const {toast} = useToast();
    const nomeId = useId();
    const emailId = useId();
    const telId = useId();
    const cargoId = useId();
    const homeId = useId();
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [nome, setNome] = useState(user?.nome ?? "");
    const [telefone, setTelefone] = useState(user?.telefone ?? "");
    const [cargo, setCargo] = useState(user?.cargo ?? "");
    const [email, setEmail] = useState(user?.email ?? "");
    const [ultimo, setUltimo] = useState<string | null>(user?.ultimo_acesso ?? null);
    const [dispositivo, setDispositivo] = useState<string | null>(null);
    const [prefs, setPrefs] = useState<PreferenciasUsuario>(() => lerPreferencias(user?.id));
    const [erroNome, setErroNome] = useState<string | null>(null);

    useEffect(() => {
        let ativo = true;
        void fetchApiData<Perfil>("/me")
            .then((perfil) => {
                if (!ativo) return;
                setNome(perfil.nome ?? "");
                setTelefone(perfil.telefone ?? "");
                setCargo(perfil.cargo ?? "");
                setEmail(perfil.email ?? "");
                setUltimo(perfil.ultimo_acesso);
                setDispositivo(perfil.ultimo_acesso_dispositivo);
            })
            .catch(() => undefined)
            .finally(() => {
                if (ativo) setCarregando(false);
            });
        return () => {
            ativo = false;
        };
    }, []);

    async function salvar(e: FormEvent) {
        e.preventDefault();
        if (!user) return;
        const nomeLimpo = nome.trim();
        if (nomeLimpo.length < 2) {
            setErroNome("Informe o nome.");
            return;
        }
        setErroNome(null);
        setSalvando(true);
        try {
            const atualizado = await fetchApiData<Perfil>("/me", {
                method: "PATCH",
                body: JSON.stringify({
                    nome: nomeLimpo,
                    telefone: telefone.trim(),
                    cargo: cargo.trim(),
                }),
            });
            definirUsuario({
                nome: atualizado.nome,
                telefone: atualizado.telefone,
                cargo: atualizado.cargo,
            });
            const gravou = gravarPreferencias(user.id, {
                paginaInicial: prefs.paginaInicial,
                ocultarSaldos: lerPreferencias(user.id).ocultarSaldos,
            });
            window.dispatchEvent(new Event("ism-preferencias"));
            toast({
                title: "Perfil salvo",
                description: gravou
                    ? "Seus dados e as preferências deste navegador foram atualizados."
                    : "Os dados foram salvos. Este navegador bloqueou as preferências.",
            });
            onClose();
        } catch (err: unknown) {
            const message = err instanceof ApiError ? err.message : "Não foi possível salvar.";
            toast({variant: "destructive", title: "Meu perfil", description: message});
        } finally {
            setSalvando(false);
        }
    }

    return (
        <Modal
            onClose={onClose}
            initialFocus={foco === "preferencias" ? (el) => el.querySelector<HTMLElement>("[data-pref-home] button") : "first-field"}
        >
            <ModalHeader
                title="Meu perfil"
                description="Seus dados e preferências neste navegador"
                icon={
                    <span
                        className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white text-xs font-bold">
                        {iniciaisDe(nome || user?.nome || "?")}
                    </span>
                }
            />
            <ModalForm
                onSubmit={(e) => void salvar(e)}
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.requestSubmit();
                    }
                }}
            >
                <ModalBody>
                    {carregando ? (
                        <p className="text-sm text-muted-foreground">Carregando perfil…</p>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <section aria-labelledby="dados-pessoais">
                                <h3 id="dados-pessoais"
                                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                                    Dados pessoais
                                </h3>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1"
                                       htmlFor={nomeId}>
                                    Nome completo <span className="text-destructive">*</span>
                                </label>
                                <input
                                    id={nomeId}
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    required
                                    aria-invalid={erroNome ? true : undefined}
                                    aria-describedby={erroNome ? `${nomeId}-erro` : undefined}
                                    className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-primary"
                                />
                                {erroNome && (
                                    <p id={`${nomeId}-erro`} className="mt-1 text-xs text-destructive" role="alert">
                                        {erroNome}
                                    </p>
                                )}

                                <label className="block text-xs font-semibold text-muted-foreground mt-4 mb-1"
                                       htmlFor={emailId}>
                                    E-mail
                                </label>
                                <div className="relative">
                                    <input
                                        id={emailId}
                                        value={email}
                                        readOnly
                                        aria-readonly="true"
                                        className="w-full rounded-xl bg-white/5 border border-dashed border-white/10 px-3 py-2.5 pr-28 text-sm text-muted-foreground"
                                    />
                                    <span
                                        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Lock className="w-3 h-3" aria-hidden="true"/> somente leitura
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    O e-mail é o seu login e só pode ser alterado por um administrador.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1"
                                               htmlFor={telId}>
                                            Telefone
                                        </label>
                                        <input
                                            id={telId}
                                            value={telefone}
                                            onChange={(e) => setTelefone(e.target.value)}
                                            inputMode="tel"
                                            autoComplete="tel"
                                            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-muted-foreground mb-1"
                                               htmlFor={cargoId}>
                                            Cargo
                                        </label>
                                        <input
                                            id={cargoId}
                                            value={cargo}
                                            onChange={(e) => setCargo(e.target.value)}
                                            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-primary"
                                        />
                                    </div>
                                </div>

                                <p className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
                                    <User className="w-3.5 h-3.5 shrink-0" aria-hidden="true"/>
                                    Último acesso: {formatarQuando(ultimo)}
                                    {dispositivo ? ` · ${dispositivo}` : ""}
                                </p>
                            </section>

                            <section aria-labelledby="preferencias"
                                     className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <h3 id="preferencias"
                                    className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                                    Preferências
                                </h3>
                                <div data-pref-home="">
                                <label className="block text-xs font-semibold text-muted-foreground mb-1"
                                       htmlFor={homeId}>
                                    Página inicial
                                </label>
                                <SelectCampo
                                    id={homeId}
                                    value={prefs.paginaInicial}
                                    onChange={(value) => setPrefs((p) => ({
                                        ...p,
                                        paginaInicial: value as PreferenciasUsuario["paginaInicial"],
                                    }))}
                                    opcoes={PAGINAS_INICIAIS.map((p) => ({value: p.rota, label: p.rotulo}))}
                                />
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Para onde você vai depois do login.
                                </p>
                                <p className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground">
                                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true"/>
                                    As preferências ficam salvas só neste navegador, para o seu usuário.
                                </p>
                            </section>
                        </div>
                    )}
                </ModalBody>
                <ModalFooter hint="* Campo obrigatório · Esc fecha · Ctrl+Enter salva">
                    <button type="button" className={modalBtnSecondaryCls} onClick={onClose} disabled={salvando}>
                        Cancelar
                    </button>
                    <button type="submit" className={modalBtnPrimaryCls} disabled={salvando || carregando}>
                        {salvando ? <ModalSpinner label="Salvando..."/> : "Salvar"}
                    </button>
                </ModalFooter>
            </ModalForm>
        </Modal>
    );
}
