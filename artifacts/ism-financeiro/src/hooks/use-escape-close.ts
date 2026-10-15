// Texto padrão da confirmação de descarte ao fechar um modal com alterações
// não salvas. O Esc dos modais fica com o Dialog do Radix
// (components/ui/modal-responsivo), que também cuida da pilha de modais.
export const DISCARD_PROMPT = {
    title: "Sair sem salvar?",
    description: "As informações preenchidas serão perdidas. Deseja realmente sair?",
    confirmLabel: "Sair sem salvar",
    cancelLabel: "Continuar",
    variant: "destructive" as const,
};
