import { Router, Request, Response } from 'express';
import { CopilotService, CopilotAction } from '../services/copilot.js';

export const copilotRouter = Router();

/**
 * POST /api/copilot/message - Send prompt to Master Studio Copilot
 */
copilotRouter.post('/message', async (req: Request, res: Response) => {
  try {
    const { message, history, autoExecute } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Field "message" string is required' });
    }

    const copilotResult = await CopilotService.processMessage(message, history || []);

    // Check if autoExecute requested or if prompt explicitly demanded immediate execution
    const immediateKeywords = /\b(immediately|right now|execute now|do it now|apply now|schedule now)\b/i;
    const shouldExecute = Boolean(autoExecute || (copilotResult.actions.length > 0 && immediateKeywords.test(message)));

    if (shouldExecute && copilotResult.actions.length > 0) {
      const execResult = await CopilotService.executeActions(copilotResult.actions);
      return res.json({
        success: true,
        data: {
          ...copilotResult,
          executed: true,
          executionMessage: execResult.message
        }
      });
    }

    return res.json({
      success: true,
      data: {
        ...copilotResult,
        executed: false
      }
    });
  } catch (err: any) {
    console.error('Error in Copilot message handler:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Copilot failed to process command'
    });
  }
});

/**
 * POST /api/copilot/execute - Execute confirmed actions from Copilot proposal
 */
copilotRouter.post('/execute', async (req: Request, res: Response) => {
  try {
    const { actions } = req.body;
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: 'Array of "actions" is required' });
    }

    const result = await CopilotService.executeActions(actions as CopilotAction[]);
    return res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    console.error('Error executing Copilot actions:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute proposed actions'
    });
  }
});
