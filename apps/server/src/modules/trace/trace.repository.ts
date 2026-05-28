import { db } from "../../db/client.js";
export const traceRepository = {
  insert: (...args: Parameters<typeof db.db2.insertTraceEvent>) => db.db2.insertTraceEvent(...args),
  listByWorkspace: (...args: Parameters<typeof db.db2.listTraceEventsByWorkspace>) => db.db2.listTraceEventsByWorkspace(...args),
  listByShot: (...args: Parameters<typeof db.db2.listTraceEventsByShot>) => db.db2.listTraceEventsByShot(...args),
};
