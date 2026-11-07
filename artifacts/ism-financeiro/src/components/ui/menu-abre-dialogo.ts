import {useCallback, useRef} from "react";

/**
 * Item de DropdownMenu/ContextMenu que abre Dialog, AlertDialog, Sheet ou <Modal>.
 *
 * O menu do Radix é modal: enquanto está montado, prende o foco e põe
 * `pointer-events: none` no <body>. Ao escolher um item, o menu só sai do DOM
 * depois da animação de saída; se o diálogo abre no mesmo clique, as duas
 * camadas modais ficam montadas juntas e disputam o foco e o estilo do <body>.
 * Dependendo da ordem em que elas desmontam, o `pointer-events: none` fica
 * para trás e a página para de responder a cliques depois de fechar o diálogo.
 *
 * Aqui o item só agenda a ação; ela roda em `onCloseAutoFocus`, que o Radix
 * dispara depois que o menu saiu do DOM (camada e trava de foco já desfeitas).
 * O foco volta para o gatilho do menu antes de o diálogo abrir, e o diálogo o
 * devolve para lá ao fechar.
 *
 *   const depoisDoMenu = useAcaoAposFecharMenu();
 *   <DropdownMenuContent onCloseAutoFocus={depoisDoMenu.onCloseAutoFocus}>
 *     <DropdownMenuItem onSelect={() => depoisDoMenu.agendar(() => setPainel("seguranca"))}>
 */
export function useAcaoAposFecharMenu(): {
    agendar: (acao: () => void) => void;
    onCloseAutoFocus: (e: Event) => void;
} {
    const pendente = useRef<(() => void) | null>(null);
    const agendar = useCallback((acao: () => void) => {
        pendente.current = acao;
    }, []);
    const onCloseAutoFocus = useCallback(() => {
        const acao = pendente.current;
        pendente.current = null;
        acao?.();
    }, []);
    return {agendar, onCloseAutoFocus};
}
