const FishSpeechService = require('../src/FishSpeechService');

jest.mock('fs-extra');
jest.mock('child_process');

describe('FishSpeechService', () => {
  let fishSpeechService;
  const mockCachePath = '/test/cache';

  beforeEach(() => {
    fishSpeechService = new FishSpeechService(mockCachePath);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with cache path', () => {
      expect(fishSpeechService.cachePath).toBe(mockCachePath);
      expect(fishSpeechService.isInstalled).toBe(false);
    });
  });

  describe('getVoices', () => {
    test('should return array of Fish Speech voices', () => {
      const voices = fishSpeechService.getVoices();
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      
      // Check for German voices
      const germanVoices = voices.filter(voice => voice.language === 'de');
      expect(germanVoices.length).toBeGreaterThan(0);
      
      // Check for English voices
      const englishVoices = voices.filter(voice => voice.language === 'en');
      expect(englishVoices.length).toBeGreaterThan(0);
    });

    test('should have proper voice structure', () => {
      const voices = fishSpeechService.getVoices();
      voices.forEach(voice => {
        expect(voice).toHaveProperty('name');
        expect(voice).toHaveProperty('value');
        expect(voice).toHaveProperty('language');
      });
    });
  });

  describe('getInstallationGuide', () => {
    test('should return installation guide', () => {
      const guide = fishSpeechService.getInstallationGuide();
      expect(guide).toHaveProperty('title');
      expect(guide).toHaveProperty('steps');
      expect(guide).toHaveProperty('links');
      expect(Array.isArray(guide.steps)).toBe(true);
      expect(Array.isArray(guide.links)).toBe(true);
    });
  });
});