import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import checkRoutes from './routes/check.routes.js';
import watchlistRoutes from './routes/watchlist.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import { errorHandler } from './middlewares/errorHandler.middlewares.js';
import authRoutes from './routes/auth.routes.js';

// Bull Board imports
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { checkQueue, notificationQueue, emailQueue } from './queues/check.queues.js';
import { cronQueue } from './queues/cron.queue.js';
import { authenticate, authorize } from './middlewares/auth.middlewares.js';

// Day 8 imports
import { globalRateLimiter } from './middlewares/rateLimit.middlewares.js';
import { db } from './db/index.js';
import redis from './db/redis.js';
import { sql } from 'drizzle-orm';
import { env } from './config/env.js';

const app = express();
app.set('trust proxy', env.TRUST_PROXY ? 1 : false);

app.use(helmet());

app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || env.allowedOrigins.includes(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '20kb' }));

// Mount global rate limiter (e.g. 100 requests per minute)
app.use(globalRateLimiter(100, 60));

// Bull Board Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
    queues: [
        new BullMQAdapter(checkQueue),
        new BullMQAdapter(notificationQueue),
        new BullMQAdapter(emailQueue),
        new BullMQAdapter(cronQueue),
    ],
    serverAdapter: serverAdapter,
});

app.use('/admin/queues', authenticate, authorize('admin'), serverAdapter.getRouter());

// Health check endpoint
app.get('/health', async (req, res) => {
    let dbStatus = 'ok';
    let redisStatus = 'ok';

    try {
        await db.execute(sql`SELECT 1`);
    } catch (err) {
        dbStatus = 'down';
    }

    try {
        const ping = await redis.ping();
        if (ping !== 'PONG') {
            redisStatus = 'down: unexpected ping response';
        }
    } catch (err) {
        redisStatus = 'down';
    }

    const healthy = dbStatus === 'ok' && redisStatus === 'ok';
    res.status(healthy ? 200 : 500).json({
        status: healthy ? 'healthy' : 'unhealthy',
        db: dbStatus,
        redis: redisStatus,
    });
});

app.use('/auth', authRoutes);
app.use('/check', checkRoutes);
app.use('/checks', checkRoutes);
app.use('/watchlist', watchlistRoutes);
app.use('/notifications', notificationRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

app.use(errorHandler);

const PORT = env.PORT;

if (env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server listening on ${PORT}`);
    });
}

export default app;
