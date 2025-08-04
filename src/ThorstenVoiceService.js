const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const os = require('os');
const { getPreviewText, detectVoiceLanguage, getPreviewCacheFilename } = require('./PreviewTexts');

const execAsync = promisify(exec);

class ThorstenVoiceService {
  constructor(cachePath) {
    this.cachePath = cachePath;
    this.thorstenPath = null;
    this.isInstalled = false;
    this.modelName = 'tts_models/de/thorsten/vits';
  }

  getVoices() {
    return [
      {
        name: '🇩🇪 Thorsten (Authentic German Male)',
        value: 'thorsten-male',
        language: 'de',
        description: 'High-quality native German voice',
      },
      {
        name: '🇩🇪 Thorsten Emotional (German Male)',
        value: 'thorsten-emotional',
        language: 'de',
        description: 'German voice with emotional expression',
      },
    ];
  }

  async processTextChunks(chunks, options, onProgress) {
    console.log(chalk.cyan('🇩🇪 Processing text with Thorsten-Voice...'));

    // Check if Thorsten Voice is available first
    if (!await this.isAvailable()) {
      throw new Error('Thorsten-Voice not available. Please install Thorsten-Voice first.');
    }

    const audioFiles = [];
    const outputDir = options.outputDir || this.cachePath;

    await fs.ensureDir(outputDir);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNumber = String(i + 1).padStart(3, '0');
      const outputFile = path.join(outputDir, `chunk_${chunkNumber}.wav`);

      try {
        console.log(chalk.gray(`   Processing chunk ${i + 1}/${chunks.length}...`));
        await this.generateAudioFile(chunk.trim(), outputFile, options.voice);

        audioFiles.push(outputFile);

        if (onProgress) {
          onProgress({
            current: i + 1,
            total: chunks.length,
            filePath: outputFile,
          });
        }
      } catch (error) {
        console.log(chalk.red(`❌ Error processing chunk ${i + 1}: ${error.message}`));
        throw error;
      }
    }

