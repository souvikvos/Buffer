import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { publishToQueue } from '../lib/rabbitmq.js';
import { notifyStaff } from '../lib/websocket.js';

export const registerUser = async (req, res) => {
  try {
    const { workflowId, startingStageId, counterId, phoneNumber, age, travelTimeMins, requestTravelFactor } = req.body;

    // Default requestTravelFactor to true if not explicitly provided
    const wantsTravelFactor = requestTravelFactor !== undefined ? requestTravelFactor : true;

    // 1. Validate Workflow exists and get its first Stage
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!workflow || workflow.stages.length === 0) {
      return res.status(404).json({ error: 'Workflow not found or has no stages.' });
    }

    // If they provided a startingStageId, verify it belongs to this workflow. Otherwise default to the first stage.
    let targetStageId = workflow.stages[0].id;
    if (startingStageId) {
      const isValidStage = workflow.stages.some(s => s.id === startingStageId);
      if (!isValidStage) {
        return res.status(400).json({ error: 'Invalid startingStageId for this workflow.' });
      }
      targetStageId = startingStageId;
    }

    const now = new Date();

    // 2. The Cutoff Check
    const cutoffTime = new Date(workflow.registrationCutoffTime);

    if (now > cutoffTime) {
      await prisma.ticket.create({
        data: {
          workflowId,
          currentStageId: targetStageId,
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
        currentStageId: targetStageId,
        assignedCounterId: counterId || null, // Lock them in if they scanned a specific Queue QR
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
      workflow_id: workflow.id,
      target_stage_id: targetStageId,
      target_counter_id: counterId || null, // Go Engine skips Fairness algorithm if this is present
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

    if (ticket.status !== 'COMPLETED') {
      return res.status(403).json({ error: 'You must complete your current stage before joining the next one.' });
    }

    // 1. Find the current stage they are in
    const currentStage = await prisma.stage.findUnique({
      where: { id: ticket.currentStageId }
    });

    // Find the immediate next stage in the workflow
    const nextStage = await prisma.stage.findFirst({
      where: {
        workflowId: ticket.workflowId,
        orderIndex: { gt: currentStage.orderIndex }
      },
      orderBy: { orderIndex: 'asc' }
    });

    if (!nextStage) {
      return res.status(400).json({ error: 'No further stages in this workflow.' });
    }

    // Move them to the next stage in Postgres
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        currentStageId: nextStage.id,
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
      target_stage_id: nextStage.id, // Tell Go Engine exactly which stage they are joining
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

export const updateArrivalStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { hasArrived } = req.body; // Expect boolean: true (I am here) or false (I left)

    if (hasArrived === undefined) {
      return res.status(400).json({ error: 'Please provide hasArrived status.' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { hasArrived: Boolean(hasArrived) }
    });

    // If they just arrived, notify the staff!
    if (hasArrived && updatedTicket.assignedCounterId) {
      notifyStaff(
        updatedTicket.assignedCounterId,
        'STUDENT_ARRIVED',
        `Student ${updatedTicket.phoneNumber} has physically arrived!`,
        updatedTicket
      );
    }

    res.status(200).json({
      message: hasArrived ? 'Arrival confirmed! Please proceed to the waiting area.' : 'Status updated: You have left the waiting area.',
      ticket: updatedTicket
    });

  } catch (error) {
    console.error('Error updating arrival status:', error);
    res.status(500).json({ error: 'Failed to update arrival status.' });
  }
};
