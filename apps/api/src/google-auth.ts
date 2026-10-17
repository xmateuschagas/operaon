import { z } from 'zod';
import type { AuthConfig } from './config.js';
import { DomainError } from '@operaon/shared/errors';

// Provider injetável mantém testes sem credencial real e runtime sem login simulado.
export interface GoogleIdentity { sub: string; email: string; name: string; refreshToken?: string; calendarAuthorized?: boolean }
export interface GoogleAuth {
  authorize(state: string, challenge: string, calendar: boolean): string;
  exchange(code: string, verifier: string): Promise<GoogleIdentity>;
}
export class GoogleOAuth implements GoogleAuth {
  constructor(private readonly config: AuthConfig, private readonly request: typeof fetch = fetch) {}
  authorize(state: string, challenge: string, calendar: boolean) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({client_id:this.config.GOOGLE_CLIENT_ID,redirect_uri:this.config.GOOGLE_REDIRECT_URI,response_type:'code',scope:`openid email profile${calendar?' https://www.googleapis.com/auth/calendar.app.created':''}`,state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',include_granted_scopes:'true'}).toString();
    if(calendar) url.searchParams.set('prompt','consent');
    return url.toString();
  }
  async exchange(code: string, verifier: string) {
    const response = await this.request('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,code_verifier:verifier,client_id:this.config.GOOGLE_CLIENT_ID,client_secret:this.config.GOOGLE_CLIENT_SECRET,redirect_uri:this.config.GOOGLE_REDIRECT_URI,grant_type:'authorization_code'})});
    if(!response.ok) throw new DomainError('GOOGLE_AUTH_FAILED',401,'Não foi possível autenticar com Google');
    const tokens=z.object({access_token:z.string(),refresh_token:z.string().optional(),scope:z.string().optional()}).parse(await response.json());
    const info=await this.request('https://openidconnect.googleapis.com/v1/userinfo',{signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${tokens.access_token}`}});
    if(!info.ok) throw new DomainError('GOOGLE_AUTH_FAILED',401);
    const identity=z.object({sub:z.string(),email:z.string().email(),email_verified:z.literal(true),name:z.string()}).parse(await info.json());
    return {sub:identity.sub,email:identity.email.toLowerCase(),name:identity.name,refreshToken:tokens.refresh_token,calendarAuthorized:tokens.scope?.split(' ').includes('https://www.googleapis.com/auth/calendar.app.created') ?? false};
  }
}
