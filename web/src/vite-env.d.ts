/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module 'virtual:resume-validator' {
  import type { ErrorObject } from 'ajv';
  /** The resume schema's validator, precompiled at build time (vite.config.ts). */
  const validate: ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };
  export default validate;
}
