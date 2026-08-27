import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── TableSkeleton ─────────────────────────────────────────────────────────────

interface TableSkeletonProps {
 
  rows?: number;
  
  showHeader?: boolean;
 
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  showHeader = true,
  columns = 4,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("glass-panel rounded-2xl overflow-hidden", className)}>
      {/* Cabeçalho */}
      {showHeader && (
        <div className="flex items-center gap-4 px-5 py-3.5 bg-white/5 border-b border-white/5">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-3 rounded-md ${
                i === 0 ? "w-32" : i === columns - 1 ? "w-16 ml-auto" : "w-24"
              }`}
            />
          ))}
        </div>
      )}

      {/* Linhas */}
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex items-center gap-4 px-5 py-4">
            {/* Avatar / ícone */}
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />

            {/* Conteúdo principal — 2 linhas */}
            <div className="flex-1 space-y-2 min-w-0">
              <Skeleton className="h-3 w-2/5 rounded-md" />
              <Skeleton className="h-2.5 w-1/3 rounded-md" />
            </div>

            {/* Badge / status */}
            <Skeleton className="h-5 w-14 rounded-full hidden sm:block" />

            {/* Coluna extra */}
            <Skeleton className="h-3 w-20 hidden md:block" />

            {/* Ações */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Skeleton className="w-7 h-7 rounded-lg" />
              <Skeleton className="w-7 h-7 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CardsSkeleton ─────────────────────────────────────────────────────────────

interface CardsSkeletonProps {

  cards?: number;
  className?: string;
}


export function CardsSkeleton({ cards = 4, className }: CardsSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/5"
        >
          <div className="flex items-center gap-4">
            {/* Ícone */}
            <Skeleton className="w-11 h-11 rounded-xl shrink-0" />

            {/* Texto */}
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-32 rounded-md" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
              <Skeleton className="h-2.5 w-40 rounded-md" />
            </div>

            {/* Ações */}
            <div className="flex items-center gap-1 shrink-0">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="w-8 h-8 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}