import express from 'express';
import cors from 'cors';
import adminRoutes from './routes/adminRoutes.js';
import registrationRoutes from './routes/registrationRoutes.js';
import staffRoutes from './routes/staffRoutes.js';
import { authMiddleware } from './lib/auth.js';

const app = express();

// Middleware: Enable CORS (Allows frontend mobile app & website to talk to Express)
app.use(cors());

// Middleware: Parse incoming JSON payloads sent by the frontend
app.use(express.json());

// Middleware: Clerk Auth - reads tokens to attach req.auth
app.use(authMiddleware);

// Mount the Admin Routes
app.use('/api/admin', adminRoutes);

// Mount the Staff Routes
app.use('/api/staff', staffRoutes);

// Mount the Public Registration Routes
app.use('/api', registrationRoutes);

// Health Check Endpoint (To verify Express is running)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Buffer Express API Gateway is running smoothly! 🚀',
    timestamp: new Date().toISOString()
  });
});

// Root Endpoint Welcome Message
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Buffer API Gateway',
    version: '1.0.0',
    description: 'Intelligent Workflow Orchestrator API'
  });
});

export default app;
