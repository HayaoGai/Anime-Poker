import { logger } from '@colyseus/core';
import { createServer } from './app';
import { config } from './config';
import { startKeepAlive } from './keepAlive';

const server = createServer();

await server.listen(config.port);
logger.info(`[server] listening on port ${config.port}`);

startKeepAlive(config.externalUrl, config.keepAliveIntervalMs);
