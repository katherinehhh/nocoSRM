import { readFile } from 'node:fs/promises';
import { z } from 'zod';
export const SettingsDocument = z
  .object({
    revision: z.number().int().nonnegative(),
    providers: z.record(z.string(), z.record(z.string(), z.json())),
    requests: z.record(z.string(), z.string()),
  })
  .strict();
export type SettingsDocument = z.infer<typeof SettingsDocument>;
export async function readSettings(file: string): Promise<SettingsDocument> {
  try {
    return SettingsDocument.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT')
      return { revision: 0, providers: {}, requests: {} };
    throw e;
  }
}
export function mailSettingsSource(file: string) {
  return {
    name: 'srm-mail-provider-settings',
    async read() {
      const state = await readSettings(file);
      return {
        kind: 'map' as const,
        value: { mail: { providers: state.providers } },
      };
    },
  };
}
