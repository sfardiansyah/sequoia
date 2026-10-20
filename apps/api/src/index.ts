import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port);

console.log(
  `${config.serviceName} ${config.version} listening on http://localhost:${config.port}`,
);
