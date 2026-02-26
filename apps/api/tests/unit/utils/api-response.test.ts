import { Request, Response } from 'express';
import {
  AppError,
  Errors,
  sendSuccess,
  sendError,
  sendPaginated,
  asyncHandler,
} from '../../../src/utils/api-response';

describe('API Response Utils', () => {
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
  });

  describe('AppError', () => {
    it('should create error with default status code', () => {
      const error = new AppError(400, 'BAD_REQUEST', 'Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('Invalid input');
    });

    it('should create error with details', () => {
      const details = { field: 'email', reason: 'required' };
      const error = new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('Errors', () => {
    it('should create badRequest error', () => {
      const error = Errors.badRequest('FIELD_REQUIRED', 'Email is required');
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('FIELD_REQUIRED');
    });

    it('should create unauthorized error', () => {
      const error = Errors.unauthorized('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid credentials');
    });

    it('should create forbidden error', () => {
      const error = Errors.forbidden('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
    });

    it('should create notFound error', () => {
      const error = Errors.notFound('User');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
    });

    it('should create conflict error', () => {
      const error = Errors.conflict('EMAIL_EXISTS', 'Email already exists');
      expect(error.statusCode).toBe(409);
    });

    it('should create internal error', () => {
      const error = Errors.internal('Database error');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('sendSuccess', () => {
    it('should send success response with default status', () => {
      const data = { id: '1', name: 'Test' };
      sendSuccess(mockRes as Response, data);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data,
      });
    });

    it('should send success response with custom status', () => {
      const data = { id: '1' };
      sendSuccess(mockRes as Response, data, 201);

      expect(statusMock).toHaveBeenCalledWith(201);
    });
  });

  describe('sendError', () => {
    it('should send AppError response', () => {
      const error = new AppError(400, 'BAD_REQUEST', 'Invalid input');
      sendError(mockRes as Response, error);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid input',
        },
      });
    });

    it('should send generic error response', () => {
      const error = new Error('Something went wrong');
      sendError(mockRes as Response, error);

      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe('sendPaginated', () => {
    it('should send paginated response', () => {
      const data = [{ id: '1' }, { id: '2' }];
      sendPaginated(mockRes as Response, data, 100, 2, 20);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data,
        meta: {
          page: 2,
          limit: 20,
          total: 100,
          totalPages: 5,
          hasNext: true,
          hasPrev: true,
        },
      });
    });
  });

  describe('asyncHandler', () => {
    it('should call next with error when async function throws', async () => {
      const mockReq = {} as Request;
      const mockNext = jest.fn();
      const error = new Error('Test error');

      const handler = asyncHandler(async () => {
        throw error;
      });

      await handler(mockReq, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
