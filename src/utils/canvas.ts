import type { CanvasQuiz, CanvasSubmission } from '../types.js';
import { env } from '../env.js';

const CANVAS_API_BASE_URL = env.CANVAS_BASE_URL;
const CANVAS_API_KEY = env.CANVAS_ACCESS_TOKEN;

const headers = {
  'Authorization': `Bearer ${CANVAS_API_KEY}`,
  'Content-Type': 'application/json'
};

export interface CanvasEnrollment {
  id: number;
  user_id: number;
  course_id: number;
  type: string;
  role: string;
  role_id: number;
  created_at: string;
  updated_at: string;
  start_at: string | null;
  end_at: string | null;
  course_section_id: number;
  root_account_id: number;
  limit_privileges_to_course_section: boolean;
  enrollment_state: string;
  user: {
    id: number;
    name: string;
    short_name: string;
    sortable_name: string;
    avatar_url?: string;
    sis_user_id?: string;
    login_id?: string;
  };
}

export interface CanvasUser {
  id: number;
  name: string;
  created_at: string;
  sortable_name: string;
  short_name: string;
  sis_user_id: string | null;
  integration_id: string | null;
  login_id: string;
  email: string;
}

/**
 * Fetch all student enrollments for a course
 */
// export async function fetchCourseEnrollments(courseId: string): Promise<CanvasEnrollment[]> {
//   let page = 1;
//   let allEnrollments: CanvasEnrollment[] = [];

//   while (true) {
//     const url = new URL(`/api/v1/courses/${courseId}/enrollments`, CANVAS_API_BASE_URL);
//     url.searchParams.set('per_page', '100');
//     url.searchParams.set('page', page.toString());
//     url.searchParams.set('type[]', 'StudentEnrollment'); // Only fetch student enrollments
    
//     const response = await fetch(url.toString(), { headers });
    
//     if (!response.ok) {
//       throw new Error(`Failed to fetch course enrollments: ${response.statusText}`);
//     }

//     const enrollments = await response.json() as CanvasEnrollment[];
    
//     // Filter for only active student enrollments
//     const studentEnrollments = enrollments.filter(enrollment => 
//       enrollment.type === 'StudentEnrollment' && 
//       enrollment.role === 'StudentEnrollment' &&
//       enrollment.enrollment_state === 'active'
//     );
    
//     allEnrollments = allEnrollments.concat(studentEnrollments);

//     const linkHeader = response.headers.get('link');
//     if (!linkHeader || !linkHeader.includes('rel="next"')) break;
//     page++;
//   }

//   return allEnrollments;
// }

/**
 * Fetch all users from a specific course using /users endpoint
 */
export async function fetchAllUsersFromCourse(courseId: string): Promise<CanvasUser[]> {
  let page = 1;
  let allUsers: CanvasUser[] = [];

  while (true) {
    const url = new URL(`/api/v1/courses/${courseId}/users`, CANVAS_API_BASE_URL);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', page.toString());
    
    const response = await fetch(url.toString(), { headers });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch course users: ${response.statusText}`);
    }

    const users = await response.json() as CanvasUser[];
    allUsers = allUsers.concat(users);

    const linkHeader = response.headers.get('link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) break;
    page++;
  }

  return allUsers;
}

/**
 * Fetch all active courses for the current user
 */
export async function fetchAllCourses(): Promise<Array<{ id: string; name: string; course_code: string }>> {
  let page = 1;
  let allCourses: Array<{ id: string; name: string; course_code: string }> = [];

  while (true) {
    const url = new URL('/api/v1/courses', CANVAS_API_BASE_URL);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', page.toString());
    url.searchParams.set('enrollment_state', 'active');
    
    const response = await fetch(url.toString(), { headers });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch courses: ${response.statusText}`);
    }

    const courses = await response.json() as Array<{ id: number; name: string; course_code: string }>;
    // Convert id to string to match our database schema
    const formattedCourses = courses.map(course => ({
      id: course.id.toString(),
      name: course.name,
      course_code: course.course_code
    }));
    allCourses = allCourses.concat(formattedCourses);

    const linkHeader = response.headers.get('link');
    if (!linkHeader || !linkHeader.includes('rel="next"')) break;
    page++;
  }

  return allCourses;
}

/**
 * Fetch all quizzes for a course with pagination
 */
export async function fetchAllQuizzes(courseId: string): Promise<CanvasQuiz[]> {
  let page = 1;
  let allQuizzes: CanvasQuiz[] = [];

  while (true) {
    const url = new URL(`/api/v1/courses/${courseId}/quizzes`, CANVAS_API_BASE_URL);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', page.toString());
    
    const response = await fetch(url.toString(), { headers });
    
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
    const url = new URL(`/api/v1/courses/${courseId}/quizzes/${quizId}/submissions`, CANVAS_API_BASE_URL);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', page.toString());
    url.searchParams.set('updated_since', lastSync.toISOString());
    
    const response = await fetch(url.toString(), { headers });
    
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
  const url = new URL(`/api/v1/users/${userId}/profile`, CANVAS_API_BASE_URL);
  
  const response = await fetch(url.toString(), { headers });
  
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
  const url = new URL(`/api/v1/users/${userId}/avatars`, CANVAS_API_BASE_URL);
  
  try {
    const response = await fetch(url.toString(), { headers });
    
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
