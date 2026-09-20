import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { publishToQueue } from '../lib/rabbitmq.js';

export const registerUser = async (req, res) => {
  try {
    const { workflowId, phoneNumber, age, travelTimeMins, requestTravelFactor } = req.body;
    
    // Default requestTravelFactor to true if not explicitly provided
    const wantsTravelFactor = requestTravelFactor !== undefined ? requestTravelFactor : true;

    // 1. Validate Workflow exists
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Queue not found.' });
    }

    const now = new Date();

    // 2. The Cutoff Check
    const cutoffTime = new Date(workflow.registrationCutoffTime);
    
    if (now > cutoffTime) {
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

    // 3. The Multi-Phase Buffer Check
    const timeUntilOpenMs = workflow.openingTime.getTime() - now.getTime();
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const TEN_MINS_MS = 10 * 60 * 1000;

    let algorithmPhase;
    if (timeUntilOpenMs > ONE_HOUR_MS) {
      algorithmPhase = 'PHASE_1';
    } else if (timeUntilOpenMs > TEN_MINS_MS) {
      algorithmPhase = 'PHASE_2';
    } else {
      algorithmPhase = 'FCFS';
    }

    // 4. Create the valid Ticket in Postgres (saving context for Go crash-recovery)
    const qrToken = crypto.randomBytes(16).toString('hex');
    const newTicket = await prisma.ticket.create({
      data: {
        workflowId,
        phoneNumber,
        age,
        travelTimeMins,
        algorithmPhase,
        requestTravelFactor: wantsTravelFactor,
        status: 'WAITING',
        qrToken
      }
    });

    // 5. The Hand-off: Send the payload to RabbitMQ for Ayana's Go Engine
    const rabbitPayload = {
      eventId: 'UserRegistrationEvent',
      user_id: newTicket.id,
      workflow_stage: workflow.id,
      name: phoneNumber,
      age,
      travel_time_minutes: travelTimeMins,
      algorithmPhase,
      convenience_score: wantsTravelFactor ? 1.0 : 0.0,
      registered_at: now.toISOString(),
      deadline_time: workflow.safeTravelCutoffTime.toISOString()
    };

    publishToQueue('buffer_registration_queue', rabbitPayload);

    // 6. Success Response
    res.status(201).json({
      message: 'Successfully registered! Waiting for Go Engine to calculate your slot.',
      ticket: newTicket,
      algorithmPhase
    });

  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to process registration.' });
  }
};

export const joinNextStage = async (req, res) => {
  try {
    const { ticketId } = req.body;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }


    // The currentStageId will be updated by the Go Engine when it processes the event
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { 
        status: 'WAITING',
        assignedCounterId: null,
        algorithmPhase: 'FCFS' // Lock them into pure FCFS for all subsequent stages!
      }
    });

    // 2. The Hand-off: Send the payload to RabbitMQ for Ayana's Go Engine
    const rabbitPayload = {
      eventId: 'JoinNextStageEvent',
      ticketId: updatedTicket.id,
      workflowId: updatedTicket.workflowId,
      timestamp: new Date().toISOString()
    };

    publishToQueue('buffer_registration_queue', rabbitPayload);

    res.status(200).json({
      message: 'Successfully joined the next stage queue. Wait for Go Engine to calculate your FCFS slot.',
      ticket: updatedTicket
    });

  } catch (error) {
    console.error('Error joining next stage:', error);
    res.status(500).json({ error: 'Failed to join next stage.' });
  }
};
