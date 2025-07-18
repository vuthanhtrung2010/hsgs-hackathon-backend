
import fs from "fs";
import axios from "axios";
import { db } from "./db";
import { log } from "../logger";
import { $Enums } from "../generated/prisma";
import type { Quiz, CanvasQuizSubmission, CanvasUser, EloRatingUpdate, SyncStats, SyncResult } from "../types";
import { clusterNames, parseCluster } from "./parseCluster";
import { expectedScore, K_u, K_q } from "./elo";

const BASE_URL = process.env.CANVAS_API_URL;
const TOKEN = process.env.CANVAS_API_KEY;
const COURSE_ID = process.env.CANVAS_COURSE_ID;
const HistoryFile = "./cron_history.txt";
const headers = { Authorization: `Bearer ${TOKEN}` };

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
                id: String(canvasUserId),
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

async function getOrCreateQuiz(quizData: Quiz, cluster: $Enums.Cluster): Promise<any> {
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
    cluster: $Enums.Cluster, 
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

export async function Sync(forceFullSync: boolean = false): Promise<SyncResult> {
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
                            id: String(sub.id),
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