    console.log(chalk.green(`✅ Generated ${audioFiles.length} audio files`));
    return audioFiles;
  }

  async generateVoicePreview(voice, options = {}) {
    console.log(chalk.cyan('🇩🇪 Generating voice preview...'));

    try {
      // Check if Thorsten Voice is available first
      if (!await this.isAvailable()) {
        throw new Error('Thorsten-Voice not available. Please install Thorsten-Voice first.');
      }

      // Detect voice language and get appropriate preview text
      const language = detectVoiceLanguage(voice);
      const previewText = getPreviewText(language, 'short');
      
      // Use consistent cache filename
      const cacheFilename = getPreviewCacheFilename('thorsten', voice, language);
      const previewFile = path.join(this.cachePath, 'previews', cacheFilename);

      // Check cache first
      if (await fs.pathExists(previewFile)) {
        return previewFile;
      }

      // Ensure preview directory exists
      await fs.ensureDir(path.dirname(previewFile));

      await this.generateAudioFile(previewText.trim(), previewFile, voice);
      return previewFile;
    } catch (error) {
      console.log(chalk.red(`❌ Error generating preview: ${error.message}`));
      return null;
    }
  }

  async combineAudioFiles(audioFiles, outputPath) {
    console.log(chalk.cyan('🔗 Combining audio files with ffmpeg...'));

    try {
      await this.checkFfmpeg();

      const fileListPath = path.join(this.cachePath, 'file_list.txt');
      const fileListContent = audioFiles.map((file) => `file '${file}'`).join('\n');
      await fs.writeFile(fileListPath, fileListContent);

      await execAsync(`ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}"`);
      await fs.remove(fileListPath);

      console.log(chalk.green('✅ Audio files combined successfully'));
      return outputPath;
    } catch (error) {
      console.log(chalk.red(`❌ Error combining audio files: ${error.message}`));
      throw error;
    }
  }

  async generateAudioFile(text, outputFile, _voice) {
    if (!this.isInstalled) {
      throw new Error('Thorsten-Voice not installed. Please run installation first.');
    }

    const pythonCommand = await this.getPythonCommand();

    // Create a temporary Python script to handle multiline text safely using base64
    const textBase64 = Buffer.from(text).toString('base64');
    const scriptContent = `
import TTS
from TTS.api import TTS
import base64

# Initialize TTS model
tts = TTS('${this.modelName}')

# Decode base64 text to handle special characters and newlines safely
text_base64 = '${textBase64}'
text = base64.b64decode(text_base64).decode('utf-8')

# Generate speech
tts.tts_to_file(text=text, file_path='${outputFile}')
print("TTS generation completed successfully")
`;

    const scriptPath = path.join(this.thorstenPath, 'temp_tts_script.py');
    await fs.writeFile(scriptPath, scriptContent);

    try {
      await execAsync(`"${pythonCommand}" "${scriptPath}"`, {
        cwd: this.thorstenPath,
        timeout: 60000,
      });
      
      // Clean up temporary script
      await fs.remove(scriptPath);
    } catch (error) {
      // Clean up temporary script on error
      try {
        await fs.remove(scriptPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw new Error(`Thorsten-Voice generation failed: ${error.message}`);
    }
  }

  async isAvailable() {
    try {
      const installDir = path.join(os.homedir(), '.aiabm', 'thorsten-voice');
      
      // Check if installation marker exists
      const installMarker = path.join(installDir, '.installation_complete');
      if (!await fs.pathExists(installMarker)) {
        console.log(chalk.yellow('⚠️  Thorsten-Voice not installed'));
        return false;
      }

      // Read installation info
      try {
        const installInfo = JSON.parse(await fs.readFile(installMarker, 'utf8'));
        const installDate = new Date(installInfo.installedAt);
        const daysSince = Math.floor((new Date() - installDate) / (1000 * 60 * 60 * 24));
        console.log(chalk.gray(`   Installed: ${installInfo.version} (${daysSince} days ago)`));
      } catch (error) {
        // Ignore info reading errors
      }

      const pythonCommand = await this.getPythonCommand();

      try {
        // Check if TTS is installed
        const { stdout: ttsCheck } = await execAsync(`${pythonCommand} -c "import TTS; print('TTS available')"`, { timeout: 5000 });
        console.log(chalk.gray(`   ${ttsCheck.trim()}`));

        // Check if Thorsten model is available
        const { stdout: modelCheck } = await execAsync(
          `${pythonCommand} -c "from TTS.api import TTS; TTS('${this.modelName}'); print('Thorsten model available')"`,
          { timeout: 15000 }
        );
        console.log(chalk.gray(`   ${modelCheck.trim()}`));

        this.thorstenPath = installDir;
        this.isInstalled = true;
        console.log(chalk.green('✅ Thorsten-Voice is available'));
        return true;
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Thorsten-Voice check failed: ${error.message}`));
        console.log(chalk.gray('   This may indicate a virtual environment or model issue'));
        return false;
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Thorsten-Voice not found'));
      return false;
    }
  }

  async getPythonCommand() {
    const installDir = path.join(os.homedir(), '.aiabm', 'thorsten-voice');
    const venvPython = path.join(installDir, 'venv', 'bin', 'python');

    if (await fs.pathExists(venvPython)) {
      return venvPython;
    }

    // Fallback to system Python
    try {
      await execAsync('python --version');
      return 'python';
    } catch (error) {
      return 'python3';
    }
  }

  async checkFfmpeg() {
    try {
      await execAsync('ffmpeg -version');
    } catch (error) {
      throw new Error('ffmpeg not found. Please install ffmpeg to combine audio files.');
    }
  }

  async installThorsten() {
    console.log(chalk.cyan('🇩🇪 Installing Thorsten-Voice TTS...'));

    try {
      // Step 1: Check Python installation
      console.log(chalk.gray('📋 Step 1/4: Checking Python installation...'));
      await this.checkPythonInstallation();
      console.log(chalk.green('✅ Python found'));

      // Step 2: Create installation directory
      console.log(chalk.gray('📋 Step 2/4: Setting up installation directory...'));
      const installDir = await this.createInstallDir();
      console.log(chalk.green(`✅ Directory created: ${installDir}`));

      // Step 3: Create virtual environment
      console.log(chalk.gray('📋 Step 3/4: Creating virtual environment...'));
      await this.createVirtualEnvironment(installDir);
      console.log(chalk.green('✅ Virtual environment created'));

      // Step 4: Install TTS and Thorsten model
      console.log(chalk.gray('📋 Step 4/4: Installing TTS and Thorsten model...'));
      console.log(chalk.yellow('⏳ Downloading model (~500MB)...'));
      await this.installTTSAndModel(installDir);
      console.log(chalk.green('✅ TTS and model installed'));

      // Create installation marker
      const installMarker = path.join(installDir, '.installation_complete');
      await fs.writeFile(installMarker, JSON.stringify({
        version: '0.22.0',
        modelName: this.modelName,
        installedAt: new Date().toISOString(),
        pythonVersion: await this.checkPythonInstallation()
      }, null, 2));

      console.log(chalk.green('\n🎉 Thorsten-Voice installation completed!'));
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
    try {
      // First try to find a compatible Python version
      const compatibleVersions = ['python3.11', 'python3.10', 'python3.9'];
      
      for (const pythonCmd of compatibleVersions) {
        try {
          const { stdout } = await execAsync(`${pythonCmd} --version`);
          const version = stdout.trim();
          console.log(chalk.green(`   Found compatible Python: ${version}`));
          return version;
        } catch (error) {
          // Continue to next version
        }
      }

      // Fallback to default python/python3 but check version compatibility
      let version;
      try {
        const { stdout } = await execAsync('python --version');
        version = stdout.trim();
      } catch (error) {
        try {
          const { stdout } = await execAsync('python3 --version');
          version = stdout.trim();
        } catch (python3Error) {
          throw new Error('Python not found. Please install Python 3.9-3.11 from https://python.org');
        }
      }

      // Check if Python version is compatible with Coqui TTS
      const versionMatch = version.match(/Python (\d+)\.(\d+)/);
      if (!versionMatch) {
        throw new Error('Could not determine Python version');
      }

      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]);

      // Coqui TTS requires Python 3.9-3.11
      if (major < 3 || (major === 3 && minor < 9)) {
        throw new Error(`Coqui TTS requires Python 3.9+, found ${version}`);
      }
      
      if (major === 3 && minor >= 12) {
        throw new Error(`Coqui TTS requires Python 3.9-3.11, found ${version}. Please install Python 3.11: brew install python@3.11`);
      }

      console.log(chalk.yellow(`   Warning: Using ${version} - Coqui TTS works best with Python 3.9-3.11`));
      return version;
      
    } catch (error) {
      throw error;
    }
  }

  async createInstallDir() {
    const installDir = path.join(os.homedir(), '.aiabm', 'thorsten-voice');
    await fs.ensureDir(installDir);
    return installDir;
  }

  async createVirtualEnvironment(installDir) {
    const venvDir = path.join(installDir, 'venv');

    if (!(await fs.pathExists(venvDir))) {
      // Try to use compatible Python version first
      const compatibleVersions = ['python3.11', 'python3.10', 'python3.9'];
      let pythonCmd = null;
      
      for (const cmd of compatibleVersions) {
        try {
          await execAsync(`${cmd} --version`);
          pythonCmd = cmd;
          console.log(chalk.green(`   Using ${cmd} for Coqui TTS compatibility...`));
          break;
        } catch (error) {
          // Continue to next version
        }
      }
      
      if (!pythonCmd) {
        // Fallback to default python3, but this may fail later
        pythonCmd = 'python3';
        console.log(chalk.yellow('   No compatible Python 3.9-3.11 found, trying default python3...'));
        console.log(chalk.yellow('   Installation may fail. Consider: brew install python@3.11'));
      }
      
      await execAsync(`${pythonCmd} -m venv "${venvDir}"`);
    }

    return venvDir;
  }

  async installTTSAndModel(installDir) {
    const venvDir = path.join(installDir, 'venv');
    const venvPython = path.join(venvDir, 'bin', 'python');
    const venvPip = path.join(venvDir, 'bin', 'pip');

    // Upgrade pip
    await execAsync(`"${venvPython}" -m pip install --upgrade pip`);

    // Install TTS with specific version for Python compatibility
    console.log(chalk.gray('   Installing Coqui TTS...'));
    try {
      // First try the latest compatible version
      await execAsync(`"${venvPip}" install "TTS==0.22.0"`, { timeout: 300000 });
    } catch (error) {
      console.log(chalk.yellow('   Standard installation failed, trying alternative approach...'));
      
      // Install dependencies first
      await execAsync(`"${venvPip}" install numpy scipy`, { timeout: 120000 });
      await execAsync(`"${venvPip}" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu`, { timeout: 300000 });
      
      // Try installing TTS without strict version requirements
      try {
        await execAsync(`"${venvPip}" install --no-deps TTS`, { timeout: 300000 });
        await execAsync(`"${venvPip}" install librosa soundfile inflect`, { timeout: 120000 });
      } catch (e) {
        // Last resort: install from source
        console.log(chalk.yellow('   Installing from source...'));
        await execAsync(`"${venvPip}" install git+https://github.com/coqui-ai/TTS.git@v0.22.0`, { timeout: 600000 });
      }
    }

    // Download and cache the Thorsten model
    console.log(chalk.gray('   Downloading Thorsten model...'));
    try {
      await execAsync(
        `"${venvPython}" -c "from TTS.api import TTS; TTS('${this.modelName}'); print('Model cached successfully')"`,
        { timeout: 600000 }
      );
    } catch (error) {
      console.log(chalk.yellow('   Model download via API failed, trying direct download...'));
      // Alternative: Download model files directly
      await this.downloadThorstenModelDirect(installDir);
    }

    this.thorstenPath = installDir;
    this.isInstalled = true;
  }

  async downloadThorstenModelDirect(installDir) {
    const modelsDir = path.join(installDir, 'models');
    await fs.ensureDir(modelsDir);

    // Download model files directly using wget or curl
    const modelUrl = 'https://github.com/thorstenMueller/Thorsten-Voice/releases/download/v0.1/thorsten_vits.zip';
    const modelPath = path.join(modelsDir, 'thorsten_vits.zip');

    console.log(chalk.gray('   Downloading Thorsten model directly...'));
    try {
      // Try wget first
      await execAsync(`wget -O "${modelPath}" "${modelUrl}"`, { timeout: 300000 });
    } catch (error) {
      // Try curl as fallback
      await execAsync(`curl -L -o "${modelPath}" "${modelUrl}"`, { timeout: 300000 });
    }

    // Extract the model
    await execAsync(`unzip -o "${modelPath}" -d "${modelsDir}"`, { timeout: 60000 });
    await fs.remove(modelPath);
  }

  // Method for concatenating audio files (alias for combineAudioFiles)
  async concatenateAudioFiles(audioFiles, outputPath) {
    return this.combineAudioFiles(audioFiles, outputPath);
  }

  getInstallationGuide() {
    return {
      title: 'Thorsten-Voice Installation',
      steps: [
        '1. Python 3.8+ and pip required',
        '2. Install Coqui TTS:',
        '   pip install TTS',
        '3. The Thorsten model will be downloaded automatically',
        '4. Test installation:',
        '   tts --text "Hallo Welt" --model_name "tts_models/de/thorsten/vits" --out_path test.wav',
      ],
      links: [
        'Coqui TTS: https://github.com/coqui-ai/TTS',
        'Thorsten Voice: https://github.com/thorstenMueller/Thorsten-Voice',
        'Models: https://huggingface.co/Thorsten/Thorsten_TTS',
      ],
    };
  }

  showManualInstallation() {
    console.log(chalk.cyan('\n📋 Manual Installation Guide:'));
    console.log(chalk.yellow('⚠️  Important: Coqui TTS requires Python 3.9-3.11 (not 3.13+)'));
    console.log(chalk.white('1. Install Python 3.11 and pip:'));
    console.log(chalk.gray('   brew install python@3.11  # macOS'));
    console.log(chalk.gray('   sudo apt install python3.11 python3.11-pip  # Ubuntu'));
    console.log(chalk.white('2. Create virtual environment:'));
    console.log(chalk.gray('   python3.11 -m venv thorsten-env'));
    console.log(chalk.gray('   source thorsten-env/bin/activate'));
    console.log(chalk.white('3. Install Coqui TTS:'));
    console.log(chalk.gray('   pip install TTS==0.22.0'));
    console.log(chalk.white('4. Test installation:'));
    console.log(
      chalk.gray('   tts --text "Hallo Welt" --model_name "tts_models/de/thorsten/vits" --out_path test.wav')
    );
    console.log(chalk.gray('\nLinks:'));
    console.log(chalk.gray('   Coqui TTS: https://github.com/coqui-ai/TTS'));
    console.log(chalk.gray('   Thorsten Voice: https://github.com/thorstenMueller/Thorsten-Voice\n'));
  }

  // Enhanced availability check
  async isAvailableWithInstallation() {
    const available = await this.isAvailable();
    if (!available) {
      console.log(chalk.yellow('⚠️  Thorsten-Voice not found. Starting installation...'));
      return await this.installThorsten();
    }
    return true;
  }

  async checkForUpdates() {
    try {
      const installDir = path.join(os.homedir(), '.aiabm', 'thorsten-voice');
      const installMarker = path.join(installDir, '.installation_complete');
      
      if (!await fs.pathExists(installMarker)) {
        return { needsUpdate: false, reason: 'Not installed' };
      }

      const installInfo = JSON.parse(await fs.readFile(installMarker, 'utf8'));
      const installDate = new Date(installInfo.installedAt);
      const daysSince = Math.floor((new Date() - installDate) / (1000 * 60 * 60 * 24));
      
      // Consider update if installation is older than 30 days
      if (daysSince > 30) {
        return { 
          needsUpdate: true, 
          reason: `Installation is ${daysSince} days old`,
          currentVersion: installInfo.version 
        };
      }
      
      return { needsUpdate: false, daysSince, currentVersion: installInfo.version };
    } catch (error) {
      return { needsUpdate: false, reason: 'Could not check version' };
    }
  }
}

module.exports = ThorstenVoiceService;