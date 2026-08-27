import { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Bell, User, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

function getInitials(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "4.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full bg-background text-foreground selection:bg-primary/30">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-card/50 backdrop-blur-xl sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all" />
            </div>
            
            <div className="flex items-center gap-2 md:gap-4">
              <button
                type="button"
                title="Notificações (em breve)"
                className="relative p-2 rounded-full hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border-2 border-card" />
              </button>

              <div className="flex items-center gap-3 pl-2 md:pl-4 border-l border-white/10">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold leading-none text-foreground">
                    {user?.nome ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{user?.cargo || "Administrador"}</p>
                </div>
                <div
                  className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white text-xs font-bold shadow-lg border border-white/10"
                >
                  {user?.nome ? getInitials(user.nome) : <User className="w-5 h-5" />}
                </div>
                <button
                  type="button"
                  title="Sair do sistema"
                  onClick={logout}
                  className="ml-1 w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors border border-white/10"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>
          {/* Sem max-w-7xl: todas as páginas agora ocupam 100% da largura
              disponível, igual ao comportamento da tela de conciliação. */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 animate-in">
            <div className="w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}