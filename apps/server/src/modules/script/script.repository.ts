import { db } from "../../db/client.js";

export const scriptRepository = {
  getScriptWithShots(scriptId: string) {
    const script = db.getScript(scriptId);
    const shots = db.listShots(script.id);
    return { script, shots };
  }
};
