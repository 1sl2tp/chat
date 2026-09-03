import type { Role } from '../app/types.js';

export interface AuthProfile {
  role: Role;
  name: string;
  username: string;
}

export interface AuthService {
  getProfile(): Promise<AuthProfile>;
  updateProfile(input: { name: string; username: string; password: string }): Promise<void>;
}
