/**
 * Quem está logado. O Gateway já devolvia isso em `/security/auth/login` e
 * `/security/auth/status`; o `SessionService` passou a guardar em `sessionModel>/userName` e
 * `sessionModel>/isAdmin` para a tela poder decidir o que o usuário pode alterar (hoje: os
 * comentários de contrato, editáveis só pelo autor ou por um administrador).
 */
export type UserIdentity = {
  username?: string;
  isAdmin?: boolean;
};

/** Resposta de `/security/auth/status`. */
export type AuthStatus = UserIdentity & {
  authenticated?: boolean;
};

/** Resposta de `/security/auth/login`. */
export type LoginResult = {
  user?: UserIdentity;
};
