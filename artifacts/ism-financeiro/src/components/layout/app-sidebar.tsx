import {useState, useEffect} from "react";
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
    Tags,
    Landmark,
    Briefcase,
    LineChart,
    Wallet,
    UserCheck,
    Plus,
    Sparkles,
    Scale,
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
import {cn} from "@/lib/utils";
import {useAuth} from "@/hooks/use-auth";
import {PERM} from "@/lib/permissoes";

const navItems = [
    {title: "Home", url: "/", icon: Home},
    {title: "Tarefas", url: "/kanban", icon: Columns},
    {title: "Conciliação", url: "/conciliacao", icon: RefreshCw, permission: PERM.CONCILIACAO_ACESSAR},
    {title: "Lançamentos", url: "/lancamentos", icon: FileText},
];

const cadastrosItems = [
    {title: "Clientes/Fornecedores", url: "/cadastros/parceiros", icon: UserCheck},
    {title: "Contas Bancárias", url: "/cadastros/contas-bancarias", icon: Landmark},
    {title: "Plano de Contas", url: "/cadastros/plano-contas", icon: Briefcase},
    {title: "Metas Financeiras", url: "/cadastros/metas", icon: Target},
    {title: "Departamentos", url: "/cadastros/departamentos", icon: Building2},

];

const relatoriosItems = [
    {title: "Fechamento Mensal", url: "/relatorios/fechamento-mensal", icon: Wallet},
    {title: "Contábil/Fiscal", url: "/relatorios/contabil-fiscal", icon: FileText},
    {title: "DRE Gerencial", url: "/relatorios/dre", icon: BarChart3},
    {title: "Fluxo de Caixa", url: "/relatorios/fluxo-caixa", icon: LineChart},
    {title: "Relatório de Metas", url: "/relatorios/metas", icon: Target},
    {
        title: "Conciliação Bancária",
        url: "/relatorios/conciliacao",
        icon: Scale,
        permission: PERM.RELATORIOS_CONCILIACAO,
    },
];

const configItems = [
    {title: "Usuários", url: "/configuracoes/usuarios", icon: Users},
    {title: "Filiais", url: "/configuracoes/filiais", icon: Building2},
    {title: "Tokens de API", url: "/configuracoes/tokens-api", icon: Key},
];

type NavItem = {
    title: string;
    url: string;
    icon: React.ElementType;
    permission?: string;
};

type MenuSection = {
    title: string;
    icon: React.ElementType;
    items: NavItem[];
};

export function AppSidebar() {
    const [location] = useLocation();
    const {state} = useSidebar();
    const {hasPermission} = useAuth();
    const isCollapsed = state === "collapsed";
    const [expandedSections, setExpandedSections] = useState<string[]>(["Cadastros", "Relatórios", "Configurações"]);

    const visibleNav = navItems.filter(
        (item) => !("permission" in item && item.permission) || hasPermission((item as NavItem).permission!),
    );
    const visibleRelatorios = relatoriosItems.filter(
        (item) => !item.permission || hasPermission(item.permission),
    );

    useEffect(() => {
        if (!isCollapsed) {
            setExpandedSections(["Cadastros", "Relatórios", "Configurações"]);
        }
    }, [isCollapsed]);

    const toggleSection = (title: string) => {
        setExpandedSections(prev =>
            prev.includes(title)
                ? prev.filter(t => t !== title)
                : [...prev, title]
        );
    };

    const handleSectionClick = (title: string, hasSubItems: boolean) => {
        if (isCollapsed && hasSubItems) {
            toggleSection(title);
        }
    };

    const isActive = (url: string) => {
        if (url === "/" && location === "/") return true;
        if (url !== "/" && location.startsWith(url)) return true;
        return false;
    };

    const renderCollapsibleSection = (section: MenuSection, defaultOpen: boolean = true) => {
        const isExpanded = expandedSections.includes(section.title);

        return (
            <Collapsible defaultOpen={defaultOpen && !isCollapsed} open={isCollapsed ? isExpanded : undefined}
                         className="group/collapsible">
                <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                            tooltip={section.title}
                            className={cn(
                                "transition-all hover:bg-white/5",
                                isCollapsed && "justify-center px-0"
                            )}
                            onClick={() => handleSectionClick(section.title, true)}
                        >
                            <section.icon className="w-5 h-5 shrink-0"/>
                            <span
                                className={cn("font-medium", isCollapsed ? "hidden" : undefined)}>{section.title}</span>
                            {!isCollapsed && (
                                <ChevronDown
                                    className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-180"/>
                            )}
                            {isCollapsed && isExpanded && (
                                <ChevronDown
                                    className="ml-auto w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 rotate-180"/>
                            )}
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent
                        className={cn(isCollapsed && "absolute left-full ml-1 top-0 bg-sidebar border border-white/10 rounded-lg shadow-xl p-2 min-w-[180px] z-50")}>
                        <SidebarMenuSub className="border-white/10 pr-0 mr-0">
                            {section.items.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.title}>
                                    <SidebarMenuSubButton
                                        asChild
                                        isActive={isActive(subItem.url)}
                                        className="transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                                    >
                                        <Link href={subItem.url} className="flex items-center gap-2">
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
                <div className="flex items-center justify-center w-full px-2">
                    <img
                        src="/logo-ism.png"
                        alt="ISM Tecnologia"
                        className={cn(
                            "object-contain shrink-0 transition-all",
                            isCollapsed ? "h-10 w-10" : "h-12"
                        )}
                    />
                </div>
            </SidebarHeader>
            <SidebarContent className="p-2 gap-1">
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu className="space-y-1">
                            {visibleNav.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={isActive(item.url)}
                                        tooltip={item.title}
                                        className={cn(
                                            "transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary text-sm font-medium",
                                            isCollapsed && "justify-center px-0"
                                        )}
                                    >
                                        <Link href={item.url}
                                              className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
                                            <item.icon className="w-5 h-5 shrink-0"/>
                                            <span className={isCollapsed ? "hidden" : undefined}>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}

                            {renderCollapsibleSection({
                                title: "Cadastros",
                                icon: FolderOpen,
                                items: cadastrosItems
                            }, true)}
                            {renderCollapsibleSection({
                                title: "Relatórios",
                                icon: BarChart3,
                                items: visibleRelatorios
                            }, true)}
                            {renderCollapsibleSection({
                                title: "Configurações",
                                icon: Settings,
                                items: configItems
                            }, false)}

                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}