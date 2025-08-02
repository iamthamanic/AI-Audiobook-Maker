const ThorstenVoiceService = require('../src/ThorstenVoiceService');

jest.mock('fs-extra');
jest.mock('child_process');

describe('ThorstenVoiceService', () => {
  let thorstenService;
  const mockCachePath = '/test/cache';

  beforeEach(() => {
    thorstenService = new ThorstenVoiceService(mockCachePath);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with cache path', () => {
      expect(thorstenService.cachePath).toBe(mockCachePath);
      expect(thorstenService.isInstalled).toBe(false);
      expect(thorstenService.modelName).toBe('tts_models/de/thorsten/vits');
    });
  });

  describe('getVoices', () => {
    test('should return array of Thorsten voices', () => {
      const voices = thorstenService.getVoices();
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      
      // All voices should be German
      voices.forEach(voice => {
        expect(voice.language).toBe('de');
        expect(voice.name).toContain('🇩🇪');
      });
    });

    test('should have proper voice structure', () => {
      const voices = thorstenService.getVoices();
      voices.forEach(voice => {
        expect(voice).toHaveProperty('name');
        expect(voice).toHaveProperty('value');
        expect(voice).toHaveProperty('language');
        expect(voice).toHaveProperty('description');
      });
    });
  });

  describe('getInstallationGuide', () => {
    test('should return installation guide', () => {
      const guide = thorstenService.getInstallationGuide();
      expect(guide).toHaveProperty('title');
      expect(guide).toHaveProperty('steps');
      expect(guide).toHaveProperty('links');
      expect(Array.isArray(guide.steps)).toBe(true);
      expect(Array.isArray(guide.links)).toBe(true);
      expect(guide.title).toContain('Thorsten-Voice');
    });
  });

  describe('showManualInstallation', () => {
    test('should execute without throwing', () => {
      // Mock console.log to prevent output during tests
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      expect(() => {
        thorstenService.showManualInstallation();
      }).not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });
});