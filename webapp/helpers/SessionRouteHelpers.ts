/** Rotas abertas sem sessão: quem esqueceu a senha chega nelas exatamente por não conseguir autenticar. */
export const PUBLIC_ROUTES = ["login", "forgotPassword", "resetPassword"];

export function isPublicRoute(routeName: string): boolean {
  return PUBLIC_ROUTES.includes(routeName);
}

export type RequiredBranchDialogState = {
  selecting: boolean;
  authenticated: boolean;
  branchCode: string;
  routeName: string;
};

/**
 * O diálogo de filial obrigatória só abre para quem está logado, sem filial, fora das telas
 * públicas e fora do cadastro de filial. A tela pública importa porque o login avisa que a sessão
 * ficou pronta ANTES de navegar para a home: sem essa regra o diálogo abria por cima do login.
 */
export function shouldOpenRequiredBranchDialog(state: RequiredBranchDialogState): boolean {
  return !state.selecting
    && state.authenticated
    && !state.branchCode
    && !isPublicRoute(state.routeName)
    && !state.routeName.startsWith("branchs");
}
