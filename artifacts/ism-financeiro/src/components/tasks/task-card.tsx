import { format, isPast, differenceInDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Clock, MessageSquare, Paperclip, Calendar, CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = { cards: "#262626" };

type ChecklistItem = { id: string; texto: string; completed: boolean };

export interface TaskCardProps {
  id: number;
  titulo: string;
  descricao: string | null;
  coluna: string;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  responsaveis_multiplos: number[] | null;
  tags: string[] | null;
  departamentos: string[] | null;
  checklist: ChecklistItem[] | null;
  comentarios_count: number;
  anexos_count: number;
  prazo: string | null;
  prioridade: string;
  responsaveis?: { id: number; nome: string; avatar?: string }[];
  onClick?: () => void;
  isDragging?: boolean;
  /** Slot para o menu de ações (três pontinhos) — injetado pelo SortableCard */
  menuSlot?: React.ReactNode;
}

const PRIORIDADE_CONFIG = {
  urgente: { label: "URGENTE", bg: "bg-red-600",   text: "text-white",     border: "border-red-500"   },
  alta:    { label: "ALTA",    bg: "bg-[#D4A574]", text: "text-[#4A3728]", border: "border-[#C49A6C]" },
  media:   { label: "MÉDIA",   bg: "bg-blue-600",  text: "text-white",     border: "border-blue-500"  },
  baixa:   { label: "BAIXA",   bg: "bg-green-800", text: "text-green-300", border: "border-green-700" },
};

const DEPARTAMENTOS = [
  { value: "financeiro",     label: "Financeiro"     },
  { value: "operacional",    label: "Operacional"    },
  { value: "contabil",       label: "Contábil"       },
  { value: "diretoria",      label: "Diretoria"      },
  { value: "rh_dp",          label: "RH/DP"          },
  { value: "administrativo", label: "Administrativo" },
];

function getPrioridadeConfig(prioridade: string) {
  const key = prioridade.toLowerCase() as keyof typeof PRIORIDADE_CONFIG;
  return PRIORIDADE_CONFIG[key] ?? PRIORIDADE_CONFIG.media;
}

function getDepartamentoBadge(depto: string) {
  return DEPARTAMENTOS.find(d => d.value === depto.toLowerCase()) ?? { label: depto };
}

function DateIndicator({ prazo }: { prazo: string | null }) {
  if (!prazo) return null;
  const data     = new Date(prazo);
  const hoje     = new Date();
  const atrasado = isPast(data) && !isToday(data);
  const diasDiff = differenceInDays(data, hoje);

  const colorClass =
    atrasado                           ? "text-red-500"    :
    isToday(data) || diasDiff <= 2     ? "text-orange-400" :
                                         "text-gray-400";

  return (
    <span className={cn("flex items-center gap-1 text-xs", colorClass)}>
      {atrasado ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
      <span>{format(data, "dd/MM", { locale: ptBR })}</span>
    </span>
  );
}

function AvatarStack({ responsaveis }: { responsaveis?: { id: number; nome: string; avatar?: string }[] }) {
  if (!responsaveis?.length) return null;
  const visible   = responsaveis.slice(0, 3);
  const remaining = responsaveis.length - 3;
  return (
    <div className="flex -space-x-2">
      {visible.map((r, i) => (
        <div
          key={r.id}
          title={r.nome}
          style={{ zIndex: visible.length - i }}
          className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold border-2 border-[#262626]"
        >
          {r.nome.charAt(0).toUpperCase()}
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[10px] text-white font-bold border-2 border-[#262626]">
          +{remaining}
        </div>
      )}
    </div>
  );
}

export function TaskCard({
  titulo,
  departamentos,
  checklist,
  comentarios_count,
  anexos_count,
  prazo,
  prioridade,
  responsaveis,
  onClick,
  isDragging,
  menuSlot,   // ← recebe o menu injetado pelo SortableCard
}: TaskCardProps) {
  const config           = getPrioridadeConfig(prioridade);
  const checklistTotal   = checklist?.length ?? 0;
  const checklistDone    = checklist?.filter(i => i.completed).length ?? 0;
  const checklistPct     = checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0;

  return (
    <div
      onClick={onClick}
      style={{ backgroundColor: COLORS.cards }}
      className={cn(
        "group relative p-4 rounded-xl border transition-all cursor-pointer",
        "hover:border-white/20 hover:shadow-lg hover:shadow-black/20",
        isDragging ? "shadow-2xl scale-105 rotate-2" : "border-white/10",
      )}
    >
      {/* Linha topo: badge de prioridade + menu (injetado pelo pai) */}
      <div className="flex justify-between items-start mb-2">
        <span className={cn(
          "text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider",
          config.bg, config.text, config.border,
        )}>
          {config.label}
        </span>

        {/* menuSlot vem do SortableCard — nenhum botão duplicado aqui */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          {menuSlot}
        </div>
      </div>

      {/* Título */}
      <h4 className="text-sm font-bold text-white mb-2 line-clamp-2 leading-snug">
        {titulo}
      </h4>

      {/* Departamentos */}
      {departamentos && departamentos.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {departamentos.slice(0, 3).map((d, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
              {getDepartamentoBadge(d).label}
            </span>
          ))}
          {departamentos.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              +{departamentos.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Checklist progress */}
      {checklistTotal > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
            <span className="flex items-center gap-1">
              <CheckSquare className="w-3 h-3" /> Checklist
            </span>
            <span>{checklistDone}/{checklistTotal}</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300 rounded-full"
              style={{ width: `${checklistPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Rodapé: data, comentários, anexos, avatares */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-3 text-gray-400">
          <DateIndicator prazo={prazo} />
          {comentarios_count > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <MessageSquare className="w-3.5 h-3.5" />{comentarios_count}
            </span>
          )}
          {anexos_count > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <Paperclip className="w-3.5 h-3.5" />{anexos_count}
            </span>
          )}
        </div>
        <AvatarStack responsaveis={responsaveis} />
      </div>
    </div>
  );
}

export default TaskCard;