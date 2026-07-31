/**
 * Quem está logado. O Gateway já devolvia isso em `/security/auth/login` e
 * `/security/auth/status`; o `SessionService` passou a guardar em `sessionModel>/userName` e
 * `sessionModel>/isAdmin` para a tela poder decidir o que o usuário pode alterar (hoje: os
 * comentários de contrato, editáveis só pelo autor ou por um administrador).
 */
export type UserIdentity = {
  username?: string;
  isAdmin?: boolean;
  /** Nome completo - é o que aparece no menu do avatar e origina as iniciais. */
  fullName?: string;
  email?: string;
  /** Tema escolhido pelo usuário; ausente usa o tema padrão do bootstrap. */
  theme?: string;
  /** Diz à shell se deve buscar a imagem do avatar ou ficar nas iniciais. */
  hasPhoto?: boolean;
};

/** Resposta de `/security/auth/status`. */
export type AuthStatus = UserIdentity & {
  authenticated?: boolean;
};

/** Resposta de `/security/users/me/profile`. */
export type UserProfile = {
  username?: string;
  fullName?: string;
  email?: string;
  isAdmin?: boolean;
  theme?: string;
  hasPhoto?: boolean;
  /** Regra de senha vigente, em texto - a política é configurável no servidor. */
  passwordRequirements?: string;
};

/** Resposta de `/security/auth/login`. */
export type LoginResult = {
  user?: UserIdentity;
};
