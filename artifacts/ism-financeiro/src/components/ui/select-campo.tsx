import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {cn} from "@/lib/utils";

const VAZIO = "__selecione__";

export type OpcaoSelectCampo = {
    value: string;
    label: string;
};

type SelectCampoProps = {
    id?: string;
    name?: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    opcoes: OpcaoSelectCampo[];
    placeholder?: string;
    permitirVazio?: boolean;
    disabled?: boolean;
    className?: string;
    campoFiltro?: boolean;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-required"?: boolean;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
};

const itemCls = "text-white focus:bg-primary/20 focus:text-white";

const triggerCls = cn(
    "w-full h-[3.4em] md:h-[2.9em] bg-[#1a1c23] border border-white/10 rounded-[0.7em] px-[0.95em] text-[0.93em] text-white",
    "transition-colors hover:border-white/20",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "py-0 shadow-none focus:ring-0 focus:ring-offset-0",
    "[&>svg]:w-[1em] [&>svg]:h-[1em] [&>svg]:opacity-70",
    "data-[placeholder]:text-muted-foreground/50",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#121417]",
);

export function SelectCampo({
                                id,
                                name,
                                value,
                                onChange,
                                onBlur,
                                opcoes,
                                placeholder = "Selecione...",
                                permitirVazio = false,
                                disabled,
                                className,
                                campoFiltro,
                                "aria-label": ariaLabel,
                                "aria-labelledby": ariaLabelledBy,
                                "aria-required": ariaRequired,
                                "aria-invalid": ariaInvalid,
                                "aria-describedby": ariaDescribedBy,
                            }: SelectCampoProps) {
    const semValor = value === "";
    const valor = permitirVazio && semValor ? VAZIO : semValor ? undefined : value;

    return (
        <Select
            name={name}
            value={valor}
            disabled={disabled}
            onValueChange={(next) => onChange(next === VAZIO ? "" : next)}
        >
            <SelectTrigger
                id={id}
                onBlur={onBlur}
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                aria-required={ariaRequired}
                aria-invalid={ariaInvalid}
                aria-describedby={ariaDescribedBy}
                data-campo-filtro={campoFiltro ? "" : undefined}
                className={cn(triggerCls, className)}
            >
                <SelectValue placeholder={placeholder}/>
            </SelectTrigger>
            <SelectContent className="z-[110] bg-[#1a1c23] border-white/10 text-white">
                {permitirVazio ? (
                    <SelectItem value={VAZIO} className={itemCls}>
                        {placeholder}
                    </SelectItem>
                ) : null}
                {opcoes.filter((o) => o.value !== "").map((o) => (
                    <SelectItem key={o.value} value={o.value} className={itemCls}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
