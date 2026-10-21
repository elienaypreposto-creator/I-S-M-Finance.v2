import {ReactNode} from "react";
import {AppSidebar} from "./app-sidebar";
import {SidebarProvider, SidebarTrigger} from "@/components/ui/sidebar";
import {Bell} from "lucide-react";
import {EmpresaSwitcher} from "./empresa-switcher";
import {useEmpresaTitle} from "@/hooks/use-empresa-title";
import {UserMenu} from "@/components/conta/user-menu";
import {SaldosVisiveisProvider} from "@/components/conta/saldos-visiveis";

export function AppLayout({children}: { children: ReactNode }) {
    useEmpresaTitle();

    const style = {
        "--sidebar-width": "17rem",
        "--sidebar-width-icon": "4.5rem",
    };

    return (
        <SidebarProvider style={style as React.CSSProperties}>
            <SaldosVisiveisProvider>
            <div className="flex min-h-screen w-full bg-background text-foreground selection:bg-primary/30">
                <AppSidebar/>
                <div className="flex flex-col flex-1 min-w-0">
                    <header
                        className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-card/50 backdrop-blur-xl sticky top-0 z-20">
                        <div className="flex items-center gap-3 min-w-0">
                            <SidebarTrigger
                                className="text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all shrink-0"/>
                            <EmpresaSwitcher/>
                        </div>

                        <div className="flex items-center gap-2 md:gap-4">
                            <button
                                type="button"
                                title="Notificações (em breve)"
                                aria-label="Notificações, em breve"
                                className="relative p-2 rounded-full hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <Bell className="w-5 h-5"/>
                                <span
                                    className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border-2 border-card"/>
                            </button>

                            <div className="flex items-center pl-2 md:pl-4 border-l border-white/10">
                                <UserMenu/>
                            </div>
                        </div>
                    </header>
                    <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 animate-in">
                        <div className="w-full">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
            </SaldosVisiveisProvider>
        </SidebarProvider>
    );
}
