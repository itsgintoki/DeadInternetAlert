import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middlewares.js';
import { validate } from '../middlewares/validate.middlewares.js';
import { addWatchlistSchema } from '../validations/watchlist.validations.js';
import { addToWatchList, removeFromWatchlist, listWatchlist } from '../controllers/watchlist.controllers.js';

const router = Router();
router.use(authenticate);

router.post('/', validate(addWatchlistSchema), addToWatchList);
router.delete('/:id', removeFromWatchlist);
router.get('/', listWatchlist);

export default router;