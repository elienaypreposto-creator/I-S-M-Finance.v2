import type {ReactNode} from "react";
import {createPortal} from "react-dom";
import {cn} from "@/lib/utils";

export function ViewportOverlay({
                                    children,
                                    className,
                                }: {
    children: ReactNode;
    className?: string;
}) {
    return createPortal(
        <div
            className={cn(
                "fixed inset-0 z-50 flex items-center justify-center p-4",
                "bg-black/60 backdrop-blur-sm",
                className,
            )}
        >
            {children}
        </div>,
        document.body,
    );
}
