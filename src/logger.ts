import chalk from 'chalk';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
}

class Logger {
    private currentLevel: LogLevel;

    constructor() {
        // Set log level from environment variable or default to INFO
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        this.currentLevel = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.currentLevel;
    }

    private formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') : '';
        
        return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
    }

    debug(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        console.log(chalk.gray(this.formatMessage('DEBUG', message, ...args)));
    }

    info(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.INFO)) return;
        console.log(chalk.blue(this.formatMessage('INFO', message, ...args)));
    }

    success(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.INFO)) return;
        console.log(chalk.green(this.formatMessage('SUCCESS', message, ...args)));
    }

    warn(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.WARN)) return;
        console.warn(chalk.yellow(this.formatMessage('WARN', message, ...args)));
    }

    error(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.ERROR)) return;
        console.error(chalk.red(this.formatMessage('ERROR', message, ...args)));
    }

    fatal(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.FATAL)) return;
        console.error(chalk.bgRed.white(this.formatMessage('FATAL', message, ...args)));
    }

    // Special methods for specific use cases
    sync(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.INFO)) return;
        console.log(chalk.cyan(this.formatMessage('SYNC', message, ...args)));
    }

    api(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        console.log(chalk.magenta(this.formatMessage('API', message, ...args)));
    }

    db(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        console.log(chalk.yellow(this.formatMessage('DB', message, ...args)));
    }

    canvas(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        console.log(chalk.blue(this.formatMessage('CANVAS', message, ...args)));
    }

    elo(message: string, ...args: any[]): void {
        if (!this.shouldLog(LogLevel.INFO)) return;
        console.log(chalk.green(this.formatMessage('ELO', message, ...args)));
    }

    // Utility methods
    setLevel(level: LogLevel): void {
        this.currentLevel = level;
        this.info(`Log level set to ${LogLevel[level]}`);
    }

    getLevel(): LogLevel {
        return this.currentLevel;
    }

    // Method to log with custom colors
    custom(color: keyof typeof chalk, level: string, message: string, ...args: any[]): void {
        const colorFn = chalk[color] as any;
        if (typeof colorFn === 'function') {
            console.log(colorFn(this.formatMessage(level, message, ...args)));
        } else {
            console.log(this.formatMessage(level, message, ...args));
        }
    }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const log = {
    debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
    info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
    success: (msg: string, ...args: any[]) => logger.success(msg, ...args),
    warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
    error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
    fatal: (msg: string, ...args: any[]) => logger.fatal(msg, ...args),
    sync: (msg: string, ...args: any[]) => logger.sync(msg, ...args),
    api: (msg: string, ...args: any[]) => logger.api(msg, ...args),
    db: (msg: string, ...args: any[]) => logger.db(msg, ...args),
    canvas: (msg: string, ...args: any[]) => logger.canvas(msg, ...args),
    elo: (msg: string, ...args: any[]) => logger.elo(msg, ...args),
};
