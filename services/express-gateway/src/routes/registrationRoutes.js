import express from 'express';
import { registerUser, joinNextStage } from '../controllers/registrationController.js';

const router = express.Router();

// Define the POST route for users scanning the QR code (joining Phase 1/2)
router.post('/register', registerUser);

// Define the POST route for joining subsequent stages (Phase 3 FCFS)
router.post('/next-stage', joinNextStage);

export default router;
