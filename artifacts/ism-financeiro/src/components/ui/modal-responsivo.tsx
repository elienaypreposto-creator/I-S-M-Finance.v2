import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {Loader2, X} from "lucide-react";

import {cn} from "@/lib/utils";
import {PopoverPortalContainer} from "@/components/ui/popover";

// ── Modal responsivo (ISMF-38 / ISMF-39) ────────────────────────────────────
// Padrão de todos os modais de formulário/detalhe da plataforma:
//   * Dialog do Radix: foco preso, Esc fecha, `aria-labelledby` no título;
//   * 95vw de largura e no máximo 94dvh de altura (96dvh no celular), com
//     cabeçalho e rodapé fixos e só o corpo (<ModalBody>) rolando;
//   * escala proporcional: o conteúdo usa font-size
//     clamp(14px, 0.45vw + 8px, 18px) e a classe `modal-escala` (index.css)
//     reescreve os tokens do Tailwind (--spacing e --text-*) a partir desse
//     tamanho - `p-6`, `text-sm`, `w-4`... dentro do modal crescem e
//     encolhem junto, como as medidas em `em`. `text-xs` nunca fica abaixo
//     de 10,5px;
//   * o foco volta para quem abriu o modal ao fechar (o Radix só devolve o
//     foco a um DialogTrigger, e aqui os modais são montados pelo pai).
// Confirmações curtas ("Tem certeza?") continuam no AlertDialog compacto
// (components/shared/confirm-dialog).

/** Anel de foco visível (não só a cor da borda). */
export const modalFocusRingCls =
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#121417]";

/** Grade de campos: 1 coluna no celular, 2 a partir do `md` e 3 no `xl`. */
export const modalGridCls = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-[1.8em] gap-y-[1.2em]";
/** Grade de no máximo 2 colunas (formulários curtos). */
export const modalGrid2Cls = "grid grid-cols-1 md:grid-cols-2 gap-x-[1.8em] gap-y-[1.2em]";

export const modalBtnSecondaryCls = cn(
    "inline-flex items-center justify-center gap-[0.5em] min-h-[44px] md:min-h-0 px-[1.4em] py-[0.75em] rounded-[0.7em] border border-white/10 text-white hover:bg-white/5 text-[0.93em] font-bold transition-colors disabled:opacity-50",
    modalFocusRingCls,
);
export const modalBtnPrimaryCls = cn(
    "inline-flex items-center justify-center gap-[0.5em] min-h-[44px] md:min-h-0 px-[1.6em] py-[0.75em] rounded-[0.7em] bg-primary hover:bg-primary/90 text-white text-[0.93em] font-black shadow-xl shadow-primary/25 transition-colors disabled:opacity-50 disabled:pointer-events-none",
    modalFocusRingCls,
);
export const modalBtnDangerCls = cn(
    "inline-flex items-center justify-center gap-[0.5em] min-h-[44px] md:min-h-0 px-[1.6em] py-[0.75em] rounded-[0.7em] bg-destructive hover:bg-destructive/90 text-white text-[0.93em] font-black shadow-xl shadow-destructive/20 transition-colors disabled:opacity-50 disabled:pointer-events-none",
    modalFocusRingCls,
);

const FOCAVEIS =
    "button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])";

type ModalCtx = { onClose: () => void; setTemDescricao: (v: boolean) => void };
const ModalContext = React.createContext<ModalCtx | null>(null);

export type ModalProps = Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "onOpenAutoFocus"> & {
    /** Padrão: true (o pai monta o modal só quando ele está aberto). */
    open?: boolean;
    /** Esc, botão X e "Cancelar". Quem tem alterações não salvas pode pedir confirmação aqui. */
    onClose: () => void;
    /** Clique fora fecha? Padrão: não (evita perder o que foi digitado). */
    closeOnOutsideClick?: boolean;
    /** Para onde devolver o foco ao fechar. Padrão: o elemento focado quando o modal abriu. */
    returnFocusTo?: () => HTMLElement | null | undefined;
    /**
     * Foco inicial. Padrão ("first-field"): o primeiro campo do <ModalBody>
     * (e não o botão Fechar). "content": o próprio modal (leitura/detalhe).
     */
    initialFocus?: "first-field" | "content" | ((content: HTMLElement) => HTMLElement | null | undefined);
    overlayClassName?: string;
};

