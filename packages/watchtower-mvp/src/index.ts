import { Log, LogLevel } from "logepi";

import mountApi from "./api";

Log.setOutputLevel((process.env.API_LOG_LEVEL as LogLevel) || LogLevel.INFO);

const API_TIMEOUT = 5 * 60 * 1000;

(async () => {
  const api = mountApi();
  const port = process.env.PORT || 9000;

  const server = await api.listen(port);
  server.setTimeout(API_TIMEOUT);

  Log.info("Watchtower API is now ready", { tags: { port } });
})();