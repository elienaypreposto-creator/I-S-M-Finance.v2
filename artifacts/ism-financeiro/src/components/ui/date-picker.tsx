import * as React from "react"
import { format, isValid, parseISO } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** "yyyy-MM-dd" -> Date local (sem fuso), ou undefined se vazio/inválido. */
export function dataIsoParaDate(valor: string | null | undefined): Date | undefined {
  if (!valor) return undefined
  const data = parseISO(valor.slice(0, 10))
  return isValid(data) ? data : undefined
}

/**
 * Próximo valor do campo ao escolher no calendário. Sem data (clique no dia já
 * selecionado, em modo não obrigatório) mantém o valor atual: o seletor nunca
 * apaga a data por um clique.
 */
export function proximoValorData(atual: string, escolhida: Date | undefined): string {
  if (!escolhida || !isValid(escolhida)) return atual
  return format(escolhida, "yyyy-MM-dd")
}

type DatePickerProps = {
  /** Data no formato "yyyy-MM-dd" ("" = vazio). */
  value: string
  onChange: (valor: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  /** Classes do botão que abre o calendário (ex.: o estilo de input do formulário). */
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

/**
 * Campo de data com calendário em popover.
 * - Fecha ao escolher o dia e devolve o foco ao botão.
 * - Popover modal: um clique fora só fecha o calendário, não "atravessa" para
 *   o que está embaixo nem altera a data.
 * - Sem dias de outros meses na grade (um clique no dia cinza trocava o mês e
 *   gravava data errada) e abre no mês da data já escolhida.
 */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Selecione...",
  disabled,
  className,
  ...aria
}: DatePickerProps) {
  const [aberto, setAberto] = React.useState(false)
  const selecionada = dataIsoParaDate(value)

  return (
    <Popover open={aberto} onOpenChange={setAberto} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-invalid={aria["aria-invalid"]}
          aria-describedby={aria["aria-describedby"]}
          className={cn(
            "flex items-center justify-between text-left",
            !selecionada && "text-muted-foreground/70",
            className
          )}
        >
          {selecionada ? format(selecionada, "dd/MM/yyyy") : placeholder}
          <CalendarIcon aria-hidden="true" className="w-[1.05em] h-[1.05em] text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border border-white/10" align="start">
        <Calendar
          mode="single"
          required
          selected={selecionada}
          defaultMonth={selecionada}
          showOutsideDays={false}
          autoFocus
          onSelect={(data) => {
            onChange(proximoValorData(value, data))
            setAberto(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
