/**
 * Fact-Check Routes
 *
 * Historical accuracy validation, fact-check service, unknown facts discovery.
 */

import { Router } from 'express';


const router = Router();




  // ============================================================================
  // UNKNOWN FACTS DISCOVERY - Viral Hook Generator
  // Finds the "One Thing Nobody Knows" about historical figures
  // ============================================================================

  // Discover unknown facts for a topic (viral hooks)
  router.get('/unknown-facts/:topic', async (req, res) => {
    try {
      const { factReconciliationService } = await import('../services/fact-reconciliation-service');
      const topic = decodeURIComponent(req.params.topic);
      const result = await factReconciliationService.discoverUnknownFacts(topic);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Unknown facts error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // FACT-CHECK SERVICE ENDPOINTS
  // ============================================================================

  // Fact-check lyrics for a historical figure
  router.post('/fact-check/lyrics', async (req, res) => {
    try {
      const { factCheckLyrics } = await import('../services/fact-check-service');
      const { figureName, lyrics, era, keyFacts } = req.body;
      if (!figureName || !lyrics) {
        return res.status(400).json({ success: false, error: 'figureName and lyrics required' });
      }
      const result = await factCheckLyrics(figureName, lyrics, era, keyFacts);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Fact-check lyrics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Fact-check story bible content
  router.post('/fact-check/story', async (req, res) => {
    try {
      const { factCheckStoryBible } = await import('../services/fact-check-service');
      const { figureName, protagonist, antagonist, keyEvents } = req.body;
      if (!figureName || !protagonist) {
        return res.status(400).json({ success: false, error: 'figureName and protagonist required' });
      }
      const result = await factCheckStoryBible(figureName, protagonist, antagonist, keyEvents);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Fact-check story error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Validate content matches requested person (catches name confusion)
  router.post('/fact-check/validate-person', async (req, res) => {
    try {
      const { validatePersonMatch } = await import('../services/fact-check-service');
      const { requestedFigure, content } = req.body;
      if (!requestedFigure || !content) {
        return res.status(400).json({ success: false, error: 'requestedFigure and content required' });
      }
      const result = await validatePersonMatch(requestedFigure, content);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Validate person error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get verified historical facts about a figure
  router.get('/fact-check/verified-facts/:figureName', async (req, res) => {
    try {
      const { getVerifiedFacts } = await import('../services/fact-check-service');
      const { figureName } = req.params;
      const facts = await getVerifiedFacts(decodeURIComponent(figureName));
      res.json({ success: true, data: facts });
    } catch (error: any) {
      console.error('Get verified facts error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get learning statistics from fact-check service
  router.get('/fact-check/learning-stats', async (req, res) => {
    try {
      const { getLearningStats } = await import('../services/fact-check-service');
      const stats = getLearningStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Learning stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Manually record a mistake for learning
  router.post('/fact-check/record-mistake', async (req, res) => {
    try {
      const { recordMistake } = await import('../services/fact-check-service');
      const { figureName, issue, confusedWith } = req.body;
      if (!figureName || !issue) {
        return res.status(400).json({ success: false, error: 'figureName and issue required' });
      }
      recordMistake(figureName, issue, confusedWith);
      res.json({ success: true, message: 'Mistake recorded for learning' });
    } catch (error: any) {
      console.error('Record mistake error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Register an alias (e.g., "FZ" could mean multiple people)
  router.post('/fact-check/register-alias', async (req, res) => {
    try {
      const { registerAlias } = await import('../services/fact-check-service');
      const { alias, possibleFigures } = req.body;
      if (!alias || !possibleFigures || !Array.isArray(possibleFigures)) {
        return res.status(400).json({ success: false, error: 'alias and possibleFigures array required' });
      }
      registerAlias(alias, possibleFigures);
      res.json({ success: true, message: `Alias "${alias}" registered` });
    } catch (error: any) {
      console.error('Register alias error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
