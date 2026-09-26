import express from 'express';
import { createWorkflow, releaseCounter } from '../controllers/adminController.js';
import { strictAuth } from '../lib/auth.js';

const router = express.Router();

// Require a valid VIP token (JWT) to access any admin route
router.use(strictAuth);

// Define the POST route for creating a new workflow
router.post('/workflows', createWorkflow);

// Admin Force-Release Counter (Kick stuck staff)
router.post('/counters/:counterId/release', releaseCounter);

export default router;
