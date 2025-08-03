const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const os = require('os');
const { getPreviewText, detectVoiceLanguage, getPreviewCacheFilename } = require('./PreviewTexts');

const execAsync = promisify(exec);

class FishSpeechService {
  constructor(cachePath) {
    this.cachePath = cachePath;
    this.fishSpeechPath = null;
    this.isInstalled = false;
  }

  getVoices() {
    return [
      // German voices
      { name: '🇩🇪 German Female (Natural)', value: 'de-female-1', language: 'de' },
      { name: '🇩🇪 German Male (Clear)', value: 'de-male-1', language: 'de' },
      { name: '🇩🇪 German Female (Expressive)', value: 'de-female-2', language: 'de' },

      // English voices
      { name: '🇺🇸 English Female (Warm)', value: 'en-female-1', language: 'en' },
      { name: '🇺🇸 English Male (Professional)', value: 'en-male-1', language: 'en' },
      { name: '🇺🇸 English Female (Energetic)', value: 'en-female-2', language: 'en' },

      // French voices
      { name: '🇫🇷 French Female (Elegant)', value: 'fr-female-1', language: 'fr' },
      { name: '🇫🇷 French Male (Sophisticated)', value: 'fr-male-1', language: 'fr' },
    ];
  }

  async processTextChunks(chunks, options, onProgress) {
    console.log(chalk.cyan('🐟 Processing text with Fish Speech...'));

    // Check if Fish Speech is available first
    if (!await this.isAvailable()) {
      throw new Error('Fish Speech not available. Please install Fish Speech first.');
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
    console.log(chalk.cyan('🐟 Generating voice preview...'));

    try {
      // Check if Fish Speech is available first
      if (!await this.isAvailable()) {
        throw new Error('Fish Speech not available. Please install Fish Speech first.');
      }

      // Detect voice language and get appropriate preview text
      const language = detectVoiceLanguage(voice);
      const previewText = getPreviewText(language, 'short');
      
      // Use consistent cache filename
      const cacheFilename = getPreviewCacheFilename('fishspeech', voice, language);
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
      const fileListContent = audioFiles.map((file) => `file '${file}'`).join('\\n');
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

  async generateAudioFile(text, outputFile, voice) {
    if (!this.isInstalled) {
      throw new Error('Fish Speech not installed. Please run installation first.');
    }

    const pythonCommand = await this.getPythonCommand();
    const fishDir = path.join(this.fishSpeechPath, 'fish-speech');
    const modelsDir = path.join(this.fishSpeechPath, 'models');

    // Create Python script for Fish Speech generation using official webui approach
    const generateScript = `
import sys
import os
import pyrootutils

# Setup Fish Speech environment
fish_root = "${fishDir}"
sys.path.insert(0, fish_root)
pyrootutils.setup_root(fish_root, indicator=".project-root", pythonpath=True)

import torch
import torchaudio
from fish_speech.inference_engine import TTSInferenceEngine
from fish_speech.models.dac.inference import load_model as load_decoder_model
from fish_speech.models.text2semantic.inference import launch_thread_safe_queue
from fish_speech.utils.schema import ServeTTSRequest

print("🐟 Initializing Fish Speech TTS...")

try:
    # Device detection  
    if torch.backends.mps.is_available():
        device = "mps"
        print("✓ Using MPS (Apple Silicon)")
    elif torch.cuda.is_available():
        device = "cuda"
        print("✓ Using CUDA GPU")
    else:
        device = "cpu"
        print("✓ Using CPU")
    
    precision = torch.half if device in ["cuda", "mps"] else torch.float32
    
    # Load models using official approach
    print("Loading text-to-semantic model...")
    llama_checkpoint_path = "${modelsDir}/fish-speech-1.2"
    
    llama_queue = launch_thread_safe_queue(
        checkpoint_path=llama_checkpoint_path,
        device=device,
        precision=precision,
        compile=False
    )
    print("✓ Text-to-semantic model loaded")
    
    print("Loading decoder model...")
    decoder_checkpoint_path = "${modelsDir}/fish-speech-1.2/firefly-gan-vq-fsq-4x1024-42hz-generator.pth"
    
    # Use firefly_gan_vq config - matched to firefly-gan-vq-fsq-4x1024 model
    decoder_model = load_decoder_model(
        config_name="firefly_gan_vq",
        checkpoint_path=decoder_checkpoint_path,
        device=device
    )
    print("✓ Decoder model loaded")
    
    # Create inference engine
    engine = TTSInferenceEngine(
        llama_queue=llama_queue,
        decoder_model=decoder_model,
        precision=precision,
        compile=False
    )
    print("✓ TTS inference engine ready")
    
    # Prepare text
    input_text = """${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""
    print(f"✓ Processing text: {input_text[:50]}...")
    
    # Create TTS request
    req = ServeTTSRequest(
        text=input_text,
        reference_id=None,
        references=[],
        max_new_tokens=2048,
        chunk_length=100,
        top_p=0.8,
        repetition_penalty=1.1,
        temperature=0.7,
        seed=None,
        use_memory_cache="on"
    )
    
    # Generate audio
    print("Generating audio...")
    audio_data = None
    sample_rate = 44100  # Default Fish Speech sample rate
    
    for result in engine.inference(req):
        if result.code == "final":
            audio_data = result.audio
            break
        elif result.code == "error":
            raise Exception(f"TTS generation error: {result.error}")
    
    if audio_data is None:
        raise Exception("No audio data generated")
    
    # Handle audio data format
    if isinstance(audio_data, tuple):
        sample_rate, audio_tensor = audio_data
    else:
        audio_tensor = audio_data
    
    # Ensure correct tensor format for torchaudio
    if not isinstance(audio_tensor, torch.Tensor):
        audio_tensor = torch.tensor(audio_tensor, dtype=torch.float32)
    
    # Make sure tensor has correct shape (channels, samples)
    if audio_tensor.dim() == 1:
        audio_tensor = audio_tensor.unsqueeze(0)  # Add channel dimension
    
    print(f"✓ Audio generated: {audio_tensor.shape} at {sample_rate}Hz")
    
    # Save audio
    print("Saving audio...")
    torchaudio.save("${outputFile}", audio_tensor, sample_rate)
    print("✅ Audio generation completed!")
    
except Exception as e:
    print(f"❌ Error during generation: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;

    const scriptPath = path.join(this.fishSpeechPath, 'generate_tts.py');
    await fs.writeFile(scriptPath, generateScript);

    try {
      await execAsync(`"${pythonCommand}" "${scriptPath}"`, {
        cwd: this.fishSpeechPath,
        timeout: 120000, // 2 minutes timeout
      });
      await fs.remove(scriptPath);
    } catch (error) {
      await fs.remove(scriptPath);
      throw new Error(`Fish Speech generation failed: ${error.message}`);
    }
  }

  async isAvailable() {
    try {
      const installDir = path.join(os.homedir(), '.aiabm', 'fish-speech');
      
      // Check if installation marker exists
      const installMarker = path.join(installDir, '.installation_complete');
      if (!await fs.pathExists(installMarker)) {
        console.log(chalk.yellow('⚠️  Fish Speech not installed'));
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

      const fishDir = path.join(installDir, 'fish-speech');
      const modelsDir = path.join(installDir, 'models', 'fish-speech-1.2');
      
      // Check if directories exist
      if (!await fs.pathExists(fishDir) || !await fs.pathExists(modelsDir)) {
        console.log(chalk.yellow('⚠️  Fish Speech directories not found'));
        return false;
      }

      // Get the correct Python command (should use venv if available)
      const pythonCommand = await this.getPythonCommand();
      console.log(chalk.gray(`   Using Python: ${pythonCommand}`));

      // Simplified dependency check - just verify basic imports work
      const checkScript = `
import sys
import os

# Add fish-speech to path
sys.path.insert(0, "${fishDir}")

try:
    print("Checking basic dependencies...")
    import torch
    print("✓ torch available")
    
    import soundfile
    print("✓ soundfile available")
    
    print("Checking Fish Speech modules...")
    # Import current Fish Speech modules (DAC-based architecture)
    import fish_speech
    print("✓ fish_speech package available")
    
    # Import from inference engine directly
    from fish_speech.inference_engine import DAC, TTSInferenceEngine
    print("✓ DAC codec available")
    print("✓ TTS inference engine available")
    
    # Check schema imports
    from fish_speech.utils.schema import ServeTTSRequest
    print("✓ ServeTTSRequest schema available")
    
    print("All dependencies verified successfully!")
    
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
except Exception as e:
    print(f"❌ Unexpected error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;

      const scriptPath = path.join(installDir, 'check_deps.py');
      await fs.writeFile(scriptPath, checkScript);

      try {
        const { stdout, stderr } = await execAsync(`"${pythonCommand}" "${scriptPath}"`, { 
          timeout: 20000,
          cwd: installDir 
        });
        await fs.remove(scriptPath);
        
        // Show the detailed output
        stdout.split('\n').forEach(line => {
          if (line.trim()) {
            console.log(chalk.gray(`   ${line.trim()}`));
          }
        });
        
        this.fishSpeechPath = installDir;
        this.isInstalled = true;
        console.log(chalk.green('✅ Fish Speech is available'));
        return true;
      } catch (error) {
        await fs.remove(scriptPath);
        console.log(chalk.yellow(`⚠️  Fish Speech dependencies check failed: ${error.message}`));
        
        // Show stderr if available for debugging
        if (error.stderr) {
          console.log(chalk.red(`   stderr: ${error.stderr}`));
        }
        
        console.log(chalk.gray('   This may indicate an incomplete or corrupted installation'));
        console.log(chalk.yellow('   💡 Try reinstalling Fish Speech to fix this issue'));
        
        // Remove installation marker since the installation is incomplete
        const installMarker = path.join(installDir, '.installation_complete');
        try {
          await fs.remove(installMarker);
          console.log(chalk.gray('   Installation marker removed - will allow reinstallation'));
        } catch (removeError) {
          // Ignore remove errors
        }
        
        return false;
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Fish Speech not found'));
      return false;
    }
  }

  async getPythonCommand() {
    const installDir = path.join(os.homedir(), '.aiabm', 'fish-speech');
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

  async installFishSpeech() {
    console.log(chalk.cyan('🐟 Installing Fish Speech TTS...'));

    try {
      // Step 1: Check Python installation
      console.log(chalk.gray('📋 Step 1/5: Checking Python installation...'));
      await this.checkPythonInstallation();
      console.log(chalk.green('✅ Python found'));

      // Step 2: Create installation directory
      console.log(chalk.gray('📋 Step 2/5: Setting up installation directory...'));
      const installDir = await this.createInstallDir();
      console.log(chalk.green(`✅ Directory created: ${installDir}`));

      // Step 3: Clone Fish Speech repository
      console.log(chalk.gray('📋 Step 3/5: Cloning Fish Speech repository...'));
      console.log(chalk.yellow('⏳ This may take a few minutes...'));
      await this.cloneFishSpeechRepository(installDir);
      console.log(chalk.green('✅ Repository cloned'));

      // Step 4: Create virtual environment and install dependencies
      console.log(chalk.gray('📋 Step 4/5: Installing dependencies...'));
      console.log(chalk.yellow('⏳ Installing PyTorch and Fish Speech packages...'));
      await this.installDependencies(installDir);
      console.log(chalk.green('✅ Dependencies installed'));

      // Step 5: Download models
      console.log(chalk.gray('📋 Step 5/5: Downloading Fish Speech models...'));
      console.log(chalk.yellow('⏳ Downloading models (~1GB)...'));
      await this.downloadModels(installDir);
      console.log(chalk.green('✅ Models downloaded'));

      // Create installation marker
      const installMarker = path.join(installDir, '.installation_complete');
      await fs.writeFile(installMarker, JSON.stringify({
        version: '1.2',
        installedAt: new Date().toISOString(),
        pythonVersion: await this.checkPythonInstallation()
      }, null, 2));

      console.log(chalk.green('\n🎉 Fish Speech installation completed!'));
      console.log(chalk.cyan('🔄 Restarting voice selection...'));

      this.fishSpeechPath = installDir;
      this.isInstalled = true;
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
      const { stdout } = await execAsync('python3 --version');
      const version = stdout.trim();
      
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
      throw new Error('Python 3.8+ not found. Please install Python from https://python.org');
    }
  }

  async createInstallDir() {
    const installDir = path.join(os.homedir(), '.aiabm', 'fish-speech');
    await fs.ensureDir(installDir);
    return installDir;
  }

  async cloneFishSpeechRepository(installDir) {
    const repoDir = path.join(installDir, 'fish-speech');
    
    // Check if repository already exists
    if (await fs.pathExists(repoDir)) {
      console.log(chalk.yellow('📁 Repository already exists, updating...'));
      await execAsync('git pull', { cwd: repoDir });
      return repoDir;
    }

    // Clone the repository
    const repoUrl = 'https://github.com/fishaudio/fish-speech.git';
    await execAsync(`git clone ${repoUrl}`, { cwd: installDir });
    
    return repoDir;
  }

  async installDependencies(installDir) {
    const venvDir = path.join(installDir, 'venv');
    const repoDir = path.join(installDir, 'fish-speech');

    // Create virtual environment if it doesn't exist
    if (!(await fs.pathExists(venvDir))) {
      console.log(chalk.gray('   Creating virtual environment...'));
      await execAsync(`python3 -m venv "${venvDir}"`);
    }

    const venvPython = path.join(venvDir, 'bin', 'python');
    const venvPip = path.join(venvDir, 'bin', 'pip');

    // Upgrade pip
    console.log(chalk.gray('   Upgrading pip...'));
    await execAsync(`"${venvPython}" -m pip install --upgrade pip`, { timeout: 120000 });

    // Install Fish Speech dependencies
    console.log(chalk.gray('   Installing PyTorch...'));
    await execAsync(`"${venvPip}" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu`, { timeout: 300000 });

    console.log(chalk.gray('   Installing basic dependencies...'));
    await execAsync(`"${venvPip}" install numpy scipy matplotlib`, { timeout: 120000 });
    await execAsync(`"${venvPip}" install transformers accelerate soundfile librosa`, { timeout: 300000 });
    await execAsync(`"${venvPip}" install huggingface-hub tokenizers`, { timeout: 120000 });
    
    // Install Fish Speech package itself
    console.log(chalk.gray('   Installing Fish Speech package...'));
    try {
      // First try installing from requirements.txt if it exists
      const requirementsPath = path.join(repoDir, 'requirements.txt');
      if (await fs.pathExists(requirementsPath)) {
        console.log(chalk.gray('   Installing from requirements.txt...'));
        await execAsync(`"${venvPip}" install -r requirements.txt`, { 
          cwd: repoDir,
          timeout: 600000 
        });
      }
      
      // Install the Fish Speech package in development mode
      console.log(chalk.gray('   Installing Fish Speech in development mode...'));
      await execAsync(`"${venvPip}" install -e .`, { 
        cwd: repoDir,
        timeout: 600000 
      });
      
    } catch (error) {
      console.log(chalk.yellow('   Requirements installation failed, trying alternative approach...'));
      
      // Fallback: Install essential packages manually
      console.log(chalk.gray('   Installing essential packages manually...'));
      await execAsync(`"${venvPip}" install einops fire hydra-core omegaconf rich typer natsort Cython`, { timeout: 300000 });
      
      // Try to install Fish Speech package directly
      try {
        await execAsync(`"${venvPip}" install -e .`, { 
          cwd: repoDir,
          timeout: 600000 
        });
      } catch (fallbackError) {
        console.log(chalk.yellow('   Could not install Fish Speech package, but continuing...'));
      }
    }
  }

  async downloadModels(installDir) {
    const venvDir = path.join(installDir, 'venv');
    const venvPython = path.join(venvDir, 'bin', 'python');
    const modelsDir = path.join(installDir, 'models');

    await fs.ensureDir(modelsDir);

    // Download Fish Speech models using Python script
    const downloadScript = `
import os
from huggingface_hub import snapshot_download

# Download Fish Speech base model
print("Downloading Fish Speech base model...")
snapshot_download(
    repo_id="fishaudio/fish-speech-1.2",
    local_dir="${modelsDir}/fish-speech-1.2",
    ignore_patterns=["*.md", "*.txt"]
)

print("Models downloaded successfully!")
`;

    const scriptPath = path.join(installDir, 'download_models.py');
    await fs.writeFile(scriptPath, downloadScript);

    await execAsync(`"${venvPython}" "${scriptPath}"`, { timeout: 1200000 }); // 20 minutes timeout
    await fs.remove(scriptPath);
  }

  showManualInstallation() {
    console.log(chalk.cyan('\n📋 Manual Installation Guide:'));
    console.log(chalk.white('1. Install Python 3.8+ and pip'));
    console.log(chalk.white('2. Clone Fish Speech repository:'));
    console.log(chalk.gray('   git clone https://github.com/fishaudio/fish-speech.git'));
    console.log(chalk.white('3. Create virtual environment:'));
    console.log(chalk.gray('   python3 -m venv fish-speech-env'));
    console.log(chalk.gray('   source fish-speech-env/bin/activate'));
    console.log(chalk.white('4. Install dependencies:'));
    console.log(chalk.gray('   pip install -r requirements.txt'));
    console.log(chalk.white('5. Download models from HuggingFace'));
    console.log(chalk.gray('   https://huggingface.co/fishaudio\n'));
  }

  async concatenateAudioFiles(audioFiles, outputPath) {
    return this.combineAudioFiles(audioFiles, outputPath);
  }

  getInstallationGuide() {
    return {
      title: 'Fish Speech Installation',
      steps: [
        '1. Python 3.8+ and pip required',
        '2. Clone repository:',
        '   git clone https://github.com/fishaudio/fish-speech.git',
        '3. Install dependencies:',
        '   pip install -r requirements.txt',
        '4. Download models from HuggingFace',
        '5. Test installation',
      ],
      links: [
        'Repository: https://github.com/fishaudio/fish-speech',
        'Models: https://huggingface.co/fishaudio',
      ],
    };
  }

  async checkForUpdates() {
    try {
      const installDir = path.join(os.homedir(), '.aiabm', 'fish-speech');
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

module.exports = FishSpeechService;
