export const CLUSTER_NAMES = [
  "ART", "BUSINESS", "COMMUNICATION", "CRIME", "ECONOMY", "EDUCATION",
  "ENVIRONMENT", "FAMILY AND CHILDREN", "FOOD", "HEALTH", "LANGUAGE",
  "MEDIA", "READING", "TECHNOLOGY", "TRANSPORT", "TRAVEL"
] as const;

export type ClusterType = typeof CLUSTER_NAMES[number];

export interface Clusters {
  [key: string]: number | null;
}

export interface Recommendations {
  quizId: string;
  quizName: string;
  cluster: ClusterType;
  rating: number;
  canvasUrl: string;
}

export interface Course {
  courseId: string;
  courseName: string;
  minRating: number;
  maxRating: number;
  ratingChanges: {
    date: string;
    rating: number;
  }[];
  recommendations?: Recommendations[];
  clusters: Clusters;
}

export interface IUserData {
  id: string; // studentId
  name: string;
  shortName: string;
  rating: number;
  avatarURL: string;
  courses?: Course[];
}

export interface IUsersListData {
  id: string; // studentId
  name: string;
  shortName: string;
  course: {
    courseId: string;
    courseName: string;
    rating: number;
  }[];
}

export interface CanvasQuiz {
  id: number;
  title: string;
  points_possible: number;
}

export interface CanvasSubmission {
  id: number;
  quiz_id: number;
  user_id: number;
  workflow_state: string;
  finished_at: string | null;
  score: number | null;
  quiz_points_possible: number | null;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Class {
  id: string;
  name: string;
  students: string[];
  createdAt: Date;
  updatedAt: Date;
}
