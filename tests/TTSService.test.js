const TTSService = require('../src/TTSService');
const fs = require('fs-extra');
const path = require('path');

// Mock external dependencies
jest.mock('fs-extra');
jest.mock('axios');
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis()
  }));
});
jest.mock('chalk', () => ({
  cyan: jest.fn(str => str),
  red: jest.fn(str => str),
  green: jest.fn(str => str),
  gray: jest.fn(str => str),
  yellow: jest.fn(str => str)
}));
jest.mock('../src/PreviewTexts', () => ({
  getPreviewText: jest.fn().mockReturnValue('This is a test preview.'),
  detectVoiceLanguage: jest.fn().mockReturnValue('en'),
  getPreviewCacheFilename: jest.fn().mockReturnValue('preview_openai_alloy_en.wav')
}));

describe('TTSService', () => {
  let ttsService;
  const mockApiKey = 'test-api-key';
  const mockCacheDir = '/test/cache';

  beforeEach(() => {
    ttsService = new TTSService(mockApiKey, mockCacheDir);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with API key and cache directory', () => {
      expect(ttsService.apiKey).toBe(mockApiKey);
      expect(ttsService.cacheDir).toBe(mockCacheDir);
    });

    test('should initialize without API key', () => {
      const service = new TTSService();
      expect(service.apiKey).toBeUndefined();
    });
  });

  describe('getVoices', () => {
    test('should return array of OpenAI voices', () => {
      const voices = ttsService.getVoices();
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      expect(voices).toContain('alloy');
      expect(voices).toContain('nova');
    });
  });

  describe('getModels', () => {
    test('should return array of OpenAI models', () => {
      const models = ttsService.getModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models).toContain('tts-1');
      expect(models).toContain('tts-1-hd');
    });
  });

  describe('calculateCost', () => {
    test('should calculate cost correctly', () => {
      const result = ttsService.calculateCost(1000);
      expect(result.characterCount).toBe(1000);
      expect(result.estimatedCost).toBe(0.015);
      expect(result.costPerThousand).toBe(0.015);
    });
  });

  describe('estimateProcessingTime', () => {
    test('should estimate processing time', () => {
      const time = ttsService.estimateProcessingTime(1000);
      expect(typeof time).toBe('string');
      expect(time).toMatch(/~\d+s/);
    });
  });

  describe('generateVoicePreview (unified preview system)', () => {
    const { getPreviewText, detectVoiceLanguage, getPreviewCacheFilename } = require('../src/PreviewTexts');

    beforeEach(() => {
      // Reset mocks
      fs.pathExists = jest.fn();
      fs.ensureDir = jest.fn();
      fs.writeFile = jest.fn();
      getPreviewText.mockClear();
      detectVoiceLanguage.mockClear();
      getPreviewCacheFilename.mockClear();
    });

    test('should use unified preview text system', async () => {
      // Mock cache miss
      fs.pathExists.mockResolvedValue(false);
      
      // Mock successful generation
      ttsService.generateSpeech = jest.fn().mockResolvedValue(Buffer.from('mock audio data'));

      await ttsService.generateVoicePreview('alloy');

      // Verify unified preview system calls
      expect(detectVoiceLanguage).toHaveBeenCalledWith('alloy');
      expect(getPreviewText).toHaveBeenCalledWith('en', 'short');
      expect(getPreviewCacheFilename).toHaveBeenCalledWith('openai', 'alloy', 'en');
    });

    test('should return cached preview if exists', async () => {
      const cachedPath = '/test/cache/previews/preview_openai_alloy_en.wav';
      fs.pathExists.mockResolvedValue(true);

      const result = await ttsService.generateVoicePreview('alloy');

      expect(result).toBe(cachedPath);
      expect(fs.ensureDir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    test('should generate new preview if cache miss', async () => {
      // Mock cache miss
      fs.pathExists.mockResolvedValue(false);
      
      // Mock successful generation
      ttsService.generateSpeech = jest.fn().mockResolvedValue(Buffer.from('mock audio data'));

      const result = await ttsService.generateVoicePreview('nova');

      // Verify preview generation
      expect(fs.ensureDir).toHaveBeenCalled();
      expect(ttsService.generateSpeech).toHaveBeenCalledWith('This is a test preview.', {
        voice: 'nova',
        model: 'tts-1'
      });
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('should handle different voice languages', async () => {
      detectVoiceLanguage.mockReturnValue('de');
      getPreviewText.mockReturnValue('Das ist eine Testvorschau.');
      getPreviewCacheFilename.mockReturnValue('preview_openai_german_voice_de.wav');
      
      fs.pathExists.mockResolvedValue(false);
      ttsService.generateSpeech = jest.fn().mockResolvedValue(Buffer.from('mock audio'));

      await ttsService.generateVoicePreview('german-voice');

      expect(detectVoiceLanguage).toHaveBeenCalledWith('german-voice');
      expect(getPreviewText).toHaveBeenCalledWith('de', 'short');
      expect(getPreviewCacheFilename).toHaveBeenCalledWith('openai', 'german-voice', 'de');
    });

    test('should handle generation errors and rethrow them', async () => {
      const { getPreviewText, detectVoiceLanguage, getPreviewCacheFilename } = require('../src/PreviewTexts');
      
      // Set up mocks for this specific test
      detectVoiceLanguage.mockReturnValue('en');
      getPreviewText.mockReturnValue('This is a test preview.');
      getPreviewCacheFilename.mockReturnValue('preview_openai_alloy_en.wav');
      
      fs.pathExists.mockResolvedValue(false);
      
      // Mock generateSpeech to reject
      const mockError = new Error('API Error');
      ttsService.generateSpeech = jest.fn().mockRejectedValue(mockError);

      // The method should fail the spinner and rethrow the error
      await expect(ttsService.generateVoicePreview('alloy')).rejects.toThrow('API Error');
      
      // Verify that generateSpeech was called with the mocked preview text
      expect(ttsService.generateSpeech).toHaveBeenCalledWith('This is a test preview.', {
        voice: 'alloy',
        model: 'tts-1'
      });
    });

    test('should handle ora spinner correctly on success', async () => {
      const ora = require('ora');
      const mockSpinner = {
        start: jest.fn().mockReturnThis(),
        succeed: jest.fn().mockReturnThis(),
        fail: jest.fn().mockReturnThis()
      };
      ora.mockReturnValue(mockSpinner);

      fs.pathExists.mockResolvedValue(false);
      ttsService.generateSpeech = jest.fn().mockResolvedValue(Buffer.from('mock audio'));

      await ttsService.generateVoicePreview('nova');

      expect(ora).toHaveBeenCalledWith('Generating preview for nova...');
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Preview ready for nova');
    });

    test('should handle ora spinner correctly on error', async () => {
      const ora = require('ora');
      const mockSpinner = {
        start: jest.fn().mockReturnThis(),
        succeed: jest.fn().mockReturnThis(),
        fail: jest.fn().mockReturnThis()
      };
      ora.mockReturnValue(mockSpinner);

      fs.pathExists.mockResolvedValue(false);
      const mockError = new Error('API Error');
      ttsService.generateSpeech = jest.fn().mockRejectedValue(mockError);

      // Expect the error to be thrown, but verify spinner behavior
      await expect(ttsService.generateVoicePreview('shimmer')).rejects.toThrow('API Error');

      expect(ora).toHaveBeenCalledWith('Generating preview for shimmer...');
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.fail).toHaveBeenCalledWith('Failed to generate preview for shimmer');
    });
  });
});