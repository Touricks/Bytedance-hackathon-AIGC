import { db } from "../../db/client.js";

export const scriptRepository = {
  async getScriptWithShots(scriptId: string) {
    const script = await db.getScript(scriptId);
    const shots = await db.listShots(script.id);
    return { script, shots };
  }
};
