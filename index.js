import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import checkRoutes from './routes/check.routes.js';
import './queues/check.worker.js';
import watchlistRoutes from './routes/watchlist.routes.js';
import { errorHandler } from './middlewares/errorHandler.middlewares.js';

import authRoutes from './routes/auth.routes.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/check', checkRoutes);
app.use('/checks', checkRoutes);
app.use('/watchlist', watchlistRoutes);

app.use(errorHandler);


const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
