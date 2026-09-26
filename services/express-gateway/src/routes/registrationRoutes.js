import express from 'express';
import { registerUser, joinNextStage, updateArrivalStatus } from '../controllers/registrationController.js';

const router = express.Router();

// Define the POST route for users scanning the QR code (joining Phase 1/2)
router.post('/register', registerUser);

// Define the POST route for joining subsequent stages (Phase 3 FCFS)
router.post('/next-stage', joinNextStage);

// Define the POST route for students confirming they physically arrived (or left)
router.post('/tickets/:ticketId/arrive', updateArrivalStatus);

export default router;
