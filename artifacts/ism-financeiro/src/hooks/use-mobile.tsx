import * as React from "react"

const MOBILE_BREAKPOINT = 992
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/** Lê o viewport agora (mesma regra do CSS), sem depender de estado guardado. */
export function viewportEhMobile(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia(MOBILE_QUERY).matches
}

function assinarViewport(avisar: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY)
  // "change" da media query é o sinal principal; "resize" cobre navegadores/
  // emulações que não disparam o change ao estreitar uma janela já aberta.
  mql.addEventListener("change", avisar)
  window.addEventListener("resize", avisar)
  return () => {
    mql.removeEventListener("change", avisar)
    window.removeEventListener("resize", avisar)
  }
}

/**
 * true abaixo de 992px. useSyncExternalStore relê `matchMedia(...).matches` a
 * cada render: além de seguir o resize, qualquer re-render (ex.: clique no
 * botão do menu) corrige um valor que tenha ficado velho. Antes o estado só
 * mudava no evento "change" e lia `innerWidth`, que pode divergir da media
 * query; ao estreitar a janela o menu ficava no modo desktop (oculto) e o
 * botão não abria nada.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(assinarViewport, viewportEhMobile, () => false)
}
