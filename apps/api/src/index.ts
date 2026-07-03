import { app } from "./app";
import { env } from "./env";

app.listen(env.PORT);
console.log(JSON.stringify({ msg: "api listening", port: env.PORT }));
