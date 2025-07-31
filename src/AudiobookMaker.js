const ConfigManager = require('./ConfigManager');
const FileHandler = require('./FileHandler');
const TTSService = require('./TTSService');
const VoicePreview = require('./VoicePreview');
const ProgressManager = require('./ProgressManager');
const inquirer = require('inquirer');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');
const ora = require('ora');

class AudiobookMaker {
  constructor() {
    this.configManager = null;
    this.fileHandler = null;
    this.ttsService = null;
    this.voicePreview = null;
    this.progressManager = null;
  }

  async initialize() {
    this.configManager = new ConfigManager();
    await this.configManager.initialize();

    this.fileHandler = new FileHandler();
    this.progressManager = new ProgressManager(this.configManager.configDir);
    await this.progressManager.initialize();
  }

  async manageConfig() {
    await this.configManager.manageApiKey();
  }

  async runInteractive() {
    // Check for resumable sessions first
    const resumeSession = await this.progressManager.showResumeDialog();
    if (resumeSession) {
      return await this.resumeSession(resumeSession);
    }

    // Main menu
    await this.showMainMenu();
  }

  async showMainMenu() {
    while (true) {
      console.log(chalk.cyan('\n🎧 AI Audiobook Maker - Main Menu'));
      console.log(chalk.gray('Use arrow keys to navigate, Enter to select\n'));
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '📖 Convert a file to audiobook', value: 'convert' },
            { name: '🎤 Preview voices', value: 'preview' },
            { name: '⚙️  Manage API key', value: 'config' },
            { name: '📊 View session history', value: 'history' },
            { name: '🧹 Clear cache', value: 'clear_cache' },
            { name: '❌ Exit', value: 'exit' }
          ]
        }
      ]);

      switch (action) {
        case 'convert':
          await this.startConversion();
          break;
        case 'preview':
          await this.previewVoicesOnly();
          break;
        case 'config':
          await this.configManager.manageApiKey();
          break;
        case 'history':
          await this.showSessionHistory();
          break;
        case 'clear_cache':
          await this.configManager.clearCache();
          break;
        case 'exit':
          console.log(chalk.yellow('\n👋 Goodbye! Thank you for using AI Audiobook Maker! 🌟'));
          process.exit(0);
      }
    }
  }

  async startConversion() {
    try {
      const apiKey = await this.configManager.ensureApiKey();
      this.ttsService = new TTSService(apiKey, this.configManager.getCacheDir());
      this.voicePreview = new VoicePreview(this.ttsService);

      // Select file
      const filePath = await this.fileHandler.selectFile();
      if (!filePath) return;

      // Process the file
      await this.processFile(filePath);
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
    }
  }

  async processFile(filePath, cliOptions = {}) {
    try {
      // Initialize services if not already done
      if (!this.ttsService) {
        const apiKey = await this.configManager.ensureApiKey();
        this.ttsService = new TTSService(apiKey, this.configManager.getCacheDir());
        this.voicePreview = new VoicePreview(this.ttsService);
      }

      console.log(chalk.cyan('\n🔍 Analyzing file...'));
      
      // Read and analyze file
      const fileData = await this.fileHandler.readFile(filePath);
      const chunks = this.fileHandler.splitTextIntoChunks(fileData.content);
      const costInfo = this.fileHandler.calculateCost(fileData.content);

      // Display file info
      this.displayFileInfo(fileData, costInfo, chunks.length);

      // Check for existing session
      const existingSession = await this.progressManager.findExistingSession(filePath);
      if (existingSession && existingSession.progress.completedChunks > 0) {
        const resumeConfirmed = await this.promptResumeExisting(existingSession);
        if (resumeConfirmed) {
          return await this.resumeSession(existingSession, { chunks, fileData });
        }
      }

      // Get conversion settings
      const settings = await this.getConversionSettings(cliOptions);
      if (!settings) return;

      // Create new session
      const session = await this.progressManager.createSession(filePath, settings);
      await this.progressManager.updateProgress(session.id, {
        totalChunks: chunks.length,
        status: 'processing'
      });

      // Start conversion
      await this.convertToAudio(session, chunks, fileData, settings);

    } catch (error) {
      console.log(chalk.red(`❌ Error processing file: ${error.message}`));
    }
  }

  displayFileInfo(fileData, costInfo, chunkCount) {
    console.log(chalk.green('\n✅ File analyzed successfully!'));
    console.log(chalk.white('\n📊 File Information:'));
    console.log(chalk.gray(`   Type: ${fileData.type.toUpperCase()}`));
    console.log(chalk.gray(`   Characters: ${fileData.characterCount.toLocaleString()}`));
    console.log(chalk.gray(`   Words: ${fileData.wordCount.toLocaleString()}`));
    if (fileData.pageCount) {
      console.log(chalk.gray(`   Pages: ${fileData.pageCount}`));
    }
    console.log(chalk.gray(`   Chunks: ${chunkCount}`));
    console.log(chalk.gray(`   Estimated cost: $${costInfo.estimatedCost.toFixed(2)} USD`));
    
    const estimatedTime = this.ttsService?.estimateProcessingTime(fileData.characterCount) || '~Unknown';
    console.log(chalk.gray(`   Estimated time: ${estimatedTime}`));
  }

  async promptResumeExisting(session) {
    const progress = `${session.progress.completedChunks}/${session.progress.totalChunks}`;
    
    console.log(chalk.yellow('\n⚠️  Found existing conversion for this file'));
    console.log(chalk.gray(`   Progress: ${progress} chunks (${session.progress.percentage}%)`));
    console.log(chalk.gray(`   Last updated: ${this.progressManager.getTimeAgo(session.updatedAt)}`));

    const { resume } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'resume',
        message: 'Resume previous conversion?',
        default: true
      }
    ]);

    return resume;
  }

  async getConversionSettings(cliOptions = {}) {
    // Use CLI options if provided
    if (cliOptions.voice && cliOptions.speed && cliOptions.model) {
      return {
        voice: cliOptions.voice,
        speed: cliOptions.speed,
        model: cliOptions.model,
        outputOptions: 'single'
      };
    }

    // Interactive voice selection
    const voice = await this.voicePreview.showVoiceSelection();
    if (!voice) return null;

    // Get advanced settings
    const advancedSettings = await this.voicePreview.getAdvancedSettings();

    return {
      voice,
      ...advancedSettings
    };
  }

  async convertToAudio(session, chunks, fileData, settings) {
    const outputDir = path.join(process.cwd(), 'audiobook_output', `${path.basename(session.filePath, path.extname(session.filePath))}_${session.id}`);
    await fs.ensureDir(outputDir);

    await this.progressManager.updateProgress(session.id, { outputDir });

    console.log(chalk.cyan('\n🎙️ Starting audio conversion...'));
    console.log(chalk.gray(`Output directory: ${outputDir}\n`));

    try {
      // Process chunks
      const audioFiles = await this.ttsService.processTextChunks(
        chunks,
        {
          voice: settings.voice,
          model: settings.model,
          speed: settings.speed,
          outputDir
        },
        (progress) => {
          this.progressManager.updateProgress(session.id, {
            currentChunk: progress.current,
            filePath: progress.filePath
          });
        }
      );

      // Handle output options
      if (settings.outputOptions === 'single' || settings.outputOptions === 'both') {
        const finalOutputPath = path.join(outputDir, `${path.basename(session.filePath, path.extname(session.filePath))}_audiobook.mp3`);
        
        console.log(chalk.cyan('\n🔗 Combining audio files...'));
        await this.ttsService.concatenateAudioFiles(audioFiles, finalOutputPath);
        
        await this.progressManager.updateProgress(session.id, {
          finalOutputPath,
          status: 'completed'
        });

        console.log(chalk.green('\n🎉 Audiobook creation completed!'));
        console.log(chalk.white(`📁 Single file: ${finalOutputPath}`));
        
        if (settings.outputOptions === 'single') {
          // Clean up individual chunk files
          await this.cleanupChunkFiles(audioFiles);
        }
      }

      if (settings.outputOptions === 'separate' || settings.outputOptions === 'both') {
        console.log(chalk.green('\n📚 Individual chapter files available:'));
        audioFiles.forEach((file, index) => {
          console.log(chalk.white(`   Chapter ${index + 1}: ${file}`));
        });
      }

      // Display final summary
      await this.displayCompletionSummary(session, fileData, audioFiles.length);

    } catch (error) {
      await this.progressManager.updateProgress(session.id, {
        status: 'failed',
        error: error.message
      });
      throw error;
    }
  }

  async resumeSession(session, additionalData = null) {
    console.log(chalk.cyan(`\n🔄 Resuming session: ${session.fileName}`));

    try {
      // Re-initialize services
      const apiKey = await this.configManager.ensureApiKey();
      this.ttsService = new TTSService(apiKey, this.configManager.getCacheDir());

      let chunks, fileData;

      if (additionalData) {
        chunks = additionalData.chunks;
        fileData = additionalData.fileData;
      } else {
        // Re-read file data
        fileData = await this.fileHandler.readFile(session.filePath);
        chunks = this.fileHandler.splitTextIntoChunks(fileData.content);
      }

      // Determine remaining chunks
      const remainingChunks = chunks.slice(session.progress.completedChunks);
      
      if (remainingChunks.length === 0) {
        console.log(chalk.green('✅ Session already completed!'));
        return;
      }

      console.log(chalk.yellow(`Resuming from chunk ${session.progress.completedChunks + 1}/${chunks.length}`));
      console.log(chalk.gray(`Remaining: ${remainingChunks.length} chunks\n`));

      // Continue conversion
      const outputDir = session.outputDir || path.join(process.cwd(), 'audiobook_output', `${path.basename(session.filePath, path.extname(session.filePath))}_${session.id}`);
      await fs.ensureDir(outputDir);

      // Process remaining chunks
      const remainingAudioFiles = await this.ttsService.processTextChunks(
        remainingChunks,
        {
          voice: session.options.voice,
          model: session.options.model,
          speed: session.options.speed,
          outputDir
        },
        (progress) => {
          const actualChunkNumber = session.progress.completedChunks + progress.current;
          this.progressManager.updateProgress(session.id, {
            currentChunk: actualChunkNumber,
            filePath: progress.filePath
          });
        }
      );

      // Combine all audio files (existing + new)
      const allAudioFiles = [];
      
      // Add existing files
      for (let i = 1; i <= session.progress.completedChunks; i++) {
        const fileName = `chunk_${i.toString().padStart(3, '0')}.mp3`;
        allAudioFiles.push(path.join(outputDir, fileName));
      }
      
      // Add new files
      allAudioFiles.push(...remainingAudioFiles);

      // Create final output
      if (session.options.outputOptions !== 'separate') {
        const finalOutputPath = path.join(outputDir, `${path.basename(session.filePath, path.extname(session.filePath))}_audiobook.mp3`);
        await this.ttsService.concatenateAudioFiles(allAudioFiles, finalOutputPath);
        
        await this.progressManager.updateProgress(session.id, {
          finalOutputPath,
          status: 'completed'
        });

        console.log(chalk.green('\n🎉 Audiobook resumed and completed!'));
        console.log(chalk.white(`📁 Final file: ${finalOutputPath}`));
      }

      await this.displayCompletionSummary(session, fileData, allAudioFiles.length);

    } catch (error) {
      await this.progressManager.updateProgress(session.id, {
        status: 'failed',
        error: error.message
      });
      console.log(chalk.red(`❌ Resume failed: ${error.message}`));
    }
  }

  async cleanupChunkFiles(audioFiles) {
    try {
      for (const file of audioFiles) {
        await fs.remove(file);
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not clean up chunk files: ${error.message}`));
    }
  }

  async displayCompletionSummary(session, fileData, audioFileCount) {
    console.log(chalk.green('\n🎊 Conversion Summary:'));
    console.log(chalk.white(`   📖 Source: ${session.fileName}`));
    console.log(chalk.white(`   🎤 Voice: ${session.options.voice}`));
    console.log(chalk.white(`   🤖 Model: ${session.options.model}`));
    console.log(chalk.white(`   ⚡ Speed: ${session.options.speed}x`));
    console.log(chalk.white(`   📊 Chunks processed: ${audioFileCount}`));
    console.log(chalk.white(`   💰 Estimated cost: $${this.fileHandler.calculateCost(fileData.content, session.options.model).estimatedCost.toFixed(2)}`));
    console.log(chalk.white(`   📁 Output location: ${session.outputDir}`));
    
    if (session.finalOutputPath) {
      console.log(chalk.cyan('\n🎧 Your audiobook is ready to enjoy!'));
    }
  }

  async previewVoicesOnly() {
    try {
      const apiKey = await this.configManager.ensureApiKey();
      this.ttsService = new TTSService(apiKey, this.configManager.getCacheDir());
      this.voicePreview = new VoicePreview(this.ttsService);

      await this.voicePreview.showVoiceSelection();
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
    }
  }

  async showSessionHistory() {
    const stats = await this.progressManager.getSessionStats();
    const recentSessions = await this.progressManager.getRecentSessions(10);

    console.log(chalk.cyan('\n📊 Session Statistics:'));
    console.log(chalk.white(`   Total sessions: ${stats.total}`));
    console.log(chalk.white(`   Completed: ${stats.completed}`));
    console.log(chalk.white(`   In progress: ${stats.inProgress}`));
    console.log(chalk.white(`   Failed: ${stats.failed}`));
    console.log(chalk.white(`   Total chunks processed: ${stats.totalProcessedChunks}`));

    if (recentSessions.length > 0) {
      console.log(chalk.cyan('\n📋 Recent Sessions:'));
      recentSessions.forEach((session, index) => {
        const status = this.getStatusEmoji(session.status);
        const progress = session.progress.totalChunks > 0 
          ? `${session.progress.completedChunks}/${session.progress.totalChunks}`
          : 'Not started';
        
        console.log(chalk.white(`   ${index + 1}. ${status} ${session.fileName} - ${progress} - ${this.progressManager.getTimeAgo(session.updatedAt)}`));
      });
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Session management:',
        choices: [
          { name: '🔙 Back to main menu', value: 'back' },
          { name: '🧹 Clear all sessions', value: 'clear' }
        ]
      }
    ]);

    if (action === 'clear') {
      await this.progressManager.clearOldSessions();
    }
  }

  getStatusEmoji(status) {
    switch (status) {
      case 'completed': return '✅';
      case 'processing': return '🔄';
      case 'failed': return '❌';
      default: return '⏳';
    }
  }
}

module.exports = AudiobookMaker;