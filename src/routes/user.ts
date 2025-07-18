
import { Router } from "express";
import { db } from "../utils/db";
import { log } from "../logger";
import type { Cluster } from "../types";
import { $Enums } from "../generated/prisma";

const router = Router();

// GET /users/:studentId/stats
router.get('/:studentId/stats', async (req, res) => {
    const { studentId } = req.params;
    const { cluster } = req.query;
    log.api(`GET /users/${studentId}/stats - cluster: ${cluster || 'all'}`);
    try {
        const user = await db.user.findUnique({
            where: { studentId },
            include: {
                userRatings: cluster ? { where: { cluster: cluster as Cluster } } : true,
                submissions: {
                    include: { quiz: true },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
        if (!user) {
            log.warn(`User not found: ${studentId}`);
            return res.status(404).json({ error: 'User not found' });
        }
        log.success(`Returned stats for user: ${user.name} (${studentId})`);
        res.json({
            user: {
                studentId: user.studentId,
                name: user.name,
                shortName: user.shortName
            },
            ratings: user.userRatings,
            submissions: user.submissions,
            totalSubmissions: user.submissions.length
        });
    } catch (error) {
        log.error("Error fetching user stats", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
