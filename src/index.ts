import("dotenv/config");
import express from "express";
import cron from "node-cron";
import axios from "axios";
import fs from "fs";
import cors from "cors";
import { PrismaClient } from "./generated/prisma";
import { $Enums } from "./generated/prisma";
import { logger, log } from "./logger";
import type { 
    Quiz, 
    CanvasQuizSubmission, 
    CanvasUser, 
    UserRatingData, 
    QuestionRatingData,
    RankingEntry,
    EloRatingUpdate,
    SyncStats,
    SyncResult
} from "./types";

type Cluster = $Enums.Cluster;

const BASE_URL = process.env.CANVAS_API_URL;
const TOKEN = process.env.CANVAS_API_KEY;
const COURSE_ID = process.env.CANVAS_COURSE_ID;
const HistoryFile = "./cron_history.txt";

const headers = { Authorization: `Bearer ${TOKEN}` };
const clusterNames: Cluster[] = [
    $Enums.Cluster.ART,
    $Enums.Cluster.BUSINESS,
    $Enums.Cluster.COMMUNICATION,
    $Enums.Cluster.CRIME,
    $Enums.Cluster.ECONOMY,
    $Enums.Cluster.EDUCATION,
    $Enums.Cluster.ENVIRONMENT,
    $Enums.Cluster.FAMILY_AND_CHILDREN,
    $Enums.Cluster.FOOD,
    $Enums.Cluster.HEALTH,
    $Enums.Cluster.LANGUAGE,
    $Enums.Cluster.MEDIA,
    $Enums.Cluster.READING,
    $Enums.Cluster.TECHNOLOGY,
    $Enums.Cluster.TRANSPORT,
    $Enums.Cluster.TRAVEL
];

const app = express();
app.use(express.json());
app.use(cors());

export const db = new PrismaClient();

function expectedScore(Ru: number, Rq: number): number {
    return 1 / (1 + Math.pow(10, (Rq - Ru) / 400));
}

function K_u(n: number): number {
    return 80 * Math.exp(-n / 20) + 30;
}

function K_q(n: number): number {
    return 80 * Math.exp(-n / 30) + 15;
}

function parseCluster(quizName: string): Cluster | null {
    const m = quizName.match(/(?:\[ *)(READING|LISTENING)(?: *\])? *\[?([A-Z &]+) ?\d*\]?/i);
    if (!m || !m[2]) return null;
    
    const clusterText = m[2].trim().toUpperCase().replace(/\s+/g, '_');
    return clusterNames.find(c => c === clusterText) || null;
}

async function fetchAllQuizzes(): Promise<Quiz[]> {
    let page = 1;
    let quizzes: Quiz[] = [];
    while (true) {
        const res = await axios.get(`${BASE_URL}/courses/${COURSE_ID}/quizzes`, {
            headers,
            params: { per_page: 100, page }
        });

        quizzes = quizzes.concat(res.data);
        const linkHeader = res.headers.link;
        if (!linkHeader || !linkHeader.includes('rel="next"')) break;
        page++;
    }
    return quizzes;
}

async function fetchAllUpdatedSubs(id: number, lastRun: string): Promise<CanvasQuizSubmission[]> {
    let page = 1;
    let submissions: CanvasQuizSubmission[] = [];
    while (true) {
        const res = await axios.get(`${BASE_URL}/courses/${COURSE_ID}/quizzes/${id}/submissions`, {
            headers,
            params: { per_page: 100, page, updated_since: encodeURIComponent(lastRun) }
        });

        submissions = submissions.concat(res.data.quiz_submissions || []);
        const linkHeader = res.headers.link;
        if (!linkHeader || !linkHeader.includes('rel="next"')) break;
        page++;
    }
    return submissions;
}

async function fetchUserProfile(userId: number): Promise<CanvasUser | null> {
    try {
        log.canvas(`Fetching user profile for user ID: ${userId}`);
        const res = await axios.get(`${BASE_URL}/users/${userId}/profile`, { headers });
        log.canvas(`Successfully fetched profile for user: ${res.data.name} (${userId})`);
        return res.data;
    } catch (err) {
        log.warn(`Failed to fetch user info for ${userId}`, err);
        return null;
    }
}

