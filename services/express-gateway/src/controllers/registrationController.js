import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { publishToQueue } from '../lib/rabbitmq.js';

export const registerUser = async (req, res) => {
  try {
    const { workflowId, phoneNumber, age, travelTimeMins } = req.body;

    // 1. Validate Workflow exists
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Queue not found.' });
    }

    const now = new Date();

    // 2. The Cutoff Check
    // Calculate the absolute cutoff time (e.g. 17:00 minus 120 mins = 15:00)
    const cutoffTime = new Date(workflow.closingTime.getTime() - (workflow.cutoffMins * 60000));
    
    if (now > cutoffTime) {
      // Too late! Mark as UNSCHEDULED
      await prisma.ticket.create({
        data: {
          workflowId,
          phoneNumber,
          status: 'UNSCHEDULED',
          qrToken: crypto.randomBytes(16).toString('hex')
        }
      });
      return res.status(403).json({ error: 'Registration is closed for today. Cutoff time has passed.' });
    }

    // 3. The Buffer Check (Did they register during the rush hour?)
    const bufferEndTime = new Date(workflow.openingTime.getTime() + (workflow.bufferMins * 60000));
    const isBuffer = now <= bufferEndTime;

    // 4. Create the valid Ticket in Postgres
    const qrToken = crypto.randomBytes(16).toString('hex');
    const newTicket = await prisma.ticket.create({
      data: {
        workflowId,
        phoneNumber,
        status: 'WAITING',
        qrToken
      }
    });

    // 5. The Hand-off: Send the payload to RabbitMQ for Ayana's Go Engine
    const rabbitPayload = {
      eventId: 'UserRegistrationEvent',
      ticketId: newTicket.id,
      workflowId: workflow.id,
      phoneNumber,
      age,
      travelTimeMins,
      isBuffer, // Tell Go if they need a Fairness Score!
      registeredAt: now.toISOString()
    };

    publishToQueue('buffer_registration_queue', rabbitPayload);

    // 6. Success Response
    res.status(201).json({
      message: 'Successfully registered! Waiting for Go Engine to calculate your slot.',
      ticket: newTicket,
      isBuffer
    });

  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to process registration.' });
  }
};
