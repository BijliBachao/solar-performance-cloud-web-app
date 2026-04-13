import { NextResponse } from 'next/server'
import { z } from 'zod'

// ─── Consistent Error Response Format ─────────────────────────────────
//
// All API errors follow this structure:
// {
//   error: string        — human-readable message
//   code: string         — machine-readable code for client handling
//   details?: object[]   — field-level validation errors (optional)
// }

interface ErrorDetail {
  field: string
  message: string
}

export function validationError(error: z.ZodError) {
  const details: ErrorDetail[] = error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))

  return NextResponse.json(
    {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details,
    },
    { status: 400 }
  )
}

export function notFoundError(resource: string = 'Resource') {
  return NextResponse.json(
    { error: `${resource} not found`, code: 'NOT_FOUND' },
    { status: 404 }
  )
}

export function forbiddenError(message: string = 'Access denied') {
  return NextResponse.json(
    { error: message, code: 'FORBIDDEN' },
    { status: 403 }
  )
}

export function badRequestError(message: string) {
  return NextResponse.json(
    { error: message, code: 'BAD_REQUEST' },
    { status: 400 }
  )
}

export function conflictError(message: string) {
  return NextResponse.json(
    { error: message, code: 'CONFLICT' },
    { status: 409 }
  )
}

export function serverError(context: string, error: unknown) {
  console.error(`[${context}]`, error)
  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 }
  )
}
