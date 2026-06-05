import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <p className="text-white font-medium">Ops, algo deu errado.</p>
            <p className="text-gray-400 text-sm mt-1">
              {this.state.error?.message || "Erro inesperado na aplicação."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="border-white/10 text-gray-300 hover:text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Recarregar
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Fallback inline para uso em seções (ex: Kanban) sem tomar a tela toda
export function SectionErrorFallback({
  message = "Não foi possível carregar este conteúdo.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 border border-dashed border-white/10 rounded-xl text-center p-6">
      <AlertTriangle className="w-6 h-6 text-red-400" />
      <p className="text-gray-400 text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
