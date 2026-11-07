import {Link, useLocation} from "wouter";
import {
    Home,
    Columns,
    RefreshCw,
    FileText,
    FolderOpen,
    BarChart3,
    Settings,
    ChevronDown,
    Building2,
    Users,
    Key,
    Target,
    Landmark,
    Briefcase,
    LineChart,
    Wallet,
    UserCheck,
} from "lucide-react";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
    useSidebar,
} from "@/components/ui/sidebar";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {cn} from "@/lib/utils";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";
import {telaLiberada} from "@/lib/telas-permissoes";

// A permissão de cada item vem de @/lib/telas-permissoes, a mesma que a rota (App.tsx) confere.
const navItems: NavItem[] = [
    {title: "Home", url: "/", icon: Home},
    {title: "Tarefas", url: "/kanban", icon: Columns},
    {title: "Conciliação", url: "/conciliacao", icon: RefreshCw},
    {title: "Lançamentos", url: "/lancamentos", icon: FileText},
];

const cadastrosItems: NavItem[] = [
    {title: "Clientes/Fornecedores", url: "/cadastros/parceiros", icon: UserCheck},
    {title: "Contas Bancárias", url: "/cadastros/contas-bancarias", icon: Landmark},
    {title: "Plano de Contas", url: "/cadastros/plano-contas", icon: Briefcase},
    {title: "Metas Financeiras", url: "/cadastros/metas", icon: Target},
    {title: "Departamentos", url: "/cadastros/departamentos", icon: Building2},
];

const relatoriosItems: NavItem[] = [
    {title: "Fechamento Mensal", url: "/relatorios/fechamento-mensal", icon: Wallet},
    {title: "Contábil/Fiscal", url: "/relatorios/contabil-fiscal", icon: FileText},
    {title: "DRE Gerencial", url: "/relatorios/dre", icon: BarChart3},
    {title: "Fluxo de Caixa", url: "/relatorios/fluxo-caixa", icon: LineChart},
    {title: "Relatório de Metas", url: "/relatorios/metas", icon: Target},
];

const configItems: NavItem[] = [
    {title: "Usuários", url: "/configuracoes/usuarios", icon: Users},
    {title: "Filiais", url: "/configuracoes/filiais", icon: Building2},
    {title: "Tokens de API", url: "/configuracoes/tokens-api", icon: Key},
];

type NavItem = {
    title: string;
    url: string;
    icon: React.ElementType;
};

type MenuSection = {
    title: string;
    icon: React.ElementType;
    items: NavItem[];
};

export function AppSidebar() {
    const [location] = useLocation();
    const {state, isMobile, setOpenMobile} = useSidebar();
    const {hasPermission, user} = useAuth();
    const canListarEmpresas = user?.superadmin === true;
    const canEditarPropriaEmpresa = !canListarEmpresas && hasPermission(PERM.ADMIN_EMPRESAS_EDITAR);
    // No celular o menu abre inteiro (sheet), independente do estado retraído do desktop.
    const isCollapsed = state === "collapsed" && !isMobile;

    const liberado = (item: NavItem) => telaLiberada(item.url, hasPermission);
    const visibleNav = navItems.filter(liberado);
    const visibleRelatorios = relatoriosItems.filter(liberado);
    const visibleCadastros = cadastrosItems.filter(liberado);
    const visibleConfig = [
        ...(canListarEmpresas ? [{title: "Empresas", url: "/admin/empresas", icon: Building2}] : []),
        ...(canEditarPropriaEmpresa ? [{title: "Minha empresa", url: "/admin/empresas", icon: Building2}] : []),
        ...configItems.filter(liberado),
    ];

    const isActive = (url: string) => {
        if (url === "/" && location === "/") return true;
        if (url !== "/" && location.startsWith(url)) return true;
        return false;
    };

    const fecharNoCelular = () => {
        if (isMobile) setOpenMobile(false);
    };

    const renderCollapsibleSection = (section: MenuSection) => {
        if (section.items.length === 0) return null;
        const secaoAtiva = section.items.some((item) => isActive(item.url));

        // Retraído: os itens abrem num menu flutuante ao lado do ícone.
        if (isCollapsed) {
            return (
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                                tooltip={section.title}
                                isActive={secaoAtiva}
                                className="transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                            >
                                <section.icon className="w-5 h-5 shrink-0"/>
                                <span>{section.title}</span>
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" sideOffset={8}
                                             className="min-w-[200px] bg-sidebar border-white/10">
                            <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground">
                                {section.title}
                            </DropdownMenuLabel>
                            {section.items.map((subItem) => (
                                <DropdownMenuItem key={subItem.title} asChild
                                                  className={cn("cursor-pointer gap-2", isActive(subItem.url) && "bg-primary/10 text-primary")}>
                                    <Link href={subItem.url}>
                                        <subItem.icon className="w-4 h-4 opacity-70"/>
                                        <span>{subItem.title}</span>
                                    </Link>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            );
        }

        return (
            <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={section.title} className="transition-all hover:bg-white/5">
                            <section.icon className="w-5 h-5 shrink-0"/>
                            <span className="font-medium">{section.title}</span>
                            <ChevronDown
                                className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-180"/>
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <SidebarMenuSub className="border-white/10 pr-0 mr-0">
                            {section.items.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.title}>
                                    <SidebarMenuSubButton
                                        asChild
                                        isActive={isActive(subItem.url)}
                                        className="transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                                    >
                                        <Link href={subItem.url} onClick={fecharNoCelular} className="flex items-center gap-2">
                                            <subItem.icon className="w-4 h-4 opacity-70"/>
                                            <span>{subItem.title}</span>
                                        </Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            ))}
                        </SidebarMenuSub>
                    </CollapsibleContent>
                </SidebarMenuItem>
            </Collapsible>
        );
    };

    return (
        <Sidebar collapsible="icon" variant="inset" className="border-r border-white/10 bg-sidebar">
            <SidebarHeader className="h-20 flex items-center justify-center border-b border-white/5">
                <div className={cn("flex items-center w-full gap-3", isCollapsed ? "justify-center" : "px-2")}>
                    <img
                        src="/logo.png"
                        alt=""
                        aria-hidden="true"
                        className={cn("object-contain shrink-0 transition-all", isCollapsed ? "h-9 w-9" : "h-10 w-10")}
                    />
                    {!isCollapsed && (
                        <div className="min-w-0 leading-tight">
                            <span className="block text-base font-bold tracking-tight text-foreground">Financeiro</span>
                            <span className="block text-[11px] text-muted-foreground">Gestão financeira</span>
                        </div>
                    )}
                </div>
            </SidebarHeader>
            <SidebarContent className="p-2 gap-1">
                <SidebarGroup className={cn(isCollapsed && "px-0")}>
                    <SidebarGroupContent>
                        <SidebarMenu className={cn("space-y-1", isCollapsed && "items-center")}>
                            {visibleNav.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={isActive(item.url)}
                                        tooltip={item.title}
                                        className="transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary text-sm font-medium"
                                    >
                                        <Link href={item.url} onClick={fecharNoCelular} className="flex items-center gap-3">
                                            <item.icon className="w-5 h-5 shrink-0"/>
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}

                            {renderCollapsibleSection({title: "Cadastros", icon: FolderOpen, items: visibleCadastros})}
                            {renderCollapsibleSection({title: "Relatórios", icon: BarChart3, items: visibleRelatorios})}
                            {renderCollapsibleSection({title: "Configurações", icon: Settings, items: visibleConfig})}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}
