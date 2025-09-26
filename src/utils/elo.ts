/**
 * Calculate expected score for ELO rating system
 * @param userRating - Current user rating
 * @param questionRating - Current question rating
 * @returns Expected score between 0 and 1
 */
export function expectedScore(
  userRating: number,
  questionRating: number,
): number {
  return 1 / (1 + Math.pow(10, (questionRating - userRating) / 400));
}

/**
 * Calculate K-factor for user based on number of problems solved in cluster
 * @param problemsSolved - Number of problems solved by user in this cluster
 * @returns K-factor for user rating update
 */
export function userKFactor(problemsSolved: number): number {
  return 80 * Math.exp(-problemsSolved / 20) + 30;
}

/**
 * Calculate K-factor for question based on number of submissions
 * @param submissionCount - Number of submissions for this question
 * @returns K-factor for question rating update
 */
export function questionKFactor(submissionCount: number): number {
  return 80 * Math.exp(-submissionCount / 30) + 15;
}

/**
 * Update ratings using ELO system
 * @param userRating - Current user rating
 * @param questionRating - Current question rating
 * @param userScore - User's score (0-1)
 * @param userProblemsCount - Number of problems user has solved in this cluster
 * @param questionSubmissions - Number of submissions for this question
 * @returns Object with new user and question ratings
 */
export function updateRatings(
  userRating: number,
  questionRating: number,
  userScore: number,
  userProblemsCount: number,
  questionSubmissions: number,
): { newUserRating: number; newQuestionRating: number; ratingChange: number } {
  const expected = expectedScore(userRating, questionRating);
  const userK = userKFactor(userProblemsCount);
  const questionK = questionKFactor(questionSubmissions);

  const ratingChange = userK * (userScore - expected);
  const newUserRating = userRating + ratingChange;
  const newQuestionRating = questionRating + questionK * (expected - userScore);

  return {
    newUserRating,
    newQuestionRating,
    ratingChange,
  };
}
