/**
 * Rola só o contêiner com barra de rolagem mais próximo até o elemento.
 *
 * `el.scrollIntoView()` rola TODOS os ancestrais, inclusive os com
 * `overflow: hidden` do layout do app: no "Ir para a linha" da conciliação a
 * página inteira subia e o cabeçalho do app saía da tela.
 */

/** scrollTop que centraliza o elemento no contêiner (limitado ao que dá para rolar). */
export function scrollTopParaCentralizar(p: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    /** Topo do contêiner e do elemento na viewport (getBoundingClientRect().top). */
    conteinerTop: number;
    elementoTop: number;
    elementoAltura: number;
}): number {
    const topoNoConteudo = p.elementoTop - p.conteinerTop + p.scrollTop;
    const alvo = topoNoConteudo - (p.clientHeight - p.elementoAltura) / 2;
    const maximo = Math.max(0, p.scrollHeight - p.clientHeight);
    return Math.round(Math.min(Math.max(0, alvo), maximo));
}

function rolavelVerticalmente(el: HTMLElement): boolean {
    const {overflowY} = getComputedStyle(el);
    return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight;
}

/**
 * Centraliza `el` no primeiro ancestral com rolagem vertical (auto/scroll).
 * Sem nenhum, rola a janela (documento com rolagem própria); ancestrais com
 * overflow hidden nunca são rolados. Devolve o contêiner rolado (null = janela).
 */
export function rolarAteElemento(el: HTMLElement, comportamento: ScrollBehavior = "smooth"): HTMLElement | null {
    let conteiner = el.parentElement;
    while (conteiner && conteiner !== document.body && !rolavelVerticalmente(conteiner)) {
        conteiner = conteiner.parentElement;
    }
    if (!conteiner || conteiner === document.body) {
        const re = el.getBoundingClientRect();
        const doc = document.scrollingElement ?? document.documentElement;
        const top = scrollTopParaCentralizar({
            scrollTop: window.scrollY,
            scrollHeight: doc.scrollHeight,
            clientHeight: window.innerHeight,
            conteinerTop: 0,
            elementoTop: re.top,
            elementoAltura: re.height,
        });
        window.scrollTo({top, behavior: comportamento});
        return null;
    }

    const rc = conteiner.getBoundingClientRect();
    const re = el.getBoundingClientRect();
    const top = scrollTopParaCentralizar({
        scrollTop: conteiner.scrollTop,
        scrollHeight: conteiner.scrollHeight,
        clientHeight: conteiner.clientHeight,
        conteinerTop: rc.top,
        elementoTop: re.top,
        elementoAltura: re.height,
    });
    if (typeof conteiner.scrollTo === "function") {
        conteiner.scrollTo({top, behavior: comportamento});
    } else {
        conteiner.scrollTop = top;
    }
    return conteiner;
}
