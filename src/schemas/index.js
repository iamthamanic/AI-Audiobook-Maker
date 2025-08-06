/**
 * Central schema validation module using Zod.
 * Exports all validation schemas for type-safe data handling.
 */

const { z } = require('zod');

/**
 * Configuration schema for validating config.json structure
 */
const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required').optional(),
  cacheDir: z.string().optional(),
  lastUsed: z.string().datetime().optional(),
  preferences: z.object({
    defaultVoice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
    defaultSpeed: z.number().min(0.25).max(4.0).optional(),
    defaultModel: z.enum(['tts-1', 'tts-1-hd']).optional(),
    outputFormat: z.enum(['single', 'separate', 'both']).optional(),
  }).optional(),
});

/**
 * TTS options schema for validating speech generation parameters
 */
const TTSOptionsSchema = z.object({
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']),
  model: z.enum(['tts-1', 'tts-1-hd']).default('tts-1'),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  format: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
});

/**
 * File processing options schema
 */
const FileProcessingSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  maxChunkSize: z.number().int().min(1000).max(10000).default(4000),
  outputDirectory: z.string().optional(),
});

/**
 * Session data schema for progress tracking
 */
const SessionSchema = z.object({
  id: z.string().uuid(),
  filePath: z.string(),
  fileName: z.string(),
  options: z.object({
    provider: z.enum(['openai', 'thorsten']),
    voice: z.string(),
    model: z.string().optional(),
    speed: z.number().min(0.25).max(4.0),
    outputOptions: z.enum(['single', 'separate', 'both']),
    outputDirectory: z.string().optional(),
  }),
  progress: z.object({
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    totalChunks: z.number().int().min(0).default(0),
    completedChunks: z.number().int().min(0).default(0),
    currentChunk: z.number().int().min(0).optional(),
    percentage: z.number().min(0).max(100).default(0),
    error: z.string().optional(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  outputDir: z.string().optional(),
  finalOutputPath: z.string().optional(),
});

/**
 * Thorsten-Voice specific options schema
 */
const ThorstenOptionsSchema = z.object({
  voice: z.enum(['thorsten', 'thorsten_emotional']),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  outputDir: z.string().optional(),
});

/**
 * File metadata schema
 */
const FileDataSchema = z.object({
  content: z.string().min(1, 'File content cannot be empty'),
  characterCount: z.number().int().min(1),
  wordCount: z.number().int().min(1),
  type: z.enum(['text', 'pdf']),
  pageCount: z.number().int().positive().optional(), // Only for PDF files
});

/**
 * API key validation schema
 */
const ApiKeySchema = z.object({
  key: z.string()
    .min(20, 'API key too short')
    .startsWith('sk-', 'OpenAI API keys must start with "sk-"')
    .regex(/^sk-[A-Za-z0-9\-_]{32,}$/, 'Invalid API key format'),
});

/**
 * CLI options schema
 */
const CliOptionsSchema = z.object({
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
  speed: z.string().transform(val => parseFloat(val)).pipe(z.number().min(0.25).max(4.0)).optional(),
  model: z.enum(['tts-1', 'tts-1-hd']).optional(),
  config: z.boolean().optional(),
});

module.exports = {
  ConfigSchema,
  TTSOptionsSchema,
  FileProcessingSchema,
  SessionSchema,
  ThorstenOptionsSchema,
  FileDataSchema,
  ApiKeySchema,
  CliOptionsSchema,
  
  // Validation helper functions
  validateConfig: (data) => ConfigSchema.parse(data),
  validateTTSOptions: (data) => TTSOptionsSchema.parse(data),
  validateFileProcessing: (data) => FileProcessingSchema.parse(data),
  validateSession: (data) => SessionSchema.parse(data),
  validateThorstenOptions: (data) => ThorstenOptionsSchema.parse(data),
  validateFileData: (data) => FileDataSchema.parse(data),
  validateApiKey: (data) => ApiKeySchema.parse(data),
  validateCliOptions: (data) => CliOptionsSchema.parse(data),
  
  // Safe parsing functions (return success/error objects)
  safeValidateConfig: (data) => ConfigSchema.safeParse(data),
  safeValidateTTSOptions: (data) => TTSOptionsSchema.safeParse(data),
  safeValidateFileProcessing: (data) => FileProcessingSchema.safeParse(data),
  safeValidateSession: (data) => SessionSchema.safeParse(data),
  safeValidateApiKey: (data) => ApiKeySchema.safeParse(data),
  safeValidateCliOptions: (data) => CliOptionsSchema.safeParse(data),
};