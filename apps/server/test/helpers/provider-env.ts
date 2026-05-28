import { z } from "zod";

export const IntegrationEnvSchema = z.object({
  TEST_API_BASE_URL: z.string().url(),
  TEST_RUN_ID: z.string().default(`run-${Date.now()}`),
  TEXT_API_KEY: z.string().optional(),
  TEXT_BASE_URL: z.string().url().optional(),
  TEXT_ENDPOINT_ID: z.string().optional(),
  IMAGE_API_KEY: z.string().optional(),
  IMAGE_BASE_URL: z.string().url().optional(),
  IMAGE_ENDPOINT_ID: z.string().optional(),
  VIDEO_API_KEY: z.string().optional(),
  VIDEO_BASE_URL: z.string().url().optional(),
  VIDEO_ENDPOINT_ID: z.string().optional(),
  TEST_FIXTURE_WORKSPACE: z.string().optional(),
});

export type IntegrationEnv = z.infer<typeof IntegrationEnvSchema>;

export function loadIntegrationEnv(): IntegrationEnv {
  const env = IntegrationEnvSchema.parse(process.env);
  const required: Array<keyof IntegrationEnv> = [
    "TEXT_API_KEY",
    "TEXT_ENDPOINT_ID",
    "IMAGE_API_KEY",
    "IMAGE_ENDPOINT_ID",
  ];
  for (const k of required) {
    if (!env[k]) throw new Error(`Integration tests require ${k}`);
  }
  return env;
}
