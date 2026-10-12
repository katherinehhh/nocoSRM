import { readFile, open, rename, unlink, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Application } from '@nocobase/app-server/application';
import { ApiError } from '@nocobase/app-server/router';
import {
  mailProviderRegistryToken,
  type MailConfig,
  type MailProviderConfigEntry,
} from '@nocobase/app-plugin-mail/server';
import { readSettings, type SettingsDocument } from './storage.js';
import {
  providerTypes,
  type ProviderView,
  type ProviderSettingsView,
  type ProviderSave,
  type ProviderToggle,
} from '../../shared/mail-settings.js';
import type { z } from 'zod';
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, v]) => [key, canonical(v)]),
        )
      : value;
const hash = (v: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(v)) ?? 'null')
    .digest('hex');
const refuse = (
  reason: string,
  status: 'ABORTED' | 'FAILED_PRECONDITION' = 'FAILED_PRECONDITION',
): never => {
  throw new ApiError({
    status,
    reason,
    domain: 'srmMail',
    message: 'Mail provider configuration refused.',
  });
};
export class MailSettingsService {
  readonly file: string;
  constructor(readonly app: Application) {
    this.file = app.paths.storage('mail-provider-settings.json');
  }
  configs() {
    return this.app.config.get<MailConfig>('mail')?.providers ?? {};
  }
  async view(origin: string): Promise<ProviderSettingsView> {
    const state = await readSettings(this.file),
      configs = this.configs(),
      providers: ProviderView[] = [];
    for (const type of providerTypes) {
      const entries = Object.entries(configs).filter(
        ([, c]) => c.type === type,
      );
      for (const [name, c] of entries.length
        ? entries
        : [
            [
              type === 'imap-smtp' ? 'company-mail' : type,
              { type, enabled: false } as MailProviderConfigEntry,
            ] as const,
          ]) {
        const ep = (key: string, port: number) => {
          const value = c[key] as
            { host?: string; port?: number; secure?: boolean } | undefined;
          return {
            host: value?.host ?? '',
            port: value?.port ?? port,
            secure: value?.secure ?? true,
          };
        };
        providers.push({
          name,
          type,
          configured: entries.length > 0,
          enabled: c.enabled !== false,
          hasSecret: !!c.clientSecret,
          clientId: typeof c.clientId === 'string' ? c.clientId : '',
          tenant: typeof c.tenant === 'string' ? c.tenant : 'common',
          imap: ep('imap', 993),
          smtp: ep('smtp', 465),
        });
      }
    }
    const callback =
      this.app.config.get<MailConfig>('mail')?.oauthCallbackUrl?.trim() ||
      '/mail/oauth/callback';
    const callbackPath = /^[a-z][a-z0-9+.-]*:/i.test(callback)
      ? callback
      : this.app.publicBasePath.replace(/\/$/, '') +
        '/' +
        callback.replace(/^\//, '');
    return {
      version: state.revision + ':' + hash(configs),
      callbackUrl: new URL(
        callbackPath,
        this.app.config.get<string>('app.publicOrigin') || origin,
      ).toString(),
      providers,
      otherProviders: Object.entries(configs)
        .filter(([, c]) => !providerTypes.some((t) => t === c.type))
        .map(([name]) => name),
    };
  }
  async write(
    input: z.infer<typeof ProviderSave> | z.infer<typeof ProviderToggle>,
    origin: string,
  ) {
    await mkdir(dirname(this.file), { recursive: true });
    let lock;
    try {
      lock = await open(this.file + '.lock', 'wx', 0o600);
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'EEXIST')
        refuse('BUSY', 'ABORTED');
      throw e;
    }
    try {
      const state = await readSettings(this.file),
        digest = hash(input),
        prior = state.requests[input.requestKey];
      if (prior) {
        if (prior !== digest) refuse('REQUEST_REUSED');
        return this.view(origin);
      }
      const view = await this.view(origin);
      if (view.version !== input.version) refuse('CONFLICT', 'ABORTED');
      const existing = this.configs()[input.name];
      let config;
      if ('fields' in input) {
        if (existing && existing.type !== input.fields.type)
          refuse('TYPE_IMMUTABLE');
        const fields = input.fields;
        config = { ...existing, ...fields, enabled: existing?.enabled ?? true };
        if (fields.type !== 'imap-smtp') {
          const secret = fields.clientSecret?.trim() || existing?.clientSecret;
          if (typeof secret !== 'string' || !secret) refuse('SECRET_REQUIRED');
          config = { ...config, clientSecret: secret };
        }
      } else {
        if (!existing) refuse('NOT_CONFIGURED');
        config = { ...existing, enabled: input.enabled };
      }
      const definition = this.app.container
        .resolve(mailProviderRegistryToken)
        .definition(String(config.type));
      if (!definition) return refuse('UNSUPPORTED');
      try {
        definition.validateConfig?.({ ...config, name: input.name });
      } catch {
        refuse('INVALID');
      }
      const requests: [string, string][] = [
        ...Object.entries(state.requests),
        [input.requestKey, digest],
      ];
      const next: SettingsDocument = {
        revision: state.revision + 1,
        providers: {
          ...state.providers,
          [input.name]: config as SettingsDocument['providers'][string],
        },
        requests: Object.fromEntries(requests.slice(-100)),
      };
      let previous: Uint8Array | null = null;
      try {
        previous = await readFile(this.file);
      } catch (e) {
        if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT'))
          throw e;
      }
      const atomic = async (bytes: Uint8Array) => {
        const temp = this.file + '.' + randomUUID() + '.tmp',
          handle = await open(temp, 'wx', 0o600);
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        try {
          await rename(temp, this.file);
        } finally {
          await unlink(temp).catch((e) => {
            if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT'))
              throw e;
          });
        }
      };
      try {
        await atomic(Buffer.from(JSON.stringify(next)));
        await this.app.config.reload();
        const actual = this.configs()[input.name];
        if (!actual || hash(actual) !== hash(config))
          throw new Error('Configuration readback mismatch');
      } catch {
        if (previous) await atomic(previous);
        else await unlink(this.file);
        try {
          await this.app.config.reload();
        } catch {
          refuse('RELOAD_FAILED');
        }
        refuse('SAVE_FAILED');
      }
      return this.view(origin);
    } finally {
      await lock.close();
      await unlink(this.file + '.lock');
    }
  }
}
