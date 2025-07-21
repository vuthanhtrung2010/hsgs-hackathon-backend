import type { CanvasQuiz, CanvasSubmission } from '../types.js';

const CANVAS_API_BASE_URL = process.env.CANVAS_API_BASE_URL!;
const CANVAS_API_KEY = process.env.CANVAS_API_KEY!;

const headers = {
  'Authorization': `Bearer ${CANVAS_API_KEY}`,
  'Content-Type': 'application/json'
};

/**
 * Fetch all quizzes for a course with pagination
 */
export async function fetchAllQuizzes(courseId: string): Promise<CanvasQuiz[]> {
  let page = 1;
  let allQuizzes: CanvasQuiz[] = [];

  while (true) {
    const url = `${CANVAS_API_BASE_URL}/api/v1/courses/${courseId}/quizzes?per_page=100&page=${page}`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch quizzes: ${response.statusText}`);
    }

    const quizzes = await response.json() as CanvasQuiz[];
    allQuizzes = allQuizzes.concat(quizzes);

    const linkHeader = response.headers.get('link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) break;
    page++;
  }

  return allQuizzes;
}

/**
 * Fetch all updated submissions for a quiz since last sync
 */
export async function fetchAllUpdatedSubmissions(
  courseId: string,
  quizId: string,
  lastSync: Date
): Promise<CanvasSubmission[]> {
  let page = 1;
  let allSubmissions: CanvasSubmission[] = [];

  while (true) {
    const url = `${CANVAS_API_BASE_URL}/api/v1/courses/${courseId}/quizzes/${quizId}/submissions?per_page=100&page=${page}&updated_since=${encodeURIComponent(lastSync.toISOString())}`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch submissions: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const submissions = data.quiz_submissions || [];
    allSubmissions = allSubmissions.concat(submissions);

    const linkHeader = response.headers.get('link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) break;
    page++;
  }

  return allSubmissions;
}

/**
 * Get user profile from Canvas
 */
export async function fetchUserProfile(userId: string): Promise<{ name: string; short_name: string }> {
  const url = `${CANVAS_API_BASE_URL}/api/v1/users/${userId}/profile`;
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    console.warn(`Failed to fetch user profile for ${userId}: ${response.statusText}`);
    return { name: "", short_name: "" };
  }

  const profile = await response.json() as any;
  return {
    name: profile.name || "",
    short_name: profile.short_name || ""
  };
}

/**
 * Get user avatar URL from Canvas
 */
export async function fetchUserAvatar(userId: string): Promise<string> {
  const url = `${CANVAS_API_BASE_URL}/api/v1/users/${userId}/avatars`;
  
  try {
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch avatar: ${response.statusText}`);
    }

    const avatarData = await response.json() as any;
    return avatarData[0]?.url || "";
  } catch (error) {
    console.warn(`Failed to fetch avatar for user ${userId}:`, error);
    return "";
  }
}
