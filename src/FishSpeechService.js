const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const os = require('os');

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

  async generateVoicePreview(voice, text = 'This is a preview of the selected voice.') {
    console.log(chalk.cyan('🐟 Generating voice preview...'));

    try {
      const previewFile = path.join(this.cachePath, 'voice_preview.wav');
      await fs.ensureDir(this.cachePath);

      await this.generateAudioFile(text.trim(), previewFile, voice);
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

    // Create Python script for Fish Speech generation
    const generateScript = `
import sys
sys.path.append("${fishDir}")

import torch
import soundfile as sf
from fish_speech.models.vqgan import VQGAN
from fish_speech.models.text2semantic import TextToSemantic
from fish_speech.text import clean_text

# Load models
print("Loading Fish Speech models...")
device = "cuda" if torch.cuda.is_available() else "cpu"

# Initialize models
vqgan = VQGAN.from_pretrained("${modelsDir}/fish-speech-1.2/vqgan")
t2s = TextToSemantic.from_pretrained("${modelsDir}/fish-speech-1.2/text2semantic")

vqgan = vqgan.to(device)
t2s = t2s.to(device)

# Clean and prepare text
text = """${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""
cleaned_text = clean_text(text)

# Generate semantic tokens
print("Generating semantic tokens...")
semantic_tokens = t2s.generate(
    cleaned_text,
    temperature=0.7,
    top_p=0.8,
    voice_preset="${voice}"
)

# Generate audio
print("Generating audio...")
audio = vqgan.decode(semantic_tokens)

# Save audio
sf.write("${outputFile}", audio.cpu().numpy(), 24000)
print("Audio saved successfully!")
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
    # Try to import Fish Speech modules
    from fish_speech.models.vqgan import VQGAN
    print("✓ VQGAN module available")
    
    from fish_speech.models.text2semantic import TextToSemantic  
    print("✓ TextToSemantic module available")
    
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
        
        console.log(chalk.gray('   This may indicate a virtual environment or dependency issue'));
        console.log(chalk.yellow('   💡 Try running the app again or check the manual installation'));
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
    await execAsync(`"${venvPython}" -m pip install --upgrade pip`);

    // Install Fish Speech dependencies
    console.log(chalk.gray('   Installing PyTorch...'));
    await execAsync(`"${venvPip}" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu`, { timeout: 300000 });

    console.log(chalk.gray('   Installing Fish Speech requirements...'));
    // First install basic dependencies
    await execAsync(`"${venvPip}" install numpy scipy matplotlib`, { timeout: 120000 });
    await execAsync(`"${venvPip}" install transformers accelerate soundfile librosa`, { timeout: 300000 });
    await execAsync(`"${venvPip}" install huggingface-hub tokenizers`, { timeout: 120000 });
    
    // Try to install from requirements.txt if it exists
    const requirementsPath = path.join(repoDir, 'requirements.txt');
    if (await fs.pathExists(requirementsPath)) {
      try {
        await execAsync(`"${venvPip}" install -r requirements.txt`, { 
          cwd: repoDir,
          timeout: 600000 
        });
      } catch (error) {
        console.log(chalk.yellow('   Some requirements failed, continuing with basic packages...'));
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
