import { Server, logger } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { HEALTH_PATH } from '@shared/constants';
import { config } from './config';
import { startKeepAlive } from './keepAlive';

const startedAt = Date.now();

const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    express: (app) => {
        app.get(HEALTH_PATH, (_req, res) => {
            res.json({ status: 'ok', uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
        });
    },
});

await server.listen(config.port);
logger.info(`[server] listening on port ${config.port}`);

startKeepAlive(config.externalUrl, config.keepAliveIntervalMs);
