// -----------------------------------------------------------------------------
// Entry point of the ESC/POS ticket printers integration.
//
// Instantiates the SDK and starts it; every handler is registered by
// src/app.js (testable against the SDK fake Gladys). The SDK reads the
// supervisor variables (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR) by itself. LOG_LEVEL=debug shows every check.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerIntegration } from './src/app.js';

const gladys = new GladysIntegration();

// Handlers are registered BEFORE connect().
const integration = registerIntegration(gladys);

gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  await integration.stop();
});

logger.info('Starting the ESC/POS ticket printers integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
