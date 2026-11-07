import {useLayoutEffect, useRef} from "react";

/**
 * Página que abre pelo menu começa no topo. O conteúdo rola dentro do <main>
 * do layout (overflow-y-auto), que guarda a rolagem da tela anterior; sem isto
 * o relatório podia abrir já rolado para baixo.
 *
 * Use o ref no elemento raiz da página.
 */
export function useRolarAoTopo<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null);
    useLayoutEffect(() => {
        const rolavel = ref.current?.closest("main");
        if (rolavel) rolavel.scrollTop = 0;
        window.scrollTo(0, 0);
    }, []);
    return ref;
}
