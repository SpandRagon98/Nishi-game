import { createServer } from './server';

const port = Number(process.env.PORT ?? 2567);
const host = process.env.HOST ?? '0.0.0.0';
const server = createServer();
await server.listen(port, host);
console.log(`[nishi] multiplayer server listening on ws://${host}:${port}`);
