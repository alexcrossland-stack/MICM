import { validateServerEnvironment } from "./lib/env";
import { logger } from "./lib/logger";

const env = validateServerEnvironment();
const { default: app } = await import("./app");

app.listen(env.port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: env.port }, "Server listening");
});
