
import { Router } from "express";
import { db } from "../utils/db";
import { log } from "../logger";

const router = Router();

// GET /quizzes/:quizId/stats
router.get('/:quizId/stats', async (req, res) => {
    const { quizId } = req.params;
    log.api(`GET /quizzes/${quizId}/stats`);
    try {
        const quiz = await db.quiz.findUnique({
            where: { id: Number(quizId) },
            include: {
                submissions: {
                    include: { user: true }
                }
            }
        });
        if (!quiz) {
            log.warn(`Quiz not found: ${quizId}`);
            return res.status(404).json({ error: 'Quiz not found' });
        }
        const stats = {
            quiz: {
                id: quiz.id,
                title: quiz.title,
                cluster: quiz.cluster,
                rating: quiz.Rq,
                submissionCount: quiz.submissionCount
            },
            submissions: quiz.submissions.length,
            averageScore: quiz.submissions.length > 0 
                ? quiz.submissions.reduce((sum, sub) => sum + (sub.score / sub.maxScore), 0) / quiz.submissions.length
                : 0,
            scoreDistribution: quiz.submissions.map(sub => ({
                studentId: sub.user.studentId,
                name: sub.user.name,
                score: sub.score,
                maxScore: sub.maxScore,
                percentage: (sub.score / sub.maxScore) * 100
            }))
        };
        log.success(`Returned stats for quiz: ${quiz.title} (${quiz.submissions.length} submissions)`);
        res.json(stats);
    } catch (error) {
        log.error("Error fetching quiz stats", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
