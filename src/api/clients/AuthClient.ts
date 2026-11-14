import type { ApiClient, AuthMode } from '../core/ApiClient';
import type { AuthRequest } from '../models/auth.model';

/** Raw /auth endpoints. Token lifecycle management lives in src/auth/AuthSession, not here. */
export class AuthClient {
  constructor(private readonly http: ApiClient) {}

  login(credentials: AuthRequest | Record<string, unknown>) {
    return this.http.post('auth/login', { data: credentials, auth: 'none' });
  }

  register(credentials: AuthRequest | Record<string, unknown>) {
    return this.http.post('auth/register', { data: credentials, auth: 'none' });
  }

  me(auth?: AuthMode) {
    return this.http.get('auth/me', { auth });
  }
}
