import { $Enums } from "./generated/prisma";

// Canvas API Types
export interface Quiz {
    id: number;
    title: string;
    points_possible: number;
    quiz_type: string;
    published: boolean;
    question_count: number;
    html_url: string;
}

export interface CanvasQuizSubmission {
    id: number;
    quiz_id: number;
    user_id: number;
    submission_id: number;
    score: number | null;
    kept_score: number | null;
    quiz_points_possible: number | null;
    started_at: string | null;
    finished_at: string | null;
    end_at: string | null;
    attempt: number;
    workflow_state: string;
    fudge_points: number | null;
    quiz_version: number;
    validation_token: string;
    score_before_regrade: number | null;
    has_seen_results: boolean;
    time_spent: number | null;
    attempts_left: number;
    overdue_and_needs_submission: boolean;
    excused: boolean;
    html_url: string;
    result_url: string;
    submitted_at: string | null;
}

export interface CanvasUser {
    id: number;
    name: string;
    short_name: string;
    sortable_name: string;
    avatar_url: string;
    title: string | null;
    bio: string | null;
    primary_email: string;
    login_id: string;
    sis_user_id: string | null;
    lti_user_id: string | null;
    time_zone: string;
    locale: string | null;
}

// Application Types
export type Cluster = $Enums.Cluster;

export interface UserQuizRecord {
    quiz_id: number;
    quizName: string;
    topic: Cluster;
    score: number;
    maxScore: number;
    updatedAt: Date;
}

export interface UserRatingData {
    studentId: string;
    name: string;
    shortName: string;
    Ru: number;
    quizzes: UserQuizRecord[];
}

export interface QuestionRatingData {
    quiz_id: number;
    quizName: string;
    Rq: number;
    count: number;
}

export interface RankingEntry {
    studentId: string;
    name: string;
    shortName: string;
    averageRu: number;
    clusters: Record<Cluster, number | null>;
}

// ELO Rating System Types
export interface EloRatingUpdate {
    userId: string;
    quizId: number;
    cluster: Cluster;
    oldUserRating: number;
    newUserRating: number;
    oldQuizRating: number;
    newQuizRating: number;
    score: number;
    maxScore: number;
    expectedScore: number;
    actualScore: number;
    kFactor: number;
}

// API Response Types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        perPage: number;
        totalPages: number;
        totalItems: number;
        hasNext: boolean;
        hasPrevious: boolean;
    };
}

// Request Types
export interface RankingQuery {
    cluster?: Cluster;
    limit?: number;
    offset?: number;
    search?: string;
}

export interface UserStatsQuery {
    studentId: string;
    cluster?: Cluster;
    includeHistory?: boolean;
}

// Sync Types
export interface SyncStats {
    processedQuizzes: number;
    processedSubmissions: number;
    newUsers: number;
    updatedRatings: number;
    skippedSubmissions: number;
}

export interface SyncResult {
    success: boolean;
    message: string;
    stats?: SyncStats;
}

export interface SyncStatus {
    lastCronRun: Date | null;
    lastFileRun: string | null;
    nextScheduledRun: string;
    stats: {
        totalUsers: number;
        totalSubmissions: number;
        totalQuizzes: number;
        clusters: number;
    };
    status: string;
}