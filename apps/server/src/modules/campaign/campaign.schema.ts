import { z } from "zod";

export const campaignPublicationStatusSchema = z.enum([
  "planned",
  "published",
  "failed",
  "archived",
]);

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalText = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);
const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().url().optional(),
);

export const createCampaignPublicationRequest = z.object({
  finalVideoJobId: optionalText,
  platform: z.string().trim().min(1),
  channelName: z.string().trim().min(1),
  kolName: optionalText,
  publishUrl: optionalUrl,
  status: campaignPublicationStatusSchema.default("planned"),
  notes: optionalText,
});

export const recordCampaignMetricsRequest = z.object({
  impressions: z.number().int().min(0).default(0),
  clicks: z.number().int().min(0).default(0),
  conversions: z.number().int().min(0).default(0),
  spendCents: z.number().int().min(0).default(0),
  capturedAt: z.string().datetime().optional(),
  source: z.string().trim().min(1).default("manual"),
  metadata: z.record(z.unknown()).default({}),
});

export type CreateCampaignPublicationRequest = z.infer<
  typeof createCampaignPublicationRequest
>;
export type RecordCampaignMetricsRequest = z.infer<
  typeof recordCampaignMetricsRequest
>;
