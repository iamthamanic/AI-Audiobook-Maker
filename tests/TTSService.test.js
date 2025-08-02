const TTSService = require('../src/TTSService');

// Mock external dependencies
jest.mock('fs-extra');
jest.mock('axios');

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
});