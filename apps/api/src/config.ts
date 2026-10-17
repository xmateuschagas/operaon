import { z } from 'zod';

// Configuração validada na inicialização; valores reais nunca entram em fixtures ou logs.
export const configSchema = z.object({
  APP_URL: z.string().url(),
  ADMIN_EMAIL: z.string().email().transform((email) => email.toLowerCase()),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENC_KEY: z.string().refine((value) => Buffer.from(value,'base64').length===32),
  GOOGLE_CLIENT_ID: z.string().min(1), GOOGLE_CLIENT_SECRET: z.string().min(1), GOOGLE_REDIRECT_URI: z.string().url(),
  SESSION_DAYS: z.coerce.number().int().positive().default(7), INVITATION_DAYS: z.coerce.number().int().positive().default(7),
});
export type AuthConfig = z.infer<typeof configSchema>;
