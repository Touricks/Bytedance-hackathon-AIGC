import { z } from "zod";

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
  jobId: optionalText,
  platform: z.string().trim().min(1),
  accountName: z.string().trim().min(1),
  publishUrl: optionalUrl,
  publishedAt: z.string().datetime().optional(),
});

export const recordCampaignMetricsRequest = z.object({
  impressions: z.number().int().min(0).default(0),
  clicks: z.number().int().min(0).default(0),
  conversions: z.number().int().min(0).default(0),
  spendCents: z.number().int().min(0).default(0),
  gmvCents: z.number().int().min(0).default(0),
});

export type CreateCampaignPublicationRequest = z.infer<
  typeof createCampaignPublicationRequest
>;
export type RecordCampaignMetricsRequest = z.infer<
  typeof recordCampaignMetricsRequest
>;
