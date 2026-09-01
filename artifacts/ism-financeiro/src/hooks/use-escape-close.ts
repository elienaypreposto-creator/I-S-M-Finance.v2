import {useEffect, useRef} from "react";

export const DISCARD_PROMPT = {
    title: "Sair sem salvar?",
    description: "As informações preenchidas serão perdidas. Deseja realmente sair?",
    confirmLabel: "Sair sem salvar",
    cancelLabel: "Continuar",
    variant: "destructive" as const,
};

type EscapeListener = {id: number; zIndex: number; handler: () => void};

let nextId = 0;
const stack: EscapeListener[] = [];

export function useEscapeClose(enabled: boolean, onEscape: () => void, zIndex = 50) {
    const onEscapeRef = useRef(onEscape);
    onEscapeRef.current = onEscape;

    useEffect(() => {
        if (!enabled) return;

        const id = ++nextId;
        const entry: EscapeListener = {id, zIndex, handler: () => onEscapeRef.current()};
        stack.push(entry);

        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (e.defaultPrevented) return;
            const top = stack.reduce((a, b) => (b.zIndex >= a.zIndex ? b : a));
            if (top.id !== id) return;
            e.preventDefault();
            e.stopPropagation();
            top.handler();
        };

        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            const i = stack.findIndex((s) => s.id === id);
            if (i >= 0) stack.splice(i, 1);
        };
    }, [enabled, zIndex]);
}