async function getOrCreateUser(studentId: string, canvasUserId?: number): Promise<any> {
    log.db(`Looking up user with student ID: ${studentId}`);
    let user = await db.user.findUnique({
        where: { studentId },
        include: { userRatings: true, submissions: true }
    });

    if (!user && canvasUserId) {
        log.info(`Creating new user for student ID: ${studentId}`);
        const profile = await fetchUserProfile(canvasUserId);
        
        user = await db.user.create({
            data: {
                studentId,
                name: profile?.name || "",
                shortName: profile?.short_name || "",
            },
            include: { userRatings: true, submissions: true }
        });

        log.success(`Created new user: ${user.name} (${studentId})`);

        // Create initial ratings for all clusters
        log.db(`Creating initial ratings for ${clusterNames.length} clusters`);
        const ratingPromises = clusterNames.map(cluster => 
            db.userRating.create({
                data: {
                    userId: user!.id,
                    cluster,
                    Ru: 1500
                }
            })
        );
        await Promise.all(ratingPromises);
        log.success(`Initialized ratings for user ${user.name}`);
    } else if (user) {
        log.debug(`Found existing user: ${user.name} (${studentId})`);
    }

    return user;
}

async function getOrCreateQuiz(quizData: Quiz, cluster: Cluster): Promise<any> {
    log.db(`Looking up quiz: ${quizData.title} (ID: ${quizData.id})`);
    let quiz = await db.quiz.findUnique({
        where: { id: quizData.id }
    });

    if (!quiz) {
        log.info(`Creating new quiz: ${quizData.title} (${cluster})`);
        quiz = await db.quiz.create({
            data: {
                id: quizData.id,
                title: quizData.title,
                quizPointsPossible: quizData.points_possible,
                cluster: cluster
            }
        });
        log.success(`Created quiz: ${quiz.title} in cluster ${cluster}`);
    } else {
        log.debug(`Found existing quiz: ${quiz.title}`);
    }

    return quiz;
}

async function updateEloRatings(
    userId: string, 
    quizId: number, 
    cluster: Cluster, 
    score: number, 
    maxScore: number
): Promise<EloRatingUpdate | null> {
    log.debug(`Updating ELO ratings for user ${userId} on quiz ${quizId} in ${cluster}`);
    
    const user = await db.user.findUnique({
        where: { id: userId },
        include: { 
            userRatings: { where: { cluster } },
            submissions: { where: { quiz: { cluster } } }
        }
    });

    const quiz = await db.quiz.findUnique({
        where: { id: quizId }
    });

    if (!user || !quiz || !user.userRatings[0]) {
        log.warn(`Cannot update ELO: missing user, quiz, or rating data`);
        return null;
    }

    const userRating = user.userRatings[0];
    const actualScore = score / maxScore;
    const expectedScoreValue = expectedScore(userRating.Ru, quiz.Rq);
    
    const doneInCluster = user.submissions.length;
    const ku = K_u(doneInCluster);
    const kq = K_q(quiz.submissionCount);
    
    const newRu = userRating.Ru + ku * (actualScore - expectedScoreValue);
    const newRq = quiz.Rq + kq * (expectedScoreValue - actualScore);

    log.elo(`ELO Update: User ${userRating.Ru.toFixed(0)} → ${newRu.toFixed(0)}, Quiz ${quiz.Rq.toFixed(0)} → ${newRq.toFixed(0)}`);

    // Update ratings
    await db.userRating.update({
        where: { id: userRating.id },
        data: { Ru: newRu }
    });

    await db.quiz.update({
        where: { id: quizId },
        data: { 
            Rq: newRq,
            submissionCount: { increment: 1 }
        }
    });

    return {
        userId,
        quizId,
        cluster,
        oldUserRating: userRating.Ru,
        newUserRating: newRu,
        oldQuizRating: quiz.Rq,
        newQuizRating: newRq,
        score,
        maxScore,
        expectedScore: expectedScoreValue,
        actualScore,
        kFactor: ku
    };
}

