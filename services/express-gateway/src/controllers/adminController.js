import prisma from '../lib/prisma.js';
import { publishToQueue } from '../lib/rabbitmq.js';

export const createWorkflow = async (req, res) => {
  try {
    const { 
      name, 
      adminId, 
      openingTime, 
      closingTime, 
      isStandaloneQueue,
      safeTravelCutoffTime,
      registrationCutoffTime, 
      latitude, 
      longitude, 
      stages 
    } = req.body;

    if (!adminId) {
      return res.status(400).json({ error: 'adminId is required to create a workflow.' });
    }

    const newWorkflow = await prisma.workflow.create({
      data: {
        name,
        adminId,
        openingTime: new Date(openingTime),
        closingTime: new Date(closingTime),
        isStandaloneQueue: isStandaloneQueue || false,
        safeTravelCutoffTime: new Date(safeTravelCutoffTime),
        registrationCutoffTime: new Date(registrationCutoffTime),
        latitude,
        longitude,
        stages: {
          create: stages.map((stage) => ({
            name: stage.name,
            orderIndex: stage.orderIndex,
            requiredDocs: stage.requiredDocs || [],
            counters: {
              create: stage.counters.map((counter) => ({
                name: counter.name
              }))
            }
          }))
        }
      },
      include: {
        stages: {
          include: { counters: true }
        }
      }
    });

    res.status(201).json({
      message: 'Workflow successfully created! 🎉',
      workflow: newWorkflow
    });

  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: 'Failed to create workflow. Please check your data.' });
  }
};

export const releaseCounter = async (req, res) => {
  try {
    const { counterId } = req.params;

    const counter = await prisma.counter.findUnique({
      where: { id: counterId }
    });

    if (!counter) {
      return res.status(404).json({ error: 'Counter not found.' });
    }

    const updatedCounter = await prisma.counter.update({
      where: { id: counterId },
      data: { 
        staffId: null,
        status: 'PAUSED' // Force it closed since no one is there
      }
    });

    // Notify Go Engine via RabbitMQ so it stops routing students to this empty desk
    publishToQueue('buffer_staff_queue', {
      type: 'UPDATE_COUNTER_STATUS',
      counterId,
      status: 'PAUSED',
      timestamp: new Date().toISOString()
    });
    
    res.status(200).json({
      message: 'Counter successfully released (staff kicked out) and paused.',
      counter: updatedCounter
    });
  } catch (error) {
    console.error('Error releasing counter:', error);
    res.status(500).json({ error: 'Failed to release counter.' });
  }
};
