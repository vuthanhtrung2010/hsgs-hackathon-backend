/**
 * Calculate expected score for ELO rating system
 * Modified to account for expected performance based on rating difference
 * @param userRating - Current user rating
 * @param questionRating - Current question rating
 * @returns Expected score between 0 and 1
 */
export function expectedScore(
  userRating: number,
  questionRating: number,
): number {
  // Standard ELO formula but with a steeper curve for educational context
  return 1 / (1 + Math.pow(10, (questionRating - userRating) / 350));
}

/**
 * Calculate K-factor for user based on number of problems solved in cluster and user rating
 * Higher rated users have smaller K-factor (less volatile ratings)
 * Newer users have higher K-factor (faster adaptation)
 * 
 * @param problemsSolved - Number of problems solved by user in this cluster
 * @param userRating - Current user rating
 * @returns K-factor for user rating update
 */
export function userKFactor(problemsSolved: number, userRating: number = 1500): number {
  // Base K-factor that decreases with experience
  const experienceFactor = 100 * Math.exp(-problemsSolved / 25) + 20;
  
  // Rating stability factor - higher rated users have more stable ratings
  const ratingStabilityFactor = Math.max(0.5, Math.min(1.5, (1800 - userRating) / 300));
  
  return experienceFactor * ratingStabilityFactor;
}

/**
 * Calculate K-factor for question based on number of submissions and question rating
 * Less attempted questions have higher K-factor (faster adaptation)
 * Questions with extreme ratings (too high/low) have smaller K-factors
 * 
 * @param submissionCount - Number of submissions for this question
 * @param questionRating - Current question rating
 * @returns K-factor for question rating update
 */
export function questionKFactor(submissionCount: number, questionRating: number = 1500): number {
  // Base K-factor that decreases with more submissions
  const submissionFactor = 60 * Math.exp(-submissionCount / 40) + 10;
  
  // Rating stability factor - questions with extreme ratings have more stable ratings
  const ratingDeviation = Math.abs(questionRating - 1500);
  const ratingStabilityFactor = Math.max(0.5, Math.min(1.0, (800 - ratingDeviation) / 800));
  
  return submissionFactor * ratingStabilityFactor;
}

/**
 * Update ratings using an improved dual ELO system
 * 
 * This function implements a more sophisticated ELO system that:
 * 1. Takes into account the user's accuracy (score/total score) more accurately
 * 2. Adjusts the impact based on the difference between expected and actual accuracy
 * 3. Uses non-linear accuracy mapping for more meaningful rating changes
 * 4. Implements rating floors to prevent extreme deflation
 * 
 * @param userRating - Current user rating
 * @param questionRating - Current question rating
 * @param userAccuracy - User's accuracy as score/total score (0-1)
 * @param userProblemsCount - Number of problems user has solved in this cluster
 * @param questionSubmissions - Number of submissions for this question
 * @returns Object with new user and question ratings
 */
/**
 * Update ratings using an improved dual ELO system based on user's accuracy
 * 
 * @param userRating - Current user rating
 * @param questionRating - Current question rating
 * @param userAccuracy - User's accuracy (score/total possible score, between 0-1)
 * @param userProblemsCount - Number of problems user has solved in this cluster
 * @param questionSubmissions - Number of submissions for this question
 * @returns Object with new user and question ratings and the rating change
 */
export function updateRatings(
  userRating: number,
  questionRating: number,
  userAccuracy: number,
  userProblemsCount: number,
  questionSubmissions: number,
): { newUserRating: number; newQuestionRating: number; ratingChange: number } {
  // Validate accuracy input - ensure it's between 0-1
  userAccuracy = Math.max(0, Math.min(1, userAccuracy));
  // Calculate expected performance based on ratings
  const expected = expectedScore(userRating, questionRating);
  
  // Non-linear accuracy mapping to emphasize differences in high accuracy
  // This makes the difference between 0.8 and 0.9 more significant than 0.1 and 0.2
  // Ensure 0% accuracy results in negative rating change
  const transformedAccuracy = userAccuracy === 0 
    ? 0 // Zero accuracy should be treated as zero (guaranteed negative rating change)
    : userAccuracy <= 0.5 
      ? userAccuracy * 0.5 
      : 0.5 + Math.pow(2 * (userAccuracy - 0.5), 1.5) * 0.5;
  
  // Calculate performance difference with emphasis on extreme performances
  const performanceDiff = transformedAccuracy - expected;
  
  // Increase rating change impact for unexpected results (surprises)
  const surpriseFactor = 1 + Math.min(0.5, Math.abs(performanceDiff));
  
  // Calculate K-factors with rating-awareness
  const userK = userKFactor(userProblemsCount, userRating) * surpriseFactor;
  const questionK = questionKFactor(questionSubmissions, questionRating);
  
  // Calculate rating changes
  const ratingChange = Math.round(userK * performanceDiff);
  
  // For 0% accuracy, ensure rating decreases
  const finalRatingChange = userAccuracy === 0 
    ? Math.min(ratingChange, -10) // Force negative change of at least -10 for 0% accuracy
    : ratingChange;
  
  // Apply changes with rating floors to prevent extreme deflation
  const newUserRating = Math.max(1000, userRating + finalRatingChange);
  const newQuestionRating = Math.max(1000, questionRating + Math.round(questionK * (expected - transformedAccuracy)));

  return {
    newUserRating,
    newQuestionRating,
    ratingChange,
  };
}
