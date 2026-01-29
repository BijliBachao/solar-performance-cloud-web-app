import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'pretty',
    datasources: { db: { url: process.env.DATABASE_URL } },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}

export class DatabaseService {
  private static maxRetries = 3
  private static baseDelay = 1000

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string = 'Database operation'
  ): Promise<T> {
    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        if (this.isNonRetryableError(error)) throw error
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1)
          console.warn(
            `[${context}] Attempt ${attempt} failed, retrying in ${delay}ms...`
          )
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }
    throw lastError!
  }

  private static isNonRetryableError(error: any): boolean {
    return ['P2002', 'P2003', 'P2025'].includes(error?.code)
  }
}
