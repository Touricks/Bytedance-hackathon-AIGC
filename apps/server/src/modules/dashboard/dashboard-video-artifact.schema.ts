import { z } from "zod";

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const requiredText = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1),
);

export const importDashboardVideoRequest = z.object({
  finalVideoJobId: requiredText,
  name: requiredText,
});

export type ImportDashboardVideoRequest = z.infer<
  typeof importDashboardVideoRequest
>;
