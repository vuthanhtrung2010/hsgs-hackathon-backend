/**
 * Parsed quiz information from title
 */
export interface ParsedQuiz {
  types: string[];     // Array of types/categories from the title
  lesson: string;      // Tên bài (Lesson name)
  difficulty: number;  // Độ khó (Difficulty)
  class: number;       // Lớp (Class/Grade)
}

/**
 * Parse quiz title with format: [<Loại>] <Tên bài> <<Độ khó>> (Lớp)
 * Can have multiple [<Loại>] parts for multiple types
 * Example: [Math] [Science] [Giải tích] Giải tích 1 <8.5> (12)
 *
 * @param quizName - The quiz title from Canvas
 * @returns Parsed quiz info if all components found, null otherwise
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
  
  const contentPattern = /^(.+?)\s*<(\d+(?:\.\d+)?)>\s*\((\d+)\)/i;
  const contentMatch = remainingText.match(contentPattern);

  if (!contentMatch || contentMatch.length < 4) {
    console.log(`Skipping quiz "${quizName}" - does not match required format for lesson, difficulty, and class`);
    return null;
  }

  const lesson = contentMatch[1]?.trim();
  const difficultyStr = contentMatch[2];
  const classStr = contentMatch[3];

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

  // Validate class is a number
  const classNum = parseInt(classStr, 10);
  if (isNaN(classNum)) {
    console.log(`Skipping quiz "${quizName}" - invalid class: ${classStr}`);
    return null;
  }

  return {
    types,
    lesson,
    difficulty,
    class: classNum
  };
}
