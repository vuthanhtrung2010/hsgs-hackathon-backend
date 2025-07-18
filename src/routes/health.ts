
import { Router } from "express";
import { log } from "../logger";

const router = Router();

// GET /health
router.get('/', (req, res) => {
    log.api('GET /health');
    const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version,
        environment: process.env.NODE_ENV || 'development'
    };
    res.json(health);
});

export default router;
