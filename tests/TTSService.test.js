const { jest } = require('@jest/globals');
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

    test('should throw error without API key', () => {
      expect(() => new TTSService()).toThrow();
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

  describe('validateSettings', () => {
    test('should validate correct settings', () => {
      const validSettings = {
        voice: 'alloy',
        model: 'tts-1',
        speed: 1.0
      };
      expect(() => ttsService.validateSettings(validSettings)).not.toThrow();
    });

    test('should throw error for invalid voice', () => {
      const invalidSettings = {
        voice: 'invalid-voice',
        model: 'tts-1',
        speed: 1.0
      };
      expect(() => ttsService.validateSettings(invalidSettings)).toThrow();
    });

    test('should throw error for invalid speed', () => {
      const invalidSettings = {
        voice: 'alloy',
        model: 'tts-1',
        speed: 5.0 // Max is 4.0
      };
      expect(() => ttsService.validateSettings(invalidSettings)).toThrow();
    });
  });
});