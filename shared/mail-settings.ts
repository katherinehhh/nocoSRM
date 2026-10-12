import { z } from 'zod';
export const providerTypes = ['gmail', 'microsoft', 'imap-smtp'] as const;
export type ProviderType = (typeof providerTypes)[number];
const host = z
  .string()
  .trim()
  .regex(/^(?=.{1,253}$)([A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$/);
const endpoint = z
  .object({
    host,
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
  })
  .strict();
export const ProviderFields = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('gmail'),
      clientId: z.string().trim().min(1).max(500),
      clientSecret: z.string().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('microsoft'),
      clientId: z.string().trim().min(1).max(500),
      clientSecret: z.string().max(2000).optional(),
      tenant: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9.-]+$/)
        .max(253),
    })
    .strict(),
  z
    .object({ type: z.literal('imap-smtp'), imap: endpoint, smtp: endpoint })
    .strict(),
]);
export const ProviderSave = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    version: z.string().min(1).max(128),
    requestKey: z.string().uuid(),
    fields: ProviderFields,
  })
  .strict();
export const ProviderToggle = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    version: z.string().min(1).max(128),
    requestKey: z.string().uuid(),
    enabled: z.boolean(),
  })
  .strict();
export interface ProviderView {
  name: string;
  type: ProviderType;
  configured: boolean;
  enabled: boolean;
  hasSecret: boolean;
  clientId: string;
  tenant: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
}
export interface ProviderSettingsView {
  version: string;
  callbackUrl: string;
  providers: ProviderView[];
  otherProviders: string[];
}
