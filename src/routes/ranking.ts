import { Router } from "express";
import { db } from "../utils/db";
import { log } from "../logger";
import type { RankingEntry } from "../types";
import { $Enums } from "../generated/prisma";

const clusterNames: $Enums.Cluster[] = [
    $Enums.Cluster.MATH,
    $Enums.Cluster.VOCABULARY,
    $Enums.Cluster.READING,
    $Enums.Cluster.LISTENING
];

const router = Router();

// GET /ranking - Overall rankings
router.get("/", async (req, res) => {
    log.api(`GET /ranking - Fetching overall rankings`);
    try {
        const users = await db.user.findMany({
            include: {
                userRatings: true,
                submissions: {
                    include: { quiz: true }
                }
            }
        });

        const ranking: RankingEntry[] = users
            .map(user => {
                const clusters: Record<string, number | null> = {};
                let totalRating = 0;
                let ratingCount = 0;

                // Calculate cluster ratings
                user.userRatings.forEach(rating => {
                    clusters[rating.cluster] = rating.Ru;
                    totalRating += rating.Ru;
                    ratingCount++;
                });

                // Fill missing clusters with null
                clusterNames.forEach(cluster => {
                    if (!(cluster in clusters)) {
                        clusters[cluster] = null;
                    }
                });

                return {
                    studentId: user.studentId,
                    name: user.name,
                    shortName: user.shortName,
                    averageRu: ratingCount > 0 ? totalRating / ratingCount : 1500,
                    clusters: clusters as Record<$Enums.Cluster, number | null>
                };
            })
            .sort((a, b) => b.averageRu - a.averageRu);

        log.success(`Returned rankings for ${ranking.length} users`);
        res.json(ranking);
    } catch (error) {
        log.error("Error fetching ranking", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// GET /ranking/:cluster - Cluster-specific ranking
router.get("/:cluster", async (req, res) => {
    const { cluster } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    log.api(`GET /ranking/${cluster} - limit: ${limit}, offset: ${offset}`);
    try {
        if (!clusterNames.includes(cluster as $Enums.Cluster)) {
            log.warn(`Invalid cluster requested: ${cluster}`);
            return res.status(400).json({ error: 'Invalid cluster' });
        }

        const userRatings = await db.userRating.findMany({
            where: { cluster: cluster as $Enums.Cluster },
            include: { user: true },
            orderBy: { Ru: 'desc' },
            take: Number(limit),
            skip: Number(offset)
        });

        const ranking = userRatings.map(rating => ({
            studentId: rating.user.studentId ,
            name: rating.user.name,
            shortName: rating.user.shortName,
            rating: rating.Ru,
            cluster: rating.cluster
        }));

        log.success(`Returned ${ranking.length} rankings for cluster ${cluster}`);
        res.json(ranking);
    } catch (error) {
        log.error("Error fetching cluster ranking", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
