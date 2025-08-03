#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const AudiobookMaker = require('./src/AudiobookMaker');

async function main() {
  console.log(
    chalk.cyan(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║                🎧 AI AUDIOBOOK MAKER v4.0.6 🎧                ║
║                                                               ║
║            Transform PDFs & Text into Audiobooks             ║
║         OpenAI TTS, Fish Speech & Thorsten-Voice TTS         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `)
  );

  program
    .name('aiabm')
    .description('AI Audiobook Maker - Convert PDFs and text files to audiobooks')
    .version('4.0.6')
    .argument('[file]', 'Path to PDF or text file to convert')
    .option('-v, --voice <voice>', 'Voice to use (alloy, echo, fable, onyx, nova, shimmer)')
    .option('-s, --speed <speed>', 'Speech speed (0.25-4.0)', '1.0')
    .option('-m, --model <model>', 'TTS model (tts-1, tts-1-hd)', 'tts-1')
    .option('--config', 'Manage API key configuration')
    .parse();

  const options = program.opts();
  const filePath = program.args[0];

  try {
    const maker = new AudiobookMaker();

    // Handle config option
    if (options.config) {
      await maker.manageConfig();
      return;
    }

    // Initialize and run
    await maker.initialize();

    if (filePath) {
      // CLI argument mode
      if (!fs.existsSync(filePath)) {
        console.log(chalk.red(`❌ File not found: ${filePath}`));
        process.exit(1);
      }

      await maker.processFile(filePath, {
        voice: options.voice,
        speed: parseFloat(options.speed),
        model: options.model,
      });
    } else {
      // Interactive mode
      await maker.runInteractive();
    }
  } catch (error) {
    console.error(chalk.red(`❌ Error: ${error.message}`));
    process.exit(1);
  }
}

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  console.error(chalk.red(`❌ Unexpected error: ${error.message}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red(`❌ Unhandled rejection: ${reason}`));
  process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Goodbye! Thank you for using AI Audiobook Maker! 🌟'));
  process.exit(0);
});

// Only run main() if this file is executed directly (not required in tests)
if (require.main === module) {
  main();
}
