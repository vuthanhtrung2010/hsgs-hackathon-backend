// Utility to parse cluster from quiz name
import { $Enums } from "../generated/prisma";
export const clusterNames: $Enums.Cluster[] = [
    $Enums.Cluster.MATH,
    $Enums.Cluster.VOCABULARY,
    $Enums.Cluster.READING,
    $Enums.Cluster.LISTENING
];

export function parseCluster(quizName: string): $Enums.Cluster | null {
    const m = quizName.match(/(?:\[ *)(READING|LISTENING)(?: *\])? *\[?([A-Z &]+) ?\d*\]?/i);
    if (!m || !m[2]) return null;
    const clusterText = m[2].trim().toUpperCase().replace(/\s+/g, '_');
    return clusterNames.find(c => c === clusterText) || null;
}
