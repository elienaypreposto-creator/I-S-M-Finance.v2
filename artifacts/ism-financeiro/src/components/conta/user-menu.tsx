import {useState} from "react";
import {
    Building2,
    CircleHelp,
    LogOut,
    Settings2,
    Shield,
    User,
} from "lucide-react";
import {useAuth} from "@/hooks/use-auth";
import {nomeEmpresa} from "@/lib/tenant-query";
import {useToast} from "@/hooks/use-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Modal, ModalBody, ModalHeader} from "@/components/ui/modal-responsivo";
import {PerfilModal} from "./perfil-modal";
import {SegurancaModal} from "./seguranca-modal";
import {iniciaisDe} from "./formatos";

const COMMIT = import.meta.env.VITE_APP_COMMIT || "local";
const BUILD = import.meta.env.VITE_APP_BUILD || "";

type Painel = "perfil" | "preferencias" | "seguranca" | "ajuda" | null;

export function UserMenu() {
    const {user, empresas, empresaAtiva, logout, switchEmpresa} = useAuth();
    const {toast} = useToast();
    const [aberto, setAberto] = useState(false);
    const [painel, setPainel] = useState<Painel>(null);
    const nome = user?.nome ?? "Usuário";
    const podeTrocar = empresas.length > 1;

    async function trocar(id: number) {
        if (id === empresaAtiva?.id) return;
        try {
            await switchEmpresa(id);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Não foi possível trocar de empresa.";
            toast({variant: "destructive", title: "Trocar empresa", description: message});
        }
    }

    return (
        <>
            <DropdownMenu open={aberto} onOpenChange={setAberto}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Menu do usuário, ${nome}`}
                    >
                        <span className="text-right hidden sm:block">
                            <span className="block text-sm font-semibold leading-none text-foreground">{nome}</span>
                            <span
                                className="block text-xs text-muted-foreground mt-0.5">{user?.cargo || "Sem cargo"}</span>
                        </span>
                        <span
                            className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white text-xs font-bold shadow-lg border border-white/10">
                            {user?.nome ? iniciaisDe(user.nome) : "?"}
                        </span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="w-80 rounded-2xl border-white/10 bg-[#1a1c23] p-2 text-white shadow-2xl"
                >
                    <div className="flex items-start gap-3 px-2 py-2">
                        <span
                            className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {user?.nome ? iniciaisDe(user.nome) : "?"}
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{nome}</p>
                            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {user?.cargo && (
                                    <span
                                        className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">{user.cargo}</span>
                                )}
                                {empresaAtiva && (
                                    <span
                                        className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary truncate max-w-[180px]">
                                        {empresaAtiva.nome}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <DropdownMenuSeparator className="bg-white/10"/>
                    {podeTrocar && (
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="rounded-lg focus:bg-white/10 focus:text-white">
                                <Building2 aria-hidden="true"/>
                                Trocar empresa
                                <span className="text-[10px] text-muted-foreground">{empresas.length} vínculos</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="rounded-xl border-white/10 bg-[#1a1c23] text-white">
                                {empresas.map((empresa) => (
                                    <DropdownMenuItem
                                        key={empresa.id}
                                        className="focus:bg-white/10 focus:text-white"
                                        onSelect={() => void trocar(empresa.id)}
                                    >
                                        {nomeEmpresa(empresa)}
                                        {empresa.id === empresaAtiva?.id ? " · atual" : ""}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    )}
                    <DropdownMenuItem className="rounded-lg focus:bg-white/10 focus:text-white"
                                      onSelect={() => setPainel("perfil")}>
                        <User aria-hidden="true"/> Meu perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-lg focus:bg-white/10 focus:text-white"
                                      onSelect={() => setPainel("preferencias")}>
                        <Settings2 aria-hidden="true"/> Preferências
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-lg focus:bg-white/10 focus:text-white"
                                      onSelect={() => setPainel("seguranca")}>
                        <Shield aria-hidden="true"/> Segurança
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-lg focus:bg-white/10 focus:text-white"
                                      onSelect={() => setPainel("ajuda")}>
                        <CircleHelp aria-hidden="true"/> Ajuda e atalhos
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10"/>
                    <DropdownMenuItem
                        className="rounded-lg text-destructive focus:bg-destructive/15 focus:text-destructive"
                        onSelect={() => void logout()}
                    >
                        <LogOut aria-hidden="true"/> Sair
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {(painel === "perfil" || painel === "preferencias") && (
                <PerfilModal foco={painel} onClose={() => setPainel(null)}/>
            )}
            {painel === "seguranca" && <SegurancaModal onClose={() => setPainel(null)}/>}
            {painel === "ajuda" && (
                <Modal onClose={() => setPainel(null)} initialFocus="content">
                    <ModalHeader title="Ajuda e atalhos" description="Atalhos deste sistema"/>
                    <ModalBody>
                        <ul className="space-y-2 text-sm">
                            <li><kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">Esc</kbd> fecha o menu ou o
                                modal e devolve o foco.
                            </li>
                            <li><kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">Ctrl</kbd> ou <kbd
                                className="rounded bg-white/10 px-1.5 py-0.5 text-xs">⌘</kbd> + <kbd
                                className="rounded bg-white/10 px-1.5 py-0.5 text-xs">Enter</kbd> salva o formulário
                                aberto.
                            </li>
                            <li><kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">Tab</kbd> percorre os campos.
                                As setas movem o foco dentro do menu.
                            </li>
                        </ul>
                        <p className="mt-4 text-xs text-muted-foreground">
                            Versão {COMMIT}{BUILD ? ` · build ${BUILD}` : ""}
                        </p>
                    </ModalBody>
                </Modal>
            )}
        </>
    );
}
