import express from 'express';
import { createWorkflow } from '../controllers/adminController.js';

const router = express.Router();

// Define the POST route for creating a new workflow
router.post('/workflows', createWorkflow);

export default router;
