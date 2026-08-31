export interface PasswordCredentials {
  email: string
  password: string
}

export interface AuthActions {
  signInWithPassword(credentials: PasswordCredentials): Promise<void>
  signOut(): Promise<void>
}
