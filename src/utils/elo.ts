// ELO calculation utilities
export function expectedScore(Ru: number, Rq: number): number {
    return 1 / (1 + Math.pow(10, (Rq - Ru) / 400));
}

export function K_u(n: number): number {
    return 80 * Math.exp(-n / 20) + 30;
}

export function K_q(n: number): number {
    return 80 * Math.exp(-n / 30) + 15;
}
