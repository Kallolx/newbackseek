import { buildApp } from './app.mjs';
import { config } from './config.mjs';
const app = await buildApp();
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{await app.close();process.exit(0);});
await app.listen({host:'0.0.0.0',port:config.PORT});
