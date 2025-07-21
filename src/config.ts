/**
 * Configuration for courses to sync
 */
export const COURSES_CONFIG = [
  {
    id: "1136",
    name: "IELTS Practice Course" // Default name, will be updated from Canvas if available
  }
] as const;

export type CourseConfig = typeof COURSES_CONFIG[number];
