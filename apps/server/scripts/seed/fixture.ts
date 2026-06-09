import { readFile } from "node:fs/promises";
import { z } from "zod";
import { creativeFactorsSchema } from "@aigc-video/shared";

/**
 * Declarative description of the dashboard data to inject. The script expands
 * each video + publication into DB rows; per publication it backfills `days`
 * daily cumulative metric snapshots that end at `finalTotals`.
 */

const metricCountsSchema = z.object({
  impressions: z.number().int().min(0),
  clicks: z.number().int().min(0),
  conversions: z.number().int().min(0),
  spendCents: z.number().int().min(0),
  gmvCents: z.number().int().min(0),
});

const publicationFixtureSchema = z.object({
  key: z.string().min(1),
  platform: z.string().min(1),
  accountName: z.string().min(1),
  publishUrl: z.string().url().optional(),
  publishedAt: z.string().datetime(),
  days: z.number().int().min(1),
  finalTotals: metricCountsSchema,
});

const videoFixtureSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  durationSec: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  creativeFactors: creativeFactorsSchema,
  publications: z
    .array(publicationFixtureSchema)
    .min(1)
    .superRefine((pubs, ctx) => {
      const keys = new Set<string>();
      for (const pub of pubs) {
        if (keys.has(pub.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate publication key "${pub.key}"`,
          });
        }
        keys.add(pub.key);
      }
    }),
});

export const dashboardSeedFixtureSchema = z.object({
  workspace: z
    .object({
      id: z.string().min(1).default("ws_mock_dashboard"),
      name: z.string().min(1).default("Mock Dashboard"),
    })
    .default({ id: "ws_mock_dashboard", name: "Mock Dashboard" }),
  videos: z
    .array(videoFixtureSchema)
    .min(1)
    .superRefine((videos, ctx) => {
      const keys = new Set<string>();
      for (const video of videos) {
        if (keys.has(video.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate video key "${video.key}"`,
          });
        }
        keys.add(video.key);
      }
    }),
});

export type DashboardSeedFixture = z.infer<typeof dashboardSeedFixtureSchema>;
export type VideoFixture = z.infer<typeof videoFixtureSchema>;
export type PublicationFixture = z.infer<typeof publicationFixtureSchema>;

export function parseFixture(raw: unknown): DashboardSeedFixture {
  return dashboardSeedFixtureSchema.parse(raw);
}

export async function loadFixtureFromFile(
  filePath: string,
): Promise<DashboardSeedFixture> {
  const text = await readFile(filePath, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Fixture is not valid JSON (${filePath}): ${(error as Error).message}`,
    );
  }
  return parseFixture(json);
}
