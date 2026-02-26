import request from 'supertest';
import express from 'express';

// Simple health check test
const createTestApp = () => {
  const app = express();
  
  app.get('/api/health', async (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        environment: 'test',
        database: 'connected'
      }
    });
  });
  
  return app;
};

describe('Health Check', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  it('should return healthy status', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('healthy');
    expect(response.body.data.version).toBe('2.0.0');
    expect(response.body.data.database).toBe('connected');
  });

  it('should include timestamp', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.data.timestamp).toBeDefined();
    expect(new Date(response.body.data.timestamp)).toBeInstanceOf(Date);
  });
});
