const ConfigManager = require('./ConfigManager');
const FileHandler = require('./FileHandler');
const TTSService = require('./TTSService');
const KyutaiService = require('./KyutaiService');
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
      await this.initializeServices('openai'); // Default to OpenAI for CLI
      return {
        provider: 'openai',
        voice: cliOptions.voice,
        speed: cliOptions.speed,
        model: cliOptions.model,
        outputOptions: 'single'
      };
    }

    // Provider selection
    const provider = await this.showProviderSelection();
    if (!provider) return null;

    // Initialize services based on selected provider
    try {
      await this.initializeServices(provider);
    } catch (error) {
      console.log(chalk.red(`❌ Failed to initialize ${provider} service: ${error.message}`));
      return null;
    }

    // Interactive voice selection based on provider
    const voice = await this.voicePreview.showVoiceSelection(provider);
    if (!voice) return null;

    // Get advanced settings
    const advancedSettings = await this.voicePreview.getAdvancedSettings(provider);

    return {
      provider,
      voice,
      ...advancedSettings
    };
  }

  async initializeServices(provider = 'openai') {
    if (provider === 'openai') {
      // Check if we have a valid API key for OpenAI
      const apiKey = await this.configManager.ensureApiKey();
      if (!apiKey) throw new Error('OpenAI API key required');
      
      this.ttsService = new TTSService(apiKey, this.configManager.getCacheDir());
    } else if (provider === 'kyutai') {
      this.ttsService = new KyutaiService(this.configManager.getCacheDir());
      
      // Check if Kyutai is available
      const available = await this.ttsService.isAvailable();
      if (!available) {
        console.log(chalk.yellow('⚠️  Kyutai TTS not found or not properly installed'));
        throw new Error('Kyutai TTS not available');
      }
    }

    this.voicePreview = new VoicePreview(this.ttsService);
  }

  async showProviderSelection() {
    console.log(chalk.cyan('\n🤖 TTS Provider Selection'));
    console.log(chalk.gray('Choose your text-to-speech provider\n'));
    
    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'Select TTS Provider:',
        choices: [
          { 
            name: '🤖 OpenAI TTS (Cloud, requires API key)', 
            value: 'openai',
            short: 'OpenAI TTS'
          },
          { 
            name: '🆓 Kyutai TTS (Local, free, requires installation)', 
            value: 'kyutai',
            short: 'Kyutai TTS'
          }
        ],
        default: 'openai'
      }
    ]);

    // Check if Kyutai is available if selected
    if (provider === 'kyutai') {
      const kyutaiAvailable = await this.checkKyutaiInstallation();
      if (!kyutaiAvailable) {
        const shouldInstall = await this.showKyutaiInstallation();
        if (!shouldInstall) {
          return 'openai'; // Fallback to OpenAI
        }
      }
    }

    return provider;
  }

  async checkKyutaiInstallation() {
    try {
      // Create a temporary KyutaiService to check availability
      const tempKyutaiService = new KyutaiService(this.configManager.getCacheDir());
      return await tempKyutaiService.isAvailable();
    } catch (error) {
      return false;
    }
  }

  async showKyutaiInstallation() {
    console.log(chalk.yellow('\n🆓 Kyutai TTS Setup Required'));
    console.log(chalk.gray('┌─ First time setup (one-time) ─┐'));
    console.log(chalk.gray('│ ⚠️  Kyutai TTS runs locally    │'));
    console.log(chalk.gray('│ 📦 Size: ~2GB download        │'));
    console.log(chalk.gray('│ 🖥️  Requires: Python + PyTorch │'));
    console.log(chalk.gray('└────────────────────────────────┘\n'));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🚀 Install Kyutai TTS automatically', value: 'install' },
          { name: '🤖 Use OpenAI TTS instead', value: 'openai' },
          { name: '📋 Show manual installation guide', value: 'manual' }
        ]
      }
    ]);

    if (action === 'install') {
      return await this.installKyutai();
    } else if (action === 'manual') {
      this.showManualInstallation();
      return false;
    } else {
      return false; // Use OpenAI instead
    }
  }

  async installKyutai() {
    console.log(chalk.cyan('\n🔧 Installing Kyutai TTS...'));
    
    try {
      // Step 1: Check Python installation
      console.log(chalk.gray('📋 Step 1/4: Checking Python installation...'));
      await this.checkPythonInstallation();
      console.log(chalk.green('✅ Python found'));

      // Step 2: Create installation directory
      console.log(chalk.gray('📋 Step 2/4: Creating installation directory...'));
      const installDir = await this.createKyutaiInstallDir();
      console.log(chalk.green(`✅ Directory created: ${installDir}`));

      // Step 3: Clone repository
      console.log(chalk.gray('📋 Step 3/4: Cloning Kyutai repository...'));
      console.log(chalk.yellow('⏳ This may take a few minutes...'));
      await this.cloneKyutaiRepository(installDir);
      console.log(chalk.green('✅ Repository cloned'));

      // Step 4: Install dependencies
      console.log(chalk.gray('📋 Step 4/4: Installing Python dependencies...'));
      console.log(chalk.yellow('⏳ Installing PyTorch and dependencies...'));
      await this.installKyutaiDependencies(installDir);
      console.log(chalk.green('✅ Dependencies installed'));

      console.log(chalk.green('\n🎉 Kyutai TTS installation completed!'));
      console.log(chalk.cyan('🔄 Restarting voice selection...'));
      
      return true;
    } catch (error) {
      console.log(chalk.red(`\n❌ Installation failed: ${error.message}`));
      console.log(chalk.yellow('💡 Please try the manual installation instead.'));
      this.showManualInstallation();
      return false;
    }
  }

  async checkPythonInstallation() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync('python --version');
      const version = stdout.trim();
      
      // Check if Python version is 3.8+
      const versionMatch = version.match(/Python (\d+)\.(\d+)/);
      if (!versionMatch) {
        throw new Error('Could not determine Python version');
      }
      
      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]);
      
      if (major < 3 || (major === 3 && minor < 8)) {
        throw new Error(`Python 3.8+ required, found ${version}`);
      }
      
      return version;
    } catch (error) {
      // Try python3 command
      try {
        const { stdout } = await execAsync('python3 --version');
        return stdout.trim();
      } catch (python3Error) {
        throw new Error('Python 3.8+ not found. Please install Python from https://python.org');
      }
    }
  }

  async createKyutaiInstallDir() {
    const os = require('os');
    const path = require('path');
    const fs = require('fs-extra');
    
    const installDir = path.join(os.homedir(), '.aiabm', 'kyutai-tts');
    await fs.ensureDir(installDir);
    return installDir;
  }

  async cloneKyutaiRepository(installDir) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const path = require('path');
    
    const repoDir = path.join(installDir, 'delayed-streams-modeling');
    
    // Check if repository already exists
    const fs = require('fs-extra');
    if (await fs.pathExists(repoDir)) {
      console.log(chalk.yellow('📁 Repository already exists, updating...'));
      await execAsync('git pull', { cwd: repoDir });
      return repoDir;
    }
    
    // Clone the repository
    const repoUrl = 'https://github.com/kyutai-labs/delayed-streams-modeling.git';
    await execAsync(`git clone ${repoUrl}`, { cwd: installDir });
    
    return repoDir;
  }

  async installKyutaiDependencies(installDir) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const path = require('path');
    
    const repoDir = path.join(installDir, 'delayed-streams-modeling');
    
    // Determine pip command (pip or pip3)
    let pipCommand = 'pip';
    try {
      await execAsync('pip --version');
    } catch (error) {
      try {
        await execAsync('pip3 --version');
        pipCommand = 'pip3';
      } catch (pip3Error) {
        throw new Error('pip not found. Please install pip');
      }
    }
    
    // Install basic dependencies
    const dependencies = [
      'torch',
      'torchaudio', 
      'transformers',
      'numpy',
      'scipy',
      'librosa'
    ];
    
    for (const dep of dependencies) {
      console.log(chalk.gray(`   Installing ${dep}...`));
      await execAsync(`${pipCommand} install ${dep}`, { 
        cwd: repoDir,
        timeout: 300000 // 5 minutes timeout per package
      });
    }
    
    // Check if requirements.txt exists and install from it
    const fs = require('fs-extra');
    const requirementsPath = path.join(repoDir, 'requirements.txt');
    if (await fs.pathExists(requirementsPath)) {
      console.log(chalk.gray('   Installing from requirements.txt...'));
      await execAsync(`${pipCommand} install -r requirements.txt`, { 
        cwd: repoDir,
        timeout: 600000 // 10 minutes timeout
      });
    }
  }

  showManualInstallation() {
    console.log(chalk.cyan('\n📋 Manual Installation Guide:'));
    console.log(chalk.white('1. Install Python 3.8+ and pip'));
    console.log(chalk.white('2. Clone repository:'));
    console.log(chalk.gray('   git clone https://github.com/kyutai-labs/delayed-streams-modeling.git'));
    console.log(chalk.white('3. Install dependencies:'));
    console.log(chalk.gray('   pip install torch torchaudio transformers'));
    console.log(chalk.white('4. Follow setup instructions in the repository'));
    console.log(chalk.gray('   https://github.com/kyutai-labs/delayed-streams-modeling\n'));
  }

  async convertToAudio(session, chunks, fileData, settings) {
    const baseOutputDir = settings.outputDirectory || path.join(process.cwd(), 'audiobook_output');
    const outputDir = path.join(baseOutputDir, `${path.basename(session.filePath, path.extname(session.filePath))}_${session.id}`);
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
      const baseOutputDir = session.options.outputDirectory || path.join(process.cwd(), 'audiobook_output');
      const outputDir = session.outputDir || path.join(baseOutputDir, `${path.basename(session.filePath, path.extname(session.filePath))}_${session.id}`);
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
      
      // Ask if user wants to open output folder
      const { openFolder } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'openFolder',
          message: '📂 Open output folder?',
          default: true
        }
      ]);
      
      if (openFolder) {
        await this.openOutputFolder(session.outputDir);
      }
    }
  }

  async openOutputFolder(outputDir) {
    try {
      const { exec } = require('child_process');
      const platform = process.platform;
      
      let command;
      switch (platform) {
        case 'darwin': // macOS
          command = `open "${outputDir}"`;
          break;
        case 'win32': // Windows
          command = `explorer "${outputDir}"`;
          break;
        case 'linux': // Linux
          command = `xdg-open "${outputDir}"`;
          break;
        default:
          console.log(chalk.yellow(`💡 Output folder: ${outputDir}`));
          return;
      }
      
      exec(command, (error) => {
        if (error) {
          console.log(chalk.yellow(`⚠️  Could not open folder automatically: ${outputDir}`));
        } else {
          console.log(chalk.green('📂 Output folder opened!'));
        }
      });
    } catch (error) {
      console.log(chalk.yellow(`💡 Output folder: ${outputDir}`));
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