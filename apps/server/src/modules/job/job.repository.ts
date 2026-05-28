import { db } from "../../db/client.js";
import type { GenerationJobRow } from "../../db/client.js";

export const jobRepository = {
  insert: (...args: Parameters<typeof db.db2.insertGenerationJob>) => db.db2.insertGenerationJob(...args),
  get: (...args: Parameters<typeof db.db2.getGenerationJob>) => db.db2.getGenerationJob(...args),
  update: (...args: Parameters<typeof db.db2.updateGenerationJob>) => db.db2.updateGenerationJob(...args),
};
export type { GenerationJobRow };
