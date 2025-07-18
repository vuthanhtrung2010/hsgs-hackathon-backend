
import { Router } from "express";
import { logger, log } from "../logger";

const router = Router();

// GET /log/level
router.get('/level', (req, res) => {
    log.api('GET /log/level');
    res.json({ 
        currentLevel: logger.getLevel(),
        levelName: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][logger.getLevel()],
        availableLevels: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
    });
});

// POST /log/level
router.post('/level', (req, res) => {
    const { level } = req.body || {};
    log.api(`POST /log/level - Setting level to: ${level}`);
    if (typeof level === 'string') {
        const levelNum = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].indexOf(level.toUpperCase());
        if (levelNum !== -1) {
            logger.setLevel(levelNum);
            res.json({ 
                success: true, 
                currentLevel: levelNum,
                levelName: level.toUpperCase()
            });
            return;
        }
    }
    res.status(400).json({ 
        error: 'Invalid log level. Use: DEBUG, INFO, WARN, ERROR, or FATAL' 
    });
});

export default router;