async function Sync(forceFullSync: boolean = false): Promise<SyncResult> {
    log.sync(`Starting ${forceFullSync ? 'Full' : 'Incremental'} Sync`);
    
    const lastRun = (forceFullSync || !fs.existsSync(HistoryFile))
        ? "1970-01-01T00:00:00Z"
        : fs.readFileSync(HistoryFile, 'utf8').trim();
    const now = new Date().toISOString();

    log.info(`Last run: ${lastRun}, Current time: ${now}`);

    const stats: SyncStats = {
        processedQuizzes: 0,
        processedSubmissions: 0,
        newUsers: 0,
        updatedRatings: 0,
        skippedSubmissions: 0
    };

    try {
        log.canvas(`Fetching all quizzes from Canvas...`);
        const quizzes = await fetchAllQuizzes();
        log.success(`Found ${quizzes.length} quizzes to check`);

        for (const quiz of quizzes) {
            const cluster = parseCluster(quiz.title);
            if (!cluster) {
                log.debug(`Skipping quiz "${quiz.title}" - no cluster found`);
                continue;
            }

            log.canvas(`Fetching submissions for quiz: ${quiz.title}`);
            const submissions = await fetchAllUpdatedSubs(quiz.id, lastRun);
            if (!submissions.length) {
                log.debug(`No new submissions for quiz: ${quiz.title}`);
                continue;
            }

            log.info(`Processing ${submissions.length} submissions for quiz: ${quiz.title} (${cluster})`);
            stats.processedQuizzes++;

            // Ensure quiz exists in database
            await getOrCreateQuiz(quiz, cluster);

            for (const sub of submissions) {
                stats.processedSubmissions++;
                
                if (!sub.finished_at || new Date(sub.finished_at) <= new Date(lastRun)) {
                    log.debug(`Skipping submission ${sub.id} - not finished or too old`);
                    stats.skippedSubmissions++;
                    continue;
                }
                
                if (sub.workflow_state !== 'complete') {
                    log.debug(`Skipping submission ${sub.id} - workflow state: ${sub.workflow_state}`);
                    stats.skippedSubmissions++;
                    continue;
                }
                
                if (sub.score == null || sub.quiz_points_possible == null) {
                    log.debug(`Skipping submission ${sub.id} - missing score data`);
                    stats.skippedSubmissions++;
                    continue;
                }

                const studentId = String(sub.user_id);
                log.debug(`Processing submission for student ${studentId}: ${sub.score}/${sub.quiz_points_possible}`);
                
                // Get or create user
                const existingUser = await db.user.findUnique({ where: { studentId } });
                const user = await getOrCreateUser(studentId, sub.user_id);
                if (!user) {
                    log.warn(`Failed to get or create user for student ID: ${studentId}`);
                    stats.skippedSubmissions++;
                    continue;
                }

                if (!existingUser) {
                    stats.newUsers++;
                }

                // Check if this submission already exists
                const existingSubmission = await db.quizSubmission.findUnique({
                    where: { 
                        userId_quizId: { 
                            userId: user.id, 
                            quizId: quiz.id 
                        } 
                    }
                });

                if (existingSubmission) {
                    log.debug(`Submission already exists for user ${user.name} on quiz ${quiz.title}`);
                    stats.skippedSubmissions++;
                    continue;
                }

                // Update ELO ratings
                const ratingUpdate = await updateEloRatings(
                    user.id, 
                    quiz.id, 
                    cluster, 
                    sub.score, 
                    sub.quiz_points_possible
                );

                if (ratingUpdate) {
                    stats.updatedRatings++;
                    
                    // Create quiz submission record
                    await db.quizSubmission.create({
                        data: {
                            userId: user.id,
                            quizId: quiz.id,
                            score: sub.score,
                            maxScore: sub.quiz_points_possible,
                            workflowState: sub.workflow_state,
                            finishedAt: sub.finished_at ? new Date(sub.finished_at) : null,
                            submittedAt: sub.submitted_at ? new Date(sub.submitted_at) : null,
                            canvasSubmissionId: String(sub.id)
                        }
                    });

                    log.success(`Updated rating for ${user.shortName || user.name} (${studentId}) in ${cluster}: ${ratingUpdate.oldUserRating.toFixed(0)} → ${ratingUpdate.newUserRating.toFixed(0)}`);
                }
            }
        }

        // Update cron history
        await db.cronHistory.create({
            data: { lastRun: new Date(now) }
        });
        
        fs.writeFileSync(HistoryFile, now);
        
        const message = `Sync completed successfully. Processed ${stats.processedQuizzes} quizzes, ${stats.processedSubmissions} submissions. Updated ${stats.updatedRatings} ratings, created ${stats.newUsers} new users, skipped ${stats.skippedSubmissions} submissions.`;
        log.success(message);
        
        return { success: true, message, stats };
        
    } catch (error) {
        const errorMessage = `Error in sync: ${error instanceof Error ? error.message : String(error)}`;
        log.error(errorMessage, error);
        return { success: false, message: errorMessage };
    }
}

