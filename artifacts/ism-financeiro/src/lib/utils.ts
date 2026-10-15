import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatarData } from "./datas";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** dd/mm/aaaa sem deslocar datas civis ("YYYY-MM-DD") pelo fuso. Ver lib/datas.ts. */
export function formatDate(dateString: string | null | undefined): string {
  return formatarData(dateString, "-");
}
