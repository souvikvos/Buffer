import express from 'express';
import { registerUser } from '../controllers/registrationController.js';

const router = express.Router();

// Define the POST route for users scanning the QR code
router.post('/register', registerUser);

export default router;
