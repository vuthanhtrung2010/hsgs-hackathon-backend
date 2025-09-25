/**
 * Parsed quiz information from title
 */
export interface ParsedQuiz {
  types: string[];     // Array of types/categories from the title
  lesson: string;      // Tên bài (Lesson name)
  difficulty: number;  // Độ khó (Difficulty)
  class: number | null; // Lớp (Class/Grade) - Optional
}

/**
 * Parse quiz title with format: [<Loại>] <Tên bài> <<Độ khó>> (Lớp)
 * Can have multiple [<Loại>] parts for multiple types
 * Both difficulty and class are now optional
 * Example: [Math] [Science] [Giải tích] Giải tích 1 <8.5> (12)
 * Example: [Math] Giải tích 1 (no difficulty or class required)
 *
 * @param quizName - The quiz title from Canvas
 * @returns Parsed quiz info if types are found, null otherwise
 */
export function parseQuiz(quizName: string): ParsedQuiz | null {
  // Extract all types from the brackets first
  const typesMatch = quizName.match(/\[([^\]]+)\]/g);
  if (!typesMatch || typesMatch.length === 0) {
    console.log(`Skipping quiz "${quizName}" - no types found in brackets`);
    return null;
  }

  const types = typesMatch.map(type => type.slice(1, -1).trim()); // Remove brackets and trim

  // Match the rest of the pattern: lesson name <<difficulty>> (class)
  // Find the position after all consecutive bracketed types
  const bracketPattern = /\[([^\]]+)\]\s*/g;
  let match;
  let lastBracketEnd = 0;
  while ((match = bracketPattern.exec(quizName)) !== null) {
    lastBracketEnd = match.index + match[0].length;
  }
  
  const remainingText = quizName.slice(lastBracketEnd).trim();
  
  // Try to match with full pattern first (lesson <difficulty> (class))
  const fullPattern = /^(.+?)\s*<(-?\d+(?:\.\d+)?)>\s*\((\d+)\)$/i;
  const fullMatch = remainingText.match(fullPattern);

  if (fullMatch) {
    const lesson = fullMatch[1]?.trim();
    const difficultyStr = fullMatch[2];
    const classStr = fullMatch[3];

    if (!lesson || !difficultyStr || !classStr) {
      console.log(`Skipping quiz "${quizName}" - missing required components`);
      return null;
    }

    // Validate difficulty is a number
    const difficulty = parseFloat(difficultyStr);
    if (isNaN(difficulty)) {
      console.log(`Skipping quiz "${quizName}" - invalid difficulty: ${difficultyStr}`);
      return null;
    }

    // Generate random difficulty if < 1
    const finalDifficulty = difficulty < 1 ? Math.random() * 100 + 1 : difficulty;

    // Validate class is a number
    const classNum = parseInt(classStr, 10);
    if (isNaN(classNum)) {
      console.log(`Skipping quiz "${quizName}" - invalid class: ${classStr}`);
      return null;
    }

    return {
      types,
      lesson,
      difficulty: finalDifficulty,
      class: classNum
    };
  }

  // Try to match with difficulty only pattern (lesson <difficulty>)
  const difficultyOnlyPattern = /^(.+?)\s*<(-?\d+(?:\.\d+)?)>$/i;
  const difficultyOnlyMatch = remainingText.match(difficultyOnlyPattern);

  if (difficultyOnlyMatch) {
    const lesson = difficultyOnlyMatch[1]?.trim();
    const difficultyStr = difficultyOnlyMatch[2];

    if (!lesson || !difficultyStr) {
      console.log(`Skipping quiz "${quizName}" - missing required components`);
      return null;
    }

    // Validate difficulty is a number
    const difficulty = parseFloat(difficultyStr);
    if (isNaN(difficulty)) {
      console.log(`Skipping quiz "${quizName}" - invalid difficulty: ${difficultyStr}`);
      return null;
    }

    // Generate random difficulty if < 1
    const finalDifficulty = difficulty < 1 ? Math.random() * 100 + 1 : difficulty;

    return {
      types,
      lesson,
      difficulty: finalDifficulty,
      class: null // No class provided
    };
  }

  // Try to match with class only pattern (lesson (class))
  const classOnlyPattern = /^(.+?)\s*\((\d+)\)$/i;
  const classOnlyMatch = remainingText.match(classOnlyPattern);

  if (classOnlyMatch) {
    const lesson = classOnlyMatch[1]?.trim();
    const classStr = classOnlyMatch[2];

    if (!lesson || !classStr) {
      console.log(`Skipping quiz "${quizName}" - missing required components`);
      return null;
    }

    // Validate class is a number
    const classNum = parseInt(classStr, 10);
    if (isNaN(classNum)) {
      console.log(`Skipping quiz "${quizName}" - invalid class: ${classStr}`);
      return null;
    }

    // Generate random difficulty since none provided
    const randomDifficulty = Math.random() * 100 + 1;

    return {
      types,
      lesson,
      difficulty: randomDifficulty,
      class: classNum
    };
  }

  // No pattern matches, just use lesson name and generate random difficulty
  if (remainingText.trim()) {
    // Generate random difficulty since none provided
    const randomDifficulty = Math.random() * 100 + 1;

    return {
      types,
      lesson: remainingText.trim(),
      difficulty: randomDifficulty,
      class: null // No class provided
    };
  }

  console.log(`Skipping quiz "${quizName}" - no lesson name found`);
  return null;
}
