const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

const execAsync = promisify(exec);

class KyutaiService {
  constructor(cachePath) {
    this.cachePath = cachePath;
    this.kyutaiPath = null; // Will be set when Kyutai is found/installed
  }

  async isAvailable() {
    try {
      const os = require('os');
      const installDir = path.join(os.homedir(), '.aiabm', 'kyutai-tts');
      const repoDir = path.join(installDir, 'delayed-streams-modeling');
      
      // Check if installation directory exists
      if (!await fs.pathExists(repoDir)) {
        console.log(chalk.gray('🔍 Kyutai repository not found'));
        return false;
      }
      
      // Check if main script exists
      const scriptPath = path.join(repoDir, 'scripts', 'tts_pytorch.py');
      if (!await fs.pathExists(scriptPath)) {
        console.log(chalk.gray('🔍 Kyutai TTS script not found'));
        return false;
      }
      
      // For now, if the repository and script exist, consider it available
      // We'll do a more thorough check during actual usage
      this.kyutaiPath = repoDir;
      console.log(chalk.green('✅ Kyutai TTS installation found'));
      return true;
      
      /* Disabled for now - too strict
      // Check if Python is available
      let pythonCommand = 'python3';
      try {
        await execAsync('python --version');
        pythonCommand = 'python';
      } catch (error) {
        try {
          await execAsync('python3 --version');
          pythonCommand = 'python3';
        } catch (python3Error) {
          console.log(chalk.gray('🔍 Python not found'));
          return false;
        }
      }
      
      // Check if basic dependencies are available in the repository context
      try {
        await execAsync(`${pythonCommand} -c "import torch, transformers"`, { cwd: repoDir });
        this.kyutaiPath = repoDir;
        console.log(chalk.green('✅ Kyutai TTS fully available'));
        return true;
      } catch (error) {
        console.log(chalk.yellow('⚠️  Kyutai installed but dependencies missing'));
        return false;
      }
      */
    } catch (error) {
      console.log(chalk.red(`❌ Kyutai availability check failed: ${error.message}`));
      return false;
    }
  }

  getVoices() {
    return [
      // VCTK English voices (popular dataset)
      { name: '🇺🇸 VCTK p225 (Young Female)', value: 'vctk/p225_023_mic1.flac' },
      { name: '🇺🇸 VCTK p226 (Male)', value: 'vctk/p226_023_mic1.flac' },
      { name: '🇺🇸 VCTK p227 (Male)', value: 'vctk/p227_023_mic1.flac' },
      { name: '🇺🇸 VCTK p228 (Female)', value: 'vctk/p228_023_mic1.flac' },
      { name: '🇺🇸 VCTK p229 (Female)', value: 'vctk/p229_023_mic1.flac' },
      { name: '🇺🇸 VCTK p230 (Female)', value: 'vctk/p230_023_mic1.flac' },
      
      // Expresso dataset (conversational)
      { name: '🎭 Expresso Happy', value: 'expresso/ex03-ex01_happy_001_channel1_334s.wav' },
      { name: '🎭 Expresso Narration', value: 'expresso/ex03-ex02_narration_001_channel1_674s.wav' },
      { name: '🎭 Expresso Confused', value: 'expresso/ex04-ex01_confused_001_channel1_334s.wav' },
      { name: '🎭 Expresso Enunciated', value: 'expresso/ex04-ex02_enunciated_001_channel1_674s.wav' },
      
      // EARS dataset
      { name: '🎤 EARS p003 (Calm)', value: 'ears/p003_freeform_speech_01.wav' },
      { name: '🎤 EARS p031 (Energetic)', value: 'ears/p031_freeform_speech_01.wav' },
      
      // French voices
      { name: '🇫🇷 French Speaker 1', value: 'cml_tts/cml_tts_speaker_1.wav' },
      { name: '🇫🇷 French Speaker 2', value: 'cml_tts/cml_tts_speaker_2.wav' },
      
      // Voice cloning option
      { name: '🎯 Custom Voice (Clone from sample)', value: 'custom_clone' }
    ];
  }

