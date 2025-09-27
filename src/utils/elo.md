# Enhanced Dual ELO Rating System Documentation

## Overview

This improved ELO rating system is designed specifically for educational platforms to provide more accurate skill assessment for both students (users) and questions. The system balances several key factors:

- **User accuracy** (score/total score ratio)
- **Expected performance** (based on current ratings)
- **Experience level** (problems solved)
- **Question difficulty calibration** (based on submission count)
- **Rating stability** (higher-rated users and questions have more stable ratings)

## Core Components

### 1. Expected Score Calculation

```typescript
export function expectedScore(userRating: number, questionRating: number): number {
  return 1 / (1 + Math.pow(10, (questionRating - userRating) / 350));
}
```

- Uses a steeper curve (350 divisor vs. standard 400) to better differentiate skill levels in educational context
- Returns a probability between 0-1 representing expected performance

### 2. Dynamic K-Factors

#### User K-Factor

```typescript
export function userKFactor(problemsSolved: number, userRating: number = 1500): number {
  const experienceFactor = 100 * Math.exp(-problemsSolved / 25) + 20;
  const ratingStabilityFactor = Math.max(0.5, Math.min(1.5, (1800 - userRating) / 300));
  return experienceFactor * ratingStabilityFactor;
}
```

- **Experience Factor**: Decreases exponentially as users solve more problems (100→20)
- **Rating Stability Factor**: Higher-rated users (>1500) get smaller rating changes
- Combined effect: New users with few problems solved will see larger rating changes

#### Question K-Factor

```typescript
export function questionKFactor(submissionCount: number, questionRating: number = 1500): number {
  const submissionFactor = 60 * Math.exp(-submissionCount / 40) + 10;
  const ratingStabilityFactor = Math.max(0.5, Math.min(1.0, (800 - Math.abs(questionRating - 1500)) / 800));
  return submissionFactor * ratingStabilityFactor;
}
```

- **Submission Factor**: Decreases as more users attempt the question (60→10)
- **Rating Stability Factor**: Questions with extreme ratings (very easy/hard) have more stable ratings
- Combined effect: Question ratings stabilize over time and at rating extremes

### 3. Non-Linear Score Transformation

```typescript
const transformedScore = userScore <= 0.5 
  ? userScore * 0.5 
  : 0.5 + Math.pow(2 * (userScore - 0.5), 1.5) * 0.5;
```

- Maps raw scores (0-1) to transformed scores with emphasis on high performance
- Makes differences at high performance levels (0.8 vs 0.9) more significant than at low levels
- Encourages excellence and properly rewards mastery

### 4. Surprise Factor

```typescript
const surpriseFactor = 1 + Math.min(0.5, Math.abs(performanceDiff));
```

- Increases rating impact when actual performance differs significantly from expected
- Helps system adapt more quickly to unexpected results
- Maximum 50% additional impact for very surprising results

### 5. Rating Floors

```typescript
const newUserRating = Math.max(1000, userRating + ratingChange);
const newQuestionRating = Math.max(1000, questionRating + questionK * (expected - transformedScore));
```

- Prevents ratings from dropping below 1000
- Ensures stability in the rating ecosystem
- Avoids extreme deflation

## Advantages of This System

1. **More accurate difficulty assessment**: Questions quickly find their true difficulty level
2. **Personalized progression**: New users' ratings adapt quickly while experienced users have stable ratings
3. **Performance-focused**: The non-linear score transformation rewards excellence
4. **Surprise handling**: Unexpected performances have stronger impacts
5. **Stability**: Rating floors and stability factors prevent wild fluctuations

## Use Cases

- **New user calibration**: System quickly calibrates new users through larger K-factors
- **Question difficulty calibration**: Questions rapidly converge to their true difficulty
- **Progress tracking**: Users see meaningful rating changes reflecting their skill development
- **Educational assessment**: Better identifies true student capabilities and question difficulties