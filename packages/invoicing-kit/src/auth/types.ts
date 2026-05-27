export interface AuthContext {
  userId: string;
  organizationId: string;
  role: string | null;
}

export type AuthVariables = {
  authContext: AuthContext;
};
