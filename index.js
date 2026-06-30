import 'dotenv/config'

import express from 'express'
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/errorHandler.middlewares.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

const PORT = process.env.PORT || 8000;

app.use(express.json());

app.use(errorHandler);


app.listen(PORT,()=>{
    console.log(`Server listening on ${PORT}`)
});
