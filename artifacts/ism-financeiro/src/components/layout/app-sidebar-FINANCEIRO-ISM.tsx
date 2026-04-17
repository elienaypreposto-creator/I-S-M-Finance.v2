import { Link, useLocation } from "wouter";
import logoIsm from "@/assets/logo-ism.png";
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
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const navItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Kanban", url: "/kanban", icon: Columns },
  { title: "Conciliação", url: "/conciliacao", icon: RefreshCw },
  { title: "Lançamentos", url: "/lancamentos", icon: FileText },
];

const cadastrosItems = [
  { title: "Clientes/Fornecedores", url: "/cadastros/parceiros", icon: UserCheck },
  { title: "Contas Bancárias", url: "/cadastros/contas-bancarias", icon: Landmark },
  { title: "Plano de Contas", url: "/cadastros/plano-contas", icon: Briefcase },
  { title: "Metas", url: "/cadastros/metas", icon: Target },
  { title: "Categorias", url: "/cadastros/categorias", icon: Tags },
  { title: "Departamentos", url: "/cadastros/departamentos", icon: Building2 },
];

const relatoriosItems = [
  { title: "Fechamento Mensal", url: "/relatorios/fechamento-mensal", icon: Wallet },
  { title: "Contábil/Fiscal", url: "/relatorios/contabil-fiscal", icon: FileText },
  { title: "DRE Gerencial", url: "/relatorios/dre", icon: BarChart3 },
  { title: "Fluxo de Caixa", url: "/relatorios/fluxo-caixa", icon: LineChart },
  { title: "Metas", url: "/relatorios/metas", icon: Target },
];

const configItems = [
  { title: "Usuários", url: "/configuracoes/usuarios", icon: Users },
  { title: "Filiais", url: "/configuracoes/filiais", icon: Building2 },
  { title: "Tokens de API", url: "/configuracoes/tokens-api", icon: Key },
];

export function AppSidebar() {
  const [location] = useLocation();

  const isActive = (url: string) => {
    if (url === "/" && location === "/") return true;
    if (url !== "/" && location.startsWith(url)) return true;
    return false;
  };

  return (
    <Sidebar variant="inset" className="border-r border-white/10 bg-sidebar">
      <SidebarHeader className="h-20 flex items-center justify-center border-b border-white/5 px-4 overflow-hidden">
        <Link href="/" className="flex items-center justify-center w-full">
          <img src={logoIsm} alt="ISM Tecnologia" className="h-[4.5rem] w-auto object-contain transition-transform hover:scale-105 duration-300" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2 gap-1">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className="transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                  >
                    <Link href={item.url} className="flex items-center gap-3">
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Cadastros" className="transition-all hover:bg-white/5">
                      <FolderOpen className="w-5 h-5" />
                      <span className="font-medium">Cadastros</span>
                      <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="border-white/10 ml-5 pr-0 mr-0">
                      {cadastrosItems.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive(subItem.url)}
                            className="transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                          >
                            <Link href={subItem.url} className="flex items-center gap-2">
                              <subItem.icon className="w-4 h-4 opacity-70" />
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Relatórios" className="transition-all hover:bg-white/5">
                      <BarChart3 className="w-5 h-5" />
                      <span className="font-medium">Relatórios</span>
                      <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="border-white/10 ml-5 pr-0 mr-0">
                      {relatoriosItems.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive(subItem.url)}
                            className="transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                          >
                            <Link href={subItem.url} className="flex items-center gap-2">
                              <subItem.icon className="w-4 h-4 opacity-70" />
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="Configurações" className="transition-all hover:bg-white/5">
                      <Settings className="w-5 h-5" />
                      <span className="font-medium">Configurações</span>
                      <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="border-white/10 ml-5 pr-0 mr-0">
                      {configItems.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive(subItem.url)}
                            className="transition-all hover:bg-white/5 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                          >
                            <Link href={subItem.url} className="flex items-center gap-2">
                              <subItem.icon className="w-4 h-4 opacity-70" />
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