// Cron job to process quiz submissions every 45 minutes
cron.schedule("*/45 * * * *", async () => {
    await Sync();
});

// API Endpoints
app.get('/ranking', async (req, res) => {
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
                    clusters: clusters as Record<Cluster, number | null>
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

// Additional API Endpoints

// Get user stats by student ID
app.get('/users/:studentId/stats', async (req, res) => {
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

// Get cluster-specific ranking
app.get('/ranking/:cluster', async (req, res) => {
    const { cluster } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    log.api(`GET /ranking/${cluster} - limit: ${limit}, offset: ${offset}`);
    
    try {
        if (!clusterNames.includes(cluster as Cluster)) {
            log.warn(`Invalid cluster requested: ${cluster}`);
            return res.status(400).json({ error: 'Invalid cluster' });
        }

        const userRatings = await db.userRating.findMany({
            where: { cluster: cluster as Cluster },
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

// Get quiz statistics
app.get('/quizzes/:quizId/stats', async (req, res) => {
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

// Get all clusters
app.get('/clusters', (req, res) => {
    log.api('GET /clusters');
    res.json(clusterNames);
});

// Get cron job history
app.get('/cron/history', async (req, res) => {
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

// Manually trigger data sync (for development/testing)
app.post('/sync', async (req, res) => {
    try {
        const { force = false } = req.body || {};
        log.api(`POST /sync - Manual sync triggered ${force ? '(full sync)' : '(incremental)'}`);
        
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

// Get sync status and last run information
app.get('/sync/status', async (req, res) => {
    log.api('GET /sync/status');
    try {
        const lastCronRun = await db.cronHistory.findFirst({
            orderBy: { createdAt: 'desc' }
        });

        const fileLastRun = fs.existsSync(HistoryFile)
            ? fs.readFileSync(HistoryFile, 'utf8').trim()
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
                clusters: clusterNames.length
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

// Get and set log level (for development)
app.get('/log/level', (req, res) => {
    log.api('GET /log/level');
    res.json({ 
        currentLevel: logger.getLevel(),
        levelName: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][logger.getLevel()],
        availableLevels: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
    });
});

app.post('/log/level', (req, res) => {
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

// Health check endpoint
app.get('/health', (req, res) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log.info(`🚀 Student Rating System Backend started`);
    log.info(`📡 Server listening on PORT: ${PORT}`);
    log.info(`📊 Log level: ${['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][logger.getLevel()]}`);
    log.info(`⏰ Cron job scheduled to run every 45 minutes`);
    log.info(`🎯 Available endpoints:`);
    log.info(`   • GET  /health - Health check`);
    log.info(`   • GET  /ranking - Overall rankings`);
    log.info(`   • GET  /sync/status - Sync system status`);
    log.info(`   • POST /sync - Manual sync trigger`);
});