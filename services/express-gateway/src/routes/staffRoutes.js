import express from 'express';
import { 
  callNextStudent, 
  completeStudent, 
  skipStudent, 
  restoreStudent, 
  updateCounterStatus,
  getStageCounters,
  claimCounter,
  declaimCounter
} from '../controllers/staffController.js';
import { strictAuth } from '../lib/auth.js';

const router = express.Router();

// Require a valid VIP token (JWT) to access any staff route
router.use(strictAuth);

// Staff Counter Queue Actions
router.post('/counters/:counterId/next', callNextStudent);
router.post('/counters/:counterId/complete', completeStudent);
router.patch('/counters/:counterId/status', updateCounterStatus);

// Staff Ticket Actions
router.post('/tickets/:ticketId/skip', skipStudent);
router.post('/tickets/:ticketId/restore', restoreStudent);

// Staff Counter Claiming
router.get('/stages/:stageId/counters', getStageCounters);
router.post('/counters/:counterId/claim', claimCounter);
router.post('/counters/:counterId/declaim', declaimCounter);

export default router;
