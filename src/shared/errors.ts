export class AppError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'AppError' }
}
export function messageOf(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message }
  return { code: 'UNEXPECTED', message: 'Something went wrong. Please try again.' }
}
