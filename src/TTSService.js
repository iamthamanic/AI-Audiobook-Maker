const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');
const ora = require('ora');

class TTSService {
  constructor(apiKey, cacheDir) {
    this.apiKey = apiKey;
    this.cacheDir = cacheDir;
    this.baseURL = 'https://api.openai.com/v1/audio/speech';
    this.voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    this.models = ['tts-1', 'tts-1-hd'];
    this.previewText =
      'This is a Story about transkription and fiction. Das ist eine Geschichte über Transkription und Fiktion.';
  }

  async generateSpeech(text, options = {}) {
    const { voice = 'alloy', model = 'tts-1', speed = 1.0, format = 'mp3' } = options;

    if (!this.voices.includes(voice)) {
      throw new Error(`Invalid voice: ${voice}. Available: ${this.voices.join(', ')}`);
    }

    if (!this.models.includes(model)) {
      throw new Error(`Invalid model: ${model}. Available: ${this.models.join(', ')}`);
    }

    if (speed < 0.25 || speed > 4.0) {
      throw new Error('Speed must be between 0.25 and 4.0');
    }

    try {
      const response = await axios.post(
        this.baseURL,
        {
          model,
          input: text,
          voice,
          speed,
          response_format: format,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 60000, // 1 minute timeout
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenAI API key.');
        } else if (error.response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (error.response.status === 413) {
          throw new Error('Text too long. Try splitting into smaller chunks.');
        } else {
          const errorData = JSON.parse(error.response.data.toString());
          throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout. Please try again.');
      } else {
        throw new Error(`Network error: ${error.message}`);
      }
    }
  }

  async generateVoicePreview(voice, options = {}) {
    const cacheKey = this.getCacheKey(this.previewText, { ...options, voice });
    const cachedFile = path.join(this.cacheDir, 'previews', `${cacheKey}.mp3`);

    // Check cache first
    if (await fs.pathExists(cachedFile)) {
      return cachedFile;
    }

    // Generate preview
    const spinner = ora(`Generating preview for ${voice}...`).start();

    try {
      const audioBuffer = await this.generateSpeech(this.previewText, {
        ...options,
        voice,
        model: 'tts-1', // Use faster model for previews
      });

      // Ensure preview directory exists
      await fs.ensureDir(path.dirname(cachedFile));

      // Save to cache
      await fs.writeFile(cachedFile, audioBuffer);

      spinner.succeed(`Preview ready for ${voice}`);
      return cachedFile;
    } catch (error) {
      spinner.fail(`Failed to generate preview for ${voice}`);
      throw error;
    }
  }

  async generateAllPreviews(options = {}) {
    console.log(chalk.cyan('\n🎵 Generating voice previews...'));

    const previews = {};
    const errors = [];

    // Generate previews in parallel (but limit concurrency)
    const concurrency = 3;
    for (let i = 0; i < this.voices.length; i += concurrency) {
      const batch = this.voices.slice(i, i + concurrency);

      const batchPromises = batch.map(async (voice) => {
        try {
          const previewFile = await this.generateVoicePreview(voice, options);
          previews[voice] = previewFile;
        } catch (error) {
          errors.push({ voice, error: error.message });
        }
      });

      await Promise.all(batchPromises);
    }

    if (errors.length > 0) {
      console.log(chalk.yellow('\n⚠️  Some previews failed to generate:'));
      errors.forEach(({ voice, error }) => {
        console.log(chalk.red(`  ${voice}: ${error}`));
      });
    }

    return { previews, errors };
  }

  getCacheKey(text, options) {
    const hash = crypto.createHash('md5');
    hash.update(JSON.stringify({ text, options }));
    return hash.digest('hex');
  }

  async processTextChunks(chunks, options = {}, onProgress = null) {
    const { voice = 'alloy', model = 'tts-1', speed = 1.0, outputDir = './output' } = options;

    await fs.ensureDir(outputDir);

    const audioFiles = [];
    const totalChunks = chunks.length;

    console.log(chalk.cyan(`\n🎙️ Converting ${totalChunks} chunks to audio...`));
    console.log(chalk.gray(`Voice: ${voice} | Model: ${model} | Speed: ${speed}x\n`));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNumber = i + 1;

      const spinner = ora(`Processing chunk ${chunkNumber}/${totalChunks}...`).start();

      try {
        const audioBuffer = await this.generateSpeech(chunk, { voice, model, speed });
        const fileName = `chunk_${chunkNumber.toString().padStart(3, '0')}.mp3`;
        const filePath = path.join(outputDir, fileName);

        await fs.writeFile(filePath, audioBuffer);
        audioFiles.push(filePath);

        spinner.succeed(`Chunk ${chunkNumber}/${totalChunks} completed`);

        if (onProgress) {
          onProgress({
            current: chunkNumber,
            total: totalChunks,
            percentage: Math.round((chunkNumber / totalChunks) * 100),
            filePath,
          });
        }

        // Small delay to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        spinner.fail(`Chunk ${chunkNumber} failed: ${error.message}`);
        throw error;
      }
    }

    return audioFiles;
  }

  async concatenateAudioFiles(audioFiles, outputPath) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const spinner = ora('Combining audio files...').start();

    try {
      // Check if ffmpeg is available
      try {
        await execAsync('ffmpeg -version');
      } catch (error) {
        spinner.fail('FFmpeg not found. Please install FFmpeg to combine audio files.');
        throw new Error(
          'FFmpeg is required to combine audio files. Install it from https://ffmpeg.org/'
        );
      }

      // Create a temporary file list for ffmpeg
      const fileListPath = path.join(path.dirname(outputPath), 'file_list.txt');
      const fileListContent = audioFiles.map((file) => `file '${path.resolve(file)}'`).join('\n');

      await fs.writeFile(fileListPath, fileListContent);

      // Use ffmpeg to concatenate
      const command = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}" -y`;
      await execAsync(command);

      // Cleanup
      await fs.remove(fileListPath);

      spinner.succeed('Audio files combined successfully');
      return outputPath;
    } catch (error) {
      spinner.fail('Failed to combine audio files');
      throw new Error(`Audio combination failed: ${error.message}`);
    }
  }

  async testApiKey() {
    try {
      // Test with a very short text
      await this.generateSpeech('Test', { voice: 'alloy', model: 'tts-1' });
      return true;
    } catch (error) {
      throw error;
    }
  }

  getVoices() {
    return this.voices;
  }

  getModels() {
    return this.models;
  }

  estimateProcessingTime(characterCount, model = 'tts-1') {
    // Rough estimates based on OpenAI TTS performance
    const charsPerSecond = model === 'tts-1-hd' ? 50 : 100;
    const estimatedSeconds = Math.ceil(characterCount / charsPerSecond);

    const minutes = Math.floor(estimatedSeconds / 60);
    const seconds = estimatedSeconds % 60;

    if (minutes > 0) {
      return `~${minutes}m ${seconds}s`;
    } else {
      return `~${seconds}s`;
    }
  }

  calculateCost(characterCount, model = 'tts-1') {
    const costPerThousand = 0.015; // $0.015 per 1K characters
    return {
      characterCount,
      estimatedCost: (characterCount / 1000) * costPerThousand,
      costPerThousand,
      model,
    };
  }
}

module.exports = TTSService;
