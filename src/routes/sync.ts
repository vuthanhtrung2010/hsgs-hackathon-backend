import { Router } from "express";
import { db } from "../utils/db";
import { log } from "../logger";
import fs from "fs";
import { Sync } from "../utils/sync";

const router = Router();

// GET /sync/status
router.get('/status', async (req, res) => {
    log.api('GET /sync/status');
    try {
        const lastCronRun = await db.cronHistory.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        const fileLastRun = fs.existsSync('./cron_history.txt')
            ? fs.readFileSync('./cron_history.txt', 'utf8').trim()
            : null;
        const totalUsers = await db.user.count();
        const totalSubmissions = await db.quizSubmission.count();
        const totalQuizzes = await db.quiz.count();
        const status = {
            lastCronRun: lastCronRun?.lastRun || null,
            lastFileRun: fileLastRun,
            nextScheduledRun: "Every 45 minutes",
            stats: {
                totalUsers,
                totalSubmissions,
                totalQuizzes,
                clusters: 4
            },
            status: "OK"
        };
        log.success(`Sync status: ${totalUsers} users, ${totalSubmissions} submissions, ${totalQuizzes} quizzes`);
        res.json(status);
    } catch (error) {
        log.error("Error fetching sync status", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.post('/', async (req, res) => {
    try {
        const { force = false } = req.body || {};
        const result = await Sync(force);
        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                stats: result.stats,
                syncType: force ? 'full' : 'incremental',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.message,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        log.error("Error in manual sync", error);
        res.status(500).json({ 
            success: false,
            error: "Internal server error during sync",
            timestamp: new Date().toISOString()
        });
    }
});

export default router;