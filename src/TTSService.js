const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');
const ora = require('ora');
const { getPreviewText, detectVoiceLanguage, getPreviewCacheFilename } = require('./PreviewTexts');
const { safeValidateTTSOptions } = require('./schemas');

/**
 * OpenAI Text-to-Speech service integration.
 * Handles speech generation, voice previews, and audio file processing.
 */
class TTSService {
  /**
   * Creates a new TTSService instance.
   * @param {string} apiKey - OpenAI API key for authentication
   * @param {string} cacheDir - Directory for caching voice previews
   */
  constructor(apiKey, cacheDir) {
    this.apiKey = apiKey;
    this.cacheDir = cacheDir;
    this.baseURL = 'https://api.openai.com/v1/audio/speech';
    this.voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    this.models = ['tts-1', 'tts-1-hd'];
    // Preview text is now dynamically generated based on voice language
  }

  /**
   * Generates speech audio from text using OpenAI TTS API.
   * @param {string} text - Text to convert to speech
   * @param {Object} [options={}] - TTS options
   * @param {string} [options.voice='alloy'] - Voice to use
   * @param {string} [options.model='tts-1'] - TTS model to use
   * @param {number} [options.speed=1.0] - Speech speed (0.25-4.0)
   * @param {string} [options.format='mp3'] - Output format
   * @returns {Buffer} Audio data buffer
   * @throws {Error} When API request fails or parameters are invalid
   */
  async generateSpeech(text, options = {}) {
    // Validate input text
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Text input is required and must be a non-empty string');
    }
    
    // Set defaults and validate TTS options using Zod
    const defaultOptions = { voice: 'alloy', model: 'tts-1', speed: 1.0, format: 'mp3' };
    const mergedOptions = { ...defaultOptions, ...options };
    
    const validation = safeValidateTTSOptions(mergedOptions);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Invalid TTS options: ${errorMessages.join(', ')}`);
    }
    
    const { voice, model, speed, format } = validation.data;

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

  /**
   * Generates or retrieves cached voice preview.
   * Uses language-appropriate preview text based on voice.
   * @param {string} voice - Voice name to generate preview for
   * @param {Object} [options={}] - Additional TTS options
   * @returns {string} Path to cached preview audio file
   * @throws {Error} When preview generation fails
   */
  async generateVoicePreview(voice, options = {}) {
    // Detect voice language and get appropriate preview text
    const language = detectVoiceLanguage(voice);
    const previewText = getPreviewText(language, 'short');
    
    // Use consistent cache filename
    const cacheFilename = getPreviewCacheFilename('openai', voice, language);
    const cachedFile = path.join(this.cacheDir, 'previews', cacheFilename);

    // Check cache first
    if (await fs.pathExists(cachedFile)) {
      return cachedFile;
    }

    // Generate preview
    const spinner = ora(`Generating preview for ${voice}...`).start();

    try {
      const audioBuffer = await this.generateSpeech(previewText, {
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

  /**
   * Processes multiple text chunks into audio files.
   * Includes progress tracking and rate limiting.
   * @param {string[]} chunks - Array of text chunks to process
   * @param {Object} [options={}] - Processing options
   * @param {string} [options.voice='alloy'] - Voice to use
   * @param {string} [options.model='tts-1'] - TTS model
   * @param {number} [options.speed=1.0] - Speech speed
   * @param {string} [options.outputDir='./output'] - Output directory
   * @param {Function} [onProgress] - Progress callback function
   * @returns {string[]} Array of generated audio file paths
   * @throws {Error} When chunk processing fails
   */
  async processTextChunks(chunks, options = {}, onProgress = null) {
    // Validate input chunks
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('Chunks must be a non-empty array');
    }
    
    if (chunks.some(chunk => typeof chunk !== 'string' || chunk.trim().length === 0)) {
      throw new Error('All chunks must be non-empty strings');
    }
    
    // Validate and set defaults for options
    const defaultOptions = { voice: 'alloy', model: 'tts-1', speed: 1.0, outputDir: './output' };
    const mergedOptions = { ...defaultOptions, ...options };
    
    const validation = safeValidateTTSOptions(mergedOptions);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Invalid processing options: ${errorMessages.join(', ')}`);
    }
    
    const { voice, model, speed, outputDir } = mergedOptions;

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

  /**
   * Concatenates multiple audio files into single output file using FFmpeg.
   * @param {string[]} audioFiles - Array of audio file paths to combine
   * @param {string} outputPath - Path for the combined output file
   * @returns {string} Path to the combined audio file
   * @throws {Error} When FFmpeg is not available or concatenation fails
   */
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

  /**
   * Tests the API key validity by making a small TTS request.
   * @returns {boolean} True if API key is valid
   * @throws {Error} When API key is invalid or request fails
   */
  async testApiKey() {
    // Test with a very short text
    await this.generateSpeech('Test', { voice: 'alloy', model: 'tts-1' });
    return true;
  }

  /**
   * Returns available voice options.
   * @returns {string[]} Array of available voice names
   */
  getVoices() {
    return this.voices;
  }

  getModels() {
    return this.models;
  }

  /**
   * Estimates processing time based on character count and model.
   * @param {number} characterCount - Number of characters to process
   * @param {string} [model='tts-1'] - TTS model to use
   * @returns {string} Formatted time estimate (e.g., '2m 30s')
   */
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

  /**
   * Calculates estimated cost for TTS conversion.
   * @param {number} characterCount - Number of characters to process
   * @param {string} [model='tts-1'] - TTS model (affects pricing)
   * @returns {Object} Cost calculation details
   * @returns {number} returns.characterCount - Input character count
   * @returns {number} returns.estimatedCost - Estimated cost in USD
   * @returns {number} returns.costPerThousand - Rate per 1,000 characters
   * @returns {string} returns.model - Model used for calculation
   */
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
