import { z } from 'zod';

const envSchema = z.object({
  // Database Configuration
  DATABASE_URL: z
    .string()
    .refine(
      (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
      {
        message: 'DATABASE_URL must start with postgres:// or postgresql://',
      }
    ),

  // Canvas LMS API Configuration
  CANVAS_BASE_URL: z
    .url({ message: 'CANVAS_BASE_URL must be a valid URL' })
    .refine(
      (url) => !url.endsWith('/'),
      {
        message: 'CANVAS_BASE_URL should not end with a trailing slash',
      }
    ),

  CANVAS_ACCESS_TOKEN: z
    .string()
    .min(1, 'CANVAS_ACCESS_TOKEN is required'),

  // Application Configuration
  PORT: z
    .union([z.string(), z.number()])
    .transform((val) => typeof val === 'string' ? parseInt(val, 10) : val)
    .pipe(z.number().int().positive())
    .default(3001),

  SYNC_PASSWORD: z
    .string()
    .min(8, 'SYNC_PASSWORD must be at least 8 characters long'),

  // Cron Configuration
  CRON_INTERVAL: z
    .string()
    .regex(
      /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|[0-6]|\*\/[0-6])$/,
      {
        message: 'CRON_INTERVAL must be a valid cron expression',
      }
    )
    .default('*/45 * * * *'),

  // Node Environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.issues.forEach((issue) => {
        console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
      });
      console.error('\nPlease check your .env file and fix the above issues.');
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();
export type Env = typeof env;