  async processTextChunks(chunks, options, onProgress) {
    console.log(chalk.cyan('🎙️ Processing text with Kyutai TTS...'));
    
    const audioFiles = [];
    const outputDir = options.outputDir || this.cachePath;
    const voice = this.mapVoiceToKyutai(options.voice);
    
    // Ensure output directory exists
    await fs.ensureDir(outputDir);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNumber = String(i + 1).padStart(3, '0');
      const inputFile = path.join(this.cachePath, `chunk_${chunkNumber}_input.txt`);
      const outputFile = path.join(outputDir, `chunk_${chunkNumber}.wav`);
      
      try {
        // Write text chunk to temporary file
        await fs.writeFile(inputFile, chunk.trim());
        
        // Call Kyutai TTS script
        console.log(chalk.gray(`   Processing chunk ${i + 1}/${chunks.length}...`));
        await this.generateAudioFile(inputFile, outputFile, voice);
        
        // Clean up input file
        await fs.remove(inputFile);
        
        audioFiles.push(outputFile);
        
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: chunks.length,
            filePath: outputFile
          });
        }
        
      } catch (error) {
        console.log(chalk.red(`❌ Error processing chunk ${i + 1}: ${error.message}`));
        // Clean up on error
        await fs.remove(inputFile).catch(() => {});
        throw error;
      }
    }
    
    console.log(chalk.green(`✅ Generated ${audioFiles.length} audio files`));
    return audioFiles;
  }

  async generateVoicePreview(voice, text = 'This is a preview of the selected voice.') {
    console.log(chalk.cyan('🎙️ Generating voice preview...'));
    
    try {
      const previewFile = path.join(this.cachePath, 'voice_preview.wav');
      const inputFile = path.join(this.cachePath, 'preview_text.txt');
      
      // Ensure cache directory exists
      await fs.ensureDir(this.cachePath);
      
      // Write preview text
      await fs.writeFile(inputFile, text.trim());
      
      // Generate preview
      const kyutaiVoice = this.mapVoiceToKyutai(voice);
      await this.generateAudioFile(inputFile, previewFile, kyutaiVoice);
      
      // Clean up input file
      await fs.remove(inputFile);
      
      return previewFile;
    } catch (error) {
      console.log(chalk.red(`❌ Error generating preview: ${error.message}`));
      return null;
    }
  }

  async combineAudioFiles(audioFiles, outputPath) {
    console.log(chalk.cyan('🔗 Combining audio files with ffmpeg...'));
    
    try {
      // Check if ffmpeg is available
      await this.checkFfmpeg();
      
      // Create a temporary file list for ffmpeg
      const fileListPath = path.join(this.cachePath, 'file_list.txt');
      const fileListContent = audioFiles.map(file => `file '${file}'`).join('\n');
      await fs.writeFile(fileListPath, fileListContent);
      
      // Combine files using ffmpeg
      await execAsync(`ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}"`);
      
      // Clean up file list
      await fs.remove(fileListPath);
      
      console.log(chalk.green('✅ Audio files combined successfully'));
      return outputPath;
    } catch (error) {
      console.log(chalk.red(`❌ Error combining audio files: ${error.message}`));
      throw error;
    }
  }

  // Future implementation methods
  async setupVoiceCloning(sampleAudioPath) {
    console.log(chalk.cyan('🎯 Voice cloning setup...'));
    console.log(chalk.yellow('⚠️  Voice cloning not yet implemented'));
    
    // Would process the audio sample and create voice embedding
    return null;
  }

  async installKyutai() {
    console.log(chalk.cyan('🔧 Installing Kyutai TTS...'));
    console.log(chalk.yellow('⚠️  Automatic installation not yet implemented'));
    
    // Future: Download and install Kyutai TTS
    // - Clone repository
    // - Install Python dependencies
    // - Download model weights
    // - Set up configuration
    
    return false;
  }

  getInstallationGuide() {
    return {
      title: 'Kyutai TTS Manual Installation',
      steps: [
        '1. Install Python 3.8+ and pip',
        '2. Clone repository:',
        '   git clone https://github.com/kyutai-labs/delayed-streams-modeling.git',
        '3. Install dependencies:',
        '   pip install torch torchaudio transformers',
        '4. Follow setup instructions in the repository',
        '5. Test installation with example scripts'
      ],
      links: [
        'Repository: https://github.com/kyutai-labs/delayed-streams-modeling',
        'Model: https://huggingface.co/kyutai/tts-1.6b-en_fr',
        'Voices: https://huggingface.co/kyutai/tts-voices'
      ]
    };
  }

  // Helper method to generate audio file using Kyutai TTS
  async generateAudioFile(inputFile, outputFile, voice) {
    const scriptPath = path.join(this.kyutaiPath, 'scripts', 'tts_pytorch.py');
    
    // Determine Python command
    let pythonCommand = 'python3';
    try {
      await execAsync('python --version');
      pythonCommand = 'python';
    } catch (error) {
      // Use python3 as fallback
    }
    
    // Build command
    const cmd = [
      pythonCommand,
      `"${scriptPath}"`,
      `"${inputFile}"`,
      `"${outputFile}"`,
      `--voice "${voice}"`,
      '--device cpu' // Use CPU for compatibility, can be made configurable
    ].join(' ');
    
    try {
      await execAsync(cmd, { 
        cwd: this.kyutaiPath,
        timeout: 60000 // 1 minute timeout per chunk
      });
    } catch (error) {
      // If CUDA error, retry with CPU explicitly
      if (error.message.includes('CUDA') || error.message.includes('gpu')) {
        console.log(chalk.yellow('⚠️  GPU error, retrying with CPU...'));
        const cpuCmd = cmd.replace('--device cpu', '--device cpu');
        await execAsync(cpuCmd, { 
          cwd: this.kyutaiPath,
          timeout: 60000
        });
      } else {
        throw error;
      }
    }
  }
  
  // Map our voice IDs to Kyutai voice paths
  mapVoiceToKyutai(voiceId) {
    // If it's already a Kyutai voice path, return as-is
    if (voiceId.includes('/') || voiceId.includes('.')) {
      return voiceId;
    }
    
    // Default voice mapping for backwards compatibility
    const voiceMap = {
      'us_male_1': 'vctk/p226_023_mic1.flac',
      'us_female_1': 'vctk/p225_023_mic1.flac',
      'us_male_2': 'vctk/p227_023_mic1.flac',
      'us_female_2': 'vctk/p228_023_mic1.flac',
      'us_male_3': 'ears/p031_freeform_speech_01.wav',
      'us_female_3': 'vctk/p229_023_mic1.flac',
      'uk_male_1': 'vctk/p227_023_mic1.flac',
      'uk_female_1': 'vctk/p230_023_mic1.flac',
      'fr_male_1': 'cml_tts/cml_tts_speaker_1.wav',
      'fr_female_1': 'cml_tts/cml_tts_speaker_2.wav'
    };
    
    return voiceMap[voiceId] || 'expresso/ex03-ex01_happy_001_channel1_334s.wav'; // Default voice
  }
  
  // Check if ffmpeg is available
  async checkFfmpeg() {
    try {
      await execAsync('ffmpeg -version');
    } catch (error) {
      throw new Error('ffmpeg not found. Please install ffmpeg to combine audio files.');
    }
  }
  
  // Method for concatenating audio files (alias for combineAudioFiles)
  async concatenateAudioFiles(audioFiles, outputPath) {
    return this.combineAudioFiles(audioFiles, outputPath);
  }
}

module.exports = KyutaiService;