/**
 * Raiz + conteúdo do modal. Monte dentro dele <ModalHeader>, <ModalBody> e
 * <ModalFooter> (ou um <ModalForm> com <ModalBody> e <ModalFooter>).
 */
export const Modal = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, ModalProps>(
    ({
         open = true,
         onClose,
         closeOnOutsideClick = false,
         returnFocusTo,
         initialFocus = "first-field",
         overlayClassName,
         className,
         children,
         onCloseAutoFocus,
         onInteractOutside,
         ...props
     }, ref) => {
        const contentRef = React.useRef<HTMLDivElement | null>(null);
        const returnFocusRef = React.useRef<HTMLElement | null>(null);
        const [popoverHost, setPopoverHost] = React.useState<HTMLDivElement | null>(null);
        const [temDescricao, setTemDescricao] = React.useState(false);
        const onCloseRef = React.useRef(onClose);
        onCloseRef.current = onClose;
        const ctx = React.useMemo<ModalCtx>(() => ({onClose: () => onCloseRef.current(), setTemDescricao}), []);

        const setRefs = React.useCallback((el: HTMLDivElement | null) => {
            contentRef.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
        }, [ref]);

        return (
            <DialogPrimitive.Root open={open} onOpenChange={(o) => {
                if (!o) onCloseRef.current();
            }}>
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay
                        className={cn(
                            "fixed inset-0 z-[65] bg-black/70 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none",
                            overlayClassName,
                        )}
                    />
                    <DialogPrimitive.Content
                        ref={setRefs}
                        // Sem descrição, o Radix não deve apontar aria-describedby para um id inexistente.
                        {...(temDescricao ? {} : {"aria-describedby": undefined})}
                        {...props}
                        className={cn(
                            // Centralizado por inset + margin auto (sem translate): um
                            // transform viraria a referência de elementos position:fixed
                            // de dentro. overflow-clip (e não hidden): o contêiner não
                            // rola nem por scrollIntoView/foco - só o corpo rola.
                            "modal-escala fixed inset-0 m-auto h-fit z-[65]",
                            "w-[95vw] max-w-none max-h-[96dvh] md:max-h-[94dvh] p-0 flex flex-col overflow-clip",
                            "bg-[#121417] border border-white/10 rounded-[1.1em] shadow-2xl text-white outline-none",
                            "text-[clamp(14px,calc(0.45vw+8px),18px)]",
                            "duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none",
                            className,
                        )}
                        onOpenAutoFocus={(e) => {
                            // Roda antes de o foco entrar no modal: guarda quem o abriu.
                            const ativo = document.activeElement;
                            if (ativo instanceof HTMLElement && ativo !== document.body) returnFocusRef.current = ativo;
                            const content = contentRef.current;
                            if (!content) return;
                            let alvo: HTMLElement | null | undefined = null;
                            if (typeof initialFocus === "function") alvo = initialFocus(content);
                            else if (initialFocus === "content") alvo = content;
                            else alvo = content.querySelector<HTMLElement>(`[data-modal-body] :is(${FOCAVEIS})`);
                            if (alvo) {
                                e.preventDefault();
                                alvo.focus({preventScroll: alvo === content});
                            }
                        }}
                        onInteractOutside={(e) => {
                            onInteractOutside?.(e);
                            if (!closeOnOutsideClick) e.preventDefault();
                        }}
                        onCloseAutoFocus={(e) => {
                            onCloseAutoFocus?.(e);
                            if (e.defaultPrevented) return;
                            const el = returnFocusTo?.() ?? returnFocusRef.current;
                            if (el?.isConnected) {
                                e.preventDefault();
                                el.focus();
                            }
                        }}
                    >
                        <ModalContext.Provider value={ctx}>
                            {/* Popovers (combobox, calendário) montados dentro do modal:
                                fora dele o Radix bloqueia a rolagem com a roda do mouse. */}
                            <PopoverPortalContainer value={popoverHost}>
                                {children}
                            </PopoverPortalContainer>
                        </ModalContext.Provider>
                        <div ref={setPopoverHost}/>
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
        );
    },
);
Modal.displayName = "Modal";

