/**
 * API Response Utilities
 * Standardized response formatting and error handling
 */

import { Response } from 'express';
import { ApiResponse, ApiError, ResponseMeta } from '../types';

/**
 * Application Error Class
 * Structured errors with HTTP status codes
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, any>;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, any>,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details })
    };
  }
}

/**
 * API Response Builder
 */
export class ApiResponseBuilder {
  static success<T>(data: T, meta?: ResponseMeta): ApiResponse<T> {
    return {
      success: true,
      data,
      ...(meta && { meta })
    };
  }

  static error(code: string, message: string, details?: Record<string, any>): ApiResponse {
    return {
      success: false,
      error: {
        code,
        message,
        ...(details && { details })
      }
    };
  }

  static paginated<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
  ): ApiResponse<T[]> {
    const totalPages = Math.ceil(total / limit);
    
    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }
}

/**
 * Common HTTP Error Factories
 */
export const Errors = {
  badRequest: (code: string, message: string, details?: Record<string, any>) =>
    new AppError(400, code, message, details),
  
  unauthorized: (message = 'Authentication required') =>
    new AppError(401, 'UNAUTHORIZED', message),
  
  tokenExpired: () =>
    new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please login again.'),
  
  forbidden: (message = 'Access denied') =>
    new AppError(403, 'FORBIDDEN', message),
  
  notFound: (resource = 'Resource') =>
    new AppError(404, 'NOT_FOUND', `${resource} not found`),
  
  conflict: (code: string, message: string) =>
    new AppError(409, code, message),
  
  validation: (errors: Record<string, string>) =>
    new AppError(400, 'VALIDATION_ERROR', 'Validation failed', { errors }),
  
  tooManyRequests: (message = 'Too many requests') =>
    new AppError(429, 'RATE_LIMITED', message),
  
  internal: (message = 'Internal server error') =>
    new AppError(500, 'INTERNAL_ERROR', 
      process.env.NODE_ENV === 'production' ? 'Internal server error' : message, 
      undefined, false)
};

/**
 * Send success response
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: ResponseMeta
): void => {
  res.status(statusCode).json(ApiResponseBuilder.success(data, meta));
};

/**
 * Send paginated response
 */
export const sendPaginated = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  statusCode = 200
): void => {
  res.status(statusCode).json(ApiResponseBuilder.paginated(data, total, page, limit));
};

/**
 * Send error response
 */
export const sendError = (
  res: Response,
  error: AppError | Error,
  statusCode?: number
): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json(ApiResponseBuilder.error(
      error.code,
      error.message,
      error.details
    ));
  } else {
    // Sanitize error message in production
    const sanitizedMessage = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : (error.message || 'Unknown error');
    res.status(statusCode || 500).json(ApiResponseBuilder.error(
      'INTERNAL_ERROR',
      sanitizedMessage
    ));
  }
};

/**
 * Async handler wrapper
 * Automatically catches errors in async route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
