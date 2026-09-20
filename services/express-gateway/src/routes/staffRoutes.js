import express from 'express';
import { 
  callNextStudent, 
  completeStudent, 
  skipStudent, 
  restoreStudent, 
  updateCounterStatus, 
  reallocateUser 
} from '../controllers/staffController.js';

const router = express.Router();

// Staff Counter Queue Actions
router.post('/counters/:counterId/next', callNextStudent);
router.post('/counters/:counterId/complete', completeStudent);
router.patch('/counters/:counterId/status', updateCounterStatus);

// Staff Ticket Actions
router.post('/tickets/:ticketId/skip', skipStudent);
router.post('/tickets/:ticketId/restore', restoreStudent);
router.post('/tickets/:ticketId/reallocate', reallocateUser);

export default router;