/** Cabeçalho fixo: título (aria-labelledby), descrição opcional, ações extras e botão Fechar. */
export function ModalHeader({
                                title,
                                description,
                                icon,
                                children,
                                className,
                                hideClose = false,
                            }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** Ícone à esquerda do título. */
    icon?: React.ReactNode;
    /** Conteúdo extra à direita (antes do botão Fechar). */
    children?: React.ReactNode;
    className?: string;
    hideClose?: boolean;
}) {
    const ctx = React.useContext(ModalContext);
    const temDescricao = description != null && description !== false && description !== "";
    React.useLayoutEffect(() => {
        ctx?.setTemDescricao(temDescricao);
    }, [ctx, temDescricao]);
    return (
        <div className={cn(
            "shrink-0 flex items-center justify-between gap-[1em] px-[1.6em] py-[1.1em] border-b border-white/[0.06]",
            className,
        )}>
            <div className="min-w-0 flex items-center gap-[0.8em]">
                {icon && <div aria-hidden="true" className="shrink-0">{icon}</div>}
                <div className="min-w-0">
                    <DialogPrimitive.Title
                        className="text-[1.25em] font-black text-white uppercase tracking-tight leading-tight break-words">
                        {title}
                    </DialogPrimitive.Title>
                    {temDescricao && (
                        <DialogPrimitive.Description className="text-[0.85em] text-muted-foreground mt-[0.2em]">
                            {description}
                        </DialogPrimitive.Description>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-[1em] shrink-0">
                {children}
                {!hideClose && (
                    <button type="button" onClick={() => ctx?.onClose()} aria-label="Fechar"
                            className={cn(
                                "group inline-flex items-center justify-center w-[44px] h-[44px] md:w-[2.4em] md:h-[2.4em] rounded-[0.7em] border border-white/[0.08] text-muted-foreground hover:bg-white/5 hover:text-white transition-colors",
                                modalFocusRingCls,
                            )}>
                        <X aria-hidden="true"
                           className="w-[1.15em] h-[1.15em] transition-transform group-hover:rotate-90 motion-reduce:transition-none motion-reduce:group-hover:rotate-0"/>
                    </button>
                )}
            </div>
        </div>
    );
}

/** `<form>` que ocupa o espaço entre o cabeçalho e a borda: envolve <ModalBody> e <ModalFooter>. */
export const ModalForm = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
    ({className, ...props}, ref) => (
        <form ref={ref} className={cn("flex-1 min-h-0 flex flex-col", className)} {...props}/>
    ),
);
ModalForm.displayName = "ModalForm";

/** Corpo: o único trecho que rola. */
export const ModalBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({className, ...props}, ref) => (
        <div ref={ref} data-modal-body=""
             className={cn("flex-1 min-h-0 overflow-y-auto overscroll-contain px-[1.6em] py-[1.4em]", className)}
             {...props}/>
    ),
);
ModalBody.displayName = "ModalBody";

/**
 * Rodapé fixo. `hint` aparece à esquerda do tablet em diante; no celular os
 * botões dividem a largura.
 */
export function ModalFooter({hint, className, children}: {
    hint?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn(
            "shrink-0 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-[0.8em] px-[1.6em] py-[1em] border-t border-white/[0.06]",
            className,
        )}>
            <div className="hidden md:block text-[0.8em] text-muted-foreground min-w-0">{hint}</div>
            <div className="grid grid-cols-2 gap-[0.6em] md:flex md:justify-end [&>*:only-child]:col-span-2">
                {children}
            </div>
        </div>
    );
}

/** Conteúdo do botão principal enquanto salva. */
export function ModalSpinner({label = "Salvando..."}: { label?: string }) {
    return (
        <>
            <Loader2 aria-hidden="true" className="w-[1.2em] h-[1.2em] animate-spin motion-reduce:animate-none"/>
            <span className="sr-only">{label}</span>
        </>
    );
}

/** Foca o primeiro elemento focável de `root` (ex.: ao trocar de etapa). */
export function focarPrimeiro(root: HTMLElement | null | undefined) {
    root?.querySelector<HTMLElement>(FOCAVEIS)?.focus();
}
