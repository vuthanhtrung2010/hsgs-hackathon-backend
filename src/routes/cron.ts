
import { Router } from "express";
import { db } from "../utils/db";
import { log } from "../logger";

const router = Router();

// GET /cron/history
router.get('/history', async (req, res) => {
    log.api('GET /cron/history');
    try {
        const history = await db.cronHistory.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        log.success(`Returned ${history.length} cron history records`);
        res.json(history);
    } catch (error) {
        log.error("Error fetching cron history", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
