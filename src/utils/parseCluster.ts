import { CLUSTER_NAMES, type ClusterType } from '../types.js';

/**
 * Parse cluster name from quiz title
 * @param quizName - The quiz title from Canvas
 * @returns Cluster name if found, null otherwise
 */
export function parseCluster(quizName: string): ClusterType | null {
  // Match pattern like [READING][ART 1] or [LISTENING] [BUSINESS 2] etc.
  const match = quizName.match(/(?:\[\s*(?:READING|LISTENING)\s*\])?\s*\[?\s*([A-Z &]+)\s*\d*\]?/i);
  
  if (!match || !match[1]) return null;
  
  const extractedCluster = match[1].trim().toUpperCase();
  
  // Find matching cluster name
  return CLUSTER_NAMES.find(cluster => 
    cluster.toUpperCase() === extractedCluster
  ) as ClusterType || null;
}
