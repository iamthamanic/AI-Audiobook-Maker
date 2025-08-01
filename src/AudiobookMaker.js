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
      
      // Check if Kyutai needs dependency installation after initialization
      if (provider === 'kyutai' && this.ttsService.needsDependencyInstall) {
        console.log(chalk.cyan('\n🔧 Kyutai TTS Setup Required'));
        console.log(chalk.yellow('Dependencies need to be installed to continue with Kyutai TTS'));
        
        const shouldInstall = await this.showKyutaiInstallation();
        if (!shouldInstall) {
          console.log(chalk.blue('Switching to OpenAI TTS...'));
          return this.getInteractiveSettings(cliOptions); // Restart selection
        }
        
        // Re-check availability after installation with a fresh service instance
        const freshKyutaiService = new KyutaiService(this.configManager.getCacheDir());
        const available = await freshKyutaiService.isAvailable();
        if (!available) {
          console.log(chalk.red('❌ Installation failed. Switching to OpenAI TTS'));
          return this.getInteractiveSettings(cliOptions); // Restart selection
        }
        
        // Update our service instance to the fresh one that passed the check
        this.ttsService = freshKyutaiService;
      }
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
        // If Kyutai needs dependency installation, handle it appropriately
        if (this.ttsService.needsDependencyInstall) {
          console.log(chalk.yellow('⚠️  Kyutai TTS dependencies need to be installed'));
          // Don't throw error here - let the provider selection handle installation
        } else {
          console.log(chalk.yellow('⚠️  Kyutai TTS not found or not properly installed'));
          throw new Error('Kyutai TTS not available');
        }
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
      const isAvailable = await tempKyutaiService.isAvailable();
      
      // Check if we need dependency installation
      if (!isAvailable && tempKyutaiService.needsDependencyInstall) {
        console.log(chalk.yellow('\n⚠️  Kyutai TTS needs dependency update'));
        return false; // Trigger installation flow
      }
      
      return isAvailable;
    } catch (error) {
      return false;
    }
  }

  async showKyutaiInstallation() {
    console.log(chalk.yellow('\n🆓 Kyutai TTS Setup Required'));
    console.log(chalk.gray('┌─ First time setup (one-time) ─┐'));
    console.log(chalk.gray('│ ⚠️  Kyutai TTS runs locally    │'));
    console.log(chalk.gray('│ 📦 Size: ~2GB download        │'));
    console.log(chalk.gray('│ 🖥️  Automatic installation available │'));
    console.log(chalk.gray('└────────────────────────────────┘\n'));

    const installationMethods = [
      { name: '🚀 Auto Install (tries all methods automatically)', value: 'auto' },
      { name: '⚙️ Advanced Install (choose specific method)', value: 'advanced' },
      { name: '🤖 Use OpenAI TTS instead', value: 'openai' },
      { name: '📋 Show manual installation guide', value: 'manual' }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Choose installation method:',
        choices: installationMethods
      }
    ]);

    if (action === 'auto') {
      return await this.installKyutai();
    } else if (action === 'advanced') {
      return await this.showAdvancedInstallation();
    } else if (action === 'manual') {
      this.showManualInstallation();
      return false;
    } else {
      return false; // Use OpenAI instead
    }
  }

  async showAdvancedInstallation() {
    console.log(chalk.cyan('\n⚙️ Advanced Installation Options'));
    console.log(chalk.gray('Choose your preferred installation method:\n'));

    const advancedMethods = [
      { name: '🚀 Smart installation (tries all methods automatically)', value: 'install' },
      { name: '📦 Conda installation (recommended if available)', value: 'conda' },
      { name: '🐳 Docker installation (most reliable)', value: 'docker' },
      { name: '📋 Manual installation guide', value: 'manual' },
      { name: '🔙 Back to main options', value: 'back' }
    ];

    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: 'Select installation method:',
        choices: advancedMethods
      }
    ]);

    if (method === 'install') {
      return await this.installKyutai();
    } else if (method === 'conda') {
      return await this.installKyutaiWithConda();
    } else if (method === 'docker') {
      return await this.installKyutaiWithDocker();
    } else if (method === 'manual') {
      this.showManualInstallation();
      return false;
    } else {
      // Back to main options
      return await this.showKyutaiInstallation();
    }
  }

  async installKyutai() {
    console.log(chalk.cyan('\n🔧 Installing Kyutai TTS...'));
    
    try {
      // Step 1: Check Python installation
      console.log(chalk.gray('📋 Step 1/4: Checking Python installation...'));
      await this.checkPythonInstallation();
      console.log(chalk.green('✅ Python found'));

      // Step 2: Create/check installation directory
      console.log(chalk.gray('📋 Step 2/4: Setting up installation directory...'));
      const installDir = await this.createKyutaiInstallDir();
      
      // Check if already exists
      const fs = require('fs-extra');
      const path = require('path');
      const repoDir = path.join(installDir, 'delayed-streams-modeling');
      const repoExists = await fs.pathExists(repoDir);
      
      if (repoExists) {
        console.log(chalk.green('✅ Repository already exists'));
      } else {
        console.log(chalk.green(`✅ Directory created: ${installDir}`));
      }

      // Step 3: Clone/update repository
      if (!repoExists) {
        console.log(chalk.gray('📋 Step 3/4: Cloning Kyutai repository...'));
        console.log(chalk.yellow('⏳ This may take a few minutes...'));
        await this.cloneKyutaiRepository(installDir);
        console.log(chalk.green('✅ Repository cloned'));
      } else {
        console.log(chalk.gray('📋 Step 3/4: Repository already cloned, updating dependencies...'));
      }

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
    const fs = require('fs-extra');
    
    const repoDir = path.join(installDir, 'delayed-streams-modeling');
    const venvDir = path.join(installDir, 'kyutai-env');
    
    // Create virtual environment if it doesn't exist
    if (!await fs.pathExists(venvDir)) {
      console.log(chalk.gray('   Creating virtual environment...'));
      await execAsync(`python3 -m venv "${venvDir}"`);
    }
    
    const venvPython = path.join(venvDir, 'bin', 'python');
    const venvPip = path.join(venvDir, 'bin', 'pip');
    
    // Try multiple installation strategies
    try {
      // Strategy 1: Install with conda if available
      await this.tryCondaInstallation(venvDir);
    } catch (condaError) {
      console.log(chalk.yellow('   Conda not available, trying pip...'));
      
      try {
        // Strategy 2: Install with specific Python version and precompiled wheels
        await this.tryOptimizedPipInstallation(venvPython, venvPip);
      } catch (pipError) {
        console.log(chalk.yellow('   Advanced pip installation failed, trying basic...'));
        
        // Strategy 3: Basic installation with workarounds
        await this.tryBasicInstallation(venvPython, venvPip, repoDir);
      }
    }
  }
  
  async tryCondaInstallation(venvDir) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Check if conda is available
    await execAsync('conda --version');
    
    console.log(chalk.cyan('   📦 Using conda for installation (recommended)...'));
    
    // Create conda environment
    const envName = 'kyutai-tts';
    await execAsync(`conda create -n ${envName} python=3.11 -y`);
    
    // Install dependencies via conda
    const condaPackages = [
      'pytorch',
      'torchaudio', 
      'transformers',
      'numpy',
      'scipy',
      'librosa',
      'sentencepiece'  // Often available as conda package
    ];
    
    for (const pkg of condaPackages) {
      console.log(chalk.gray(`   Installing ${pkg} via conda...`));
      try {
        await execAsync(`conda install -n ${envName} -c pytorch -c conda-forge ${pkg} -y`, {
          timeout: 300000
        });
      } catch (error) {
        console.log(chalk.yellow(`   Could not install ${pkg} via conda, will try pip...`));
      }
    }
    
    // Try to install moshi in conda environment
    await execAsync(`conda run -n ${envName} pip install moshi==0.2.11 einops aiohttp`, {
      timeout: 600000
    });
    
    console.log(chalk.green('   ✅ Conda installation completed'));
  }
  
  async tryOptimizedPipInstallation(venvPython, venvPip) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    console.log(chalk.cyan('   🐍 Using optimized pip installation...'));
    
    // Upgrade pip first
    await execAsync(`"${venvPython}" -m pip install --upgrade pip`);
    
    // Install with specific strategies for problematic packages
    const installCommands = [
      // Install PyTorch with CPU support
      `"${venvPip}" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu`,
      
      // Install basic ML packages
      `"${venvPip}" install numpy transformers huggingface-hub`,
      
      // Try to install pre-built sentencepiece wheel
      `"${venvPip}" install --only-binary=all sentencepiece`,
      
      // Install audio packages
      `"${venvPip}" install sounddevice sphn einops aiohttp`,
      
      // Install moshi without building dependencies
      `"${venvPip}" install --no-deps moshi==0.2.11`
    ];
    
    for (const cmd of installCommands) {
      console.log(chalk.gray(`   ${cmd.split(' ').slice(-1)[0]}...`));
      try {
        await execAsync(cmd, { timeout: 300000 });
      } catch (error) {
        if (cmd.includes('sentencepiece')) {
          console.log(chalk.yellow('   ⚠️  sentencepiece failed, trying alternative...'));
          // Try alternative sentencepiece installation
          await execAsync(`"${venvPip}" install protobuf`, { timeout: 60000 });
          await execAsync(`"${venvPip}" install --no-cache-dir sentencepiece`, { timeout: 300000 });
        } else {
          throw error;
        }
      }
    }
    
    console.log(chalk.green('   ✅ Optimized pip installation completed'));
  }
  
  async tryBasicInstallation(venvPython, venvPip, repoDir) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    console.log(chalk.cyan('   🔧 Using basic installation with workarounds...'));
    
    // Install essential packages first
    const essentialPackages = [
      'numpy',
      'torch',
      'transformers', 
      'sounddevice',
      'einops',
      'aiohttp'
    ];
    
    for (const pkg of essentialPackages) {
      console.log(chalk.gray(`   Installing ${pkg}...`));
      await execAsync(`"${venvPip}" install ${pkg}`, { 
        timeout: 300000
      });
    }
    
    // Install sentencepiece with special handling (required for Moshi)
    console.log(chalk.gray('   Installing sentencepiece (required for Moshi)...'));
    await this.installSentencepieceWithFallbacks(venvPip, venvPython);
    
    // Install moshi without dependencies (we have most of them)
    console.log(chalk.gray('   Installing moshi (no deps)...'));
    await execAsync(`"${venvPip}" install --no-deps moshi==0.2.11`, {
      timeout: 60000
    });
    
    // Test if moshi was installed correctly
    console.log(chalk.gray('   🔍 Testing Moshi installation...'));
    try {
      const testResult = await execAsync(`"${venvPython}" -c "import moshi; print('Moshi successfully installed')"`, {
        timeout: 10000
      });
      console.log(chalk.green(`   ✅ ${testResult.stdout.trim()}`));
    } catch (testError) {
      console.log(chalk.red('   ❌ Moshi test failed:'));
      console.log(chalk.red(`   ${testError.message}`));
      console.log(chalk.yellow('   ⚠️  Installation may be incomplete'));
    }
    
    console.log(chalk.green('   ✅ Basic installation completed'));
    console.log(chalk.yellow('   ⚠️  Some advanced features may not work without sentencepiece'));
  }

  async installKyutaiWithConda() {
    console.log(chalk.cyan('\n📦 Installing Kyutai TTS with Conda...'));
    
    try {
      // Step 1: Check if conda is available
      console.log(chalk.gray('📋 Step 1/3: Checking Conda availability...'));
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      await execAsync('conda --version');
      console.log(chalk.green('✅ Conda found'));

      // Step 2: Create installation directory and clone repo
      console.log(chalk.gray('📋 Step 2/3: Setting up repository...'));
      const installDir = await this.createKyutaiInstallDir();
      await this.cloneKyutaiRepository(installDir);
      
      // Step 3: Install with conda
      console.log(chalk.gray('📋 Step 3/3: Installing dependencies with Conda...'));
      await this.tryCondaInstallation(installDir);
      
      console.log(chalk.green('\n🎉 Conda-based Kyutai TTS installation completed!'));
      return true;
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Conda installation failed: ${error.message}`));
      console.log(chalk.yellow('💡 Falling back to smart installation...'));
      return await this.installKyutai();
    }
  }

  async installKyutaiWithDocker() {
    console.log(chalk.cyan('\n🐳 Installing Kyutai TTS with Docker...'));
    
    try {
      // Step 1: Check Docker availability
      console.log(chalk.gray('📋 Step 1/4: Checking Docker availability...'));
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      await execAsync('docker --version');
      console.log(chalk.green('✅ Docker found'));

      // Step 2: Create installation directory
      console.log(chalk.gray('📋 Step 2/4: Creating installation directory...'));
      const installDir = await this.createKyutaiInstallDir();
      
      // Step 3: Create Docker setup
      console.log(chalk.gray('📋 Step 3/4: Creating Docker environment...'));
      await this.createKyutaiDockerSetup(installDir);
      
      // Step 4: Build Docker image
      console.log(chalk.gray('📋 Step 4/4: Building Docker image...'));
      console.log(chalk.yellow('⏳ This may take 10-15 minutes for first time...'));
      await this.buildKyutaiDockerImage(installDir);
      
      console.log(chalk.green('\n🎉 Docker-based Kyutai TTS installation completed!'));
      console.log(chalk.cyan('🔄 Restarting voice selection...'));
      
      return true;
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Docker installation failed: ${error.message}`));
      if (error.message.includes('docker --version')) {
        console.log(chalk.yellow('💡 Docker not found. Please install Docker Desktop first.'));
      }
      console.log(chalk.yellow('💡 Falling back to smart installation...'));
      return await this.installKyutai();
    }
  }

  async createKyutaiDockerSetup(installDir) {
    const path = require('path');
    const fs = require('fs-extra');
    
    // Create Dockerfile
    const dockerfile = `FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    git \\
    build-essential \\
    cmake \\
    pkg-config \\
    libprotobuf-dev \\
    protobuf-compiler \\
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Clone Kyutai repository
RUN git clone https://github.com/kyutai-labs/delayed-streams-modeling.git

# Install Python dependencies
WORKDIR /app/delayed-streams-modeling
RUN pip install --no-cache-dir \\
    torch \\
    torchaudio \\
    transformers \\
    numpy \\
    sounddevice \\
    einops \\
    aiohttp \\
    sphn \\
    sentencepiece \\
    moshi==0.2.11

# Expose port for API
EXPOSE 8000

# Default command
CMD ["python", "scripts/tts_pytorch.py", "--help"]
`;

    await fs.writeFile(path.join(installDir, 'Dockerfile'), dockerfile);
    
    // Create docker-compose.yml
    const dockerCompose = `version: '3.8'
services:
  kyutai-tts:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./input:/app/input
      - ./output:/app/output
    environment:
      - PYTHONPATH=/app/delayed-streams-modeling
    command: tail -f /dev/null  # Keep container running
`;

    await fs.writeFile(path.join(installDir, 'docker-compose.yml'), dockerCompose);
    
    // Create input/output directories
    await fs.ensureDir(path.join(installDir, 'input'));
    await fs.ensureDir(path.join(installDir, 'output'));
  }

  async buildKyutaiDockerImage(installDir) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Build Docker image
    await execAsync('docker-compose build', { 
      cwd: installDir,
      timeout: 900000 // 15 minutes timeout
    });
    
    // Start container
    await execAsync('docker-compose up -d', { 
      cwd: installDir,
      timeout: 60000
    });
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

  // Advanced sentencepiece installation with multiple fallback strategies
  async installSentencepieceWithFallbacks(venvPip, venvPython) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const strategies = [
      // Strategy 1: Pre-built wheel
      {
        name: 'pre-built wheel',
        command: `"${venvPip}" install --only-binary=all sentencepiece`
      },
      // Strategy 2: With protobuf first
      {
        name: 'with protobuf',
        command: async () => {
          await execAsync(`"${venvPip}" install protobuf`, { timeout: 60000 });
          await execAsync(`"${venvPip}" install --no-cache-dir sentencepiece`, { timeout: 300000 });
        }
      },
      // Strategy 3: Force rebuild
      {
        name: 'force rebuild',
        command: `"${venvPip}" install --force-reinstall --no-binary sentencepiece sentencepiece`
      },
      // Strategy 4: Alternative version
      {
        name: 'alternative version',
        command: `"${venvPip}" install sentencepiece==0.1.99`
      },
      // Strategy 5: From conda-forge if available
      {
        name: 'conda-forge fallback',
        command: async () => {
          try {
            await execAsync('conda install -c conda-forge sentencepiece -y', { timeout: 180000 });
          } catch (condaError) {
            throw new Error('Conda not available');
          }
        }
      }
    ];

    for (const strategy of strategies) {
      try {
        console.log(chalk.gray(`     Trying ${strategy.name}...`));
        
        if (typeof strategy.command === 'function') {
          await strategy.command();
        } else {
          await execAsync(strategy.command, { timeout: 300000 });
        }
        
        // Test if sentencepiece works
        await execAsync(`"${venvPython}" -c "import sentencepiece; print('sentencepiece OK')"`, { timeout: 5000 });
        console.log(chalk.green(`     ✅ sentencepiece installed via ${strategy.name}`));
        return true;
        
      } catch (error) {
        console.log(chalk.yellow(`     ❌ ${strategy.name} failed`));
        continue;
      }
    }
    
    console.log(chalk.red('     ❌ All sentencepiece installation strategies failed'));
    console.log(chalk.yellow('     ⚠️  Moshi may have limited functionality'));
    return false;
  }
}

module.exports = AudiobookMaker;