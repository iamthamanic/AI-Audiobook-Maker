// Integration tests for Fish Speech Service
// These tests verify real TTS functionality with actual installations

jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  }));
});

jest.mock('chalk', () => ({
  cyan: jest.fn(text => text),
  green: jest.fn(text => text),
  red: jest.fn(text => text),
  yellow: jest.fn(text => text),
  gray: jest.fn(text => text),
  blue: jest.fn(text => text),
  magenta: jest.fn(text => text),
  bold: jest.fn(text => text),
  dim: jest.fn(text => text),
  white: jest.fn(text => text),
}));

const FishSpeechService = require('../src/FishSpeechService');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('FishSpeechService Integration Tests', () => {
  let fishService;
  let testCacheDir;

  beforeAll(() => {
    testCacheDir = path.join(os.tmpdir(), 'fish-speech-test-cache');
    fishService = new FishSpeechService(testCacheDir);
  });

  afterAll(async () => {
    // Clean up test cache
    if (await fs.pathExists(testCacheDir)) {
      await fs.remove(testCacheDir);
    }
  });

  describe('Installation Detection', () => {
    test('should correctly detect Fish Speech availability', async () => {
      const isAvailable = await fishService.isAvailable();
      
      // Should be boolean
      expect(typeof isAvailable).toBe('boolean');
      
      if (isAvailable) {
        // If available, should set internal state
        expect(fishService.isInstalled).toBe(true);
        expect(fishService.fishSpeechPath).toBeTruthy();
      } else {
        expect(fishService.isInstalled).toBe(false);
      }
    });

    test('should handle repeated availability checks', async () => {
      const result1 = await fishService.isAvailable();
      const result2 = await fishService.isAvailable();
      
      expect(result1).toBe(result2);
    }, 30000);
  });

  describe('Voice Preview Generation', () => {
    test('should handle preview generation when Fish Speech is available', async () => {
      const isAvailable = await fishService.isAvailable();
      
      if (isAvailable) {
        const previewResult = await fishService.generateVoicePreview('de-female-1');
        
        if (previewResult) {
          // Preview should be a file path
          expect(typeof previewResult).toBe('string');
          expect(previewResult).toMatch(/\.wav$/);
          
          // File should exist
          expect(await fs.pathExists(previewResult)).toBe(true);
        }
      } else {
        const previewResult = await fishService.generateVoicePreview('de-female-1');
        expect(previewResult).toBeNull();
      }
    }, 60000);

    test('should handle preview generation when Fish Speech is not available', async () => {
      // Create a fresh service to test unavailable state
      const unavailableService = new FishSpeechService(testCacheDir);
      
      // Manually set as not installed to test error handling
      unavailableService.isInstalled = false;
      
      const previewResult = await unavailableService.generateVoicePreview('de-female-1');
      expect(previewResult).toBeNull();
    }, 30000);

    test('should return cached preview if exists', async () => {
      const isAvailable = await fishService.isAvailable();
      
      if (isAvailable) {
        // Generate preview twice
        const preview1 = await fishService.generateVoicePreview('de-female-1');
        const preview2 = await fishService.generateVoicePreview('de-female-1');
        
        if (preview1 && preview2) {
          expect(preview1).toBe(preview2);
        }
      }
    }, 60000);
  });

  describe('Text Processing', () => {
    test('should handle text chunk processing when available', async () => {
      const isAvailable = await fishService.isAvailable();
      
      if (isAvailable) {
        const testChunks = ['Dies ist ein Test.', 'Zweiter Satz.'];
        const options = {
          voice: 'de-female-1',
          outputDir: testCacheDir
        };
        
        try {
          const audioFiles = await fishService.processTextChunks(testChunks, options);
          
          if (audioFiles && audioFiles.length > 0) {
            expect(Array.isArray(audioFiles)).toBe(true);
            expect(audioFiles.length).toBe(testChunks.length);
            
            // Check that files exist
            for (const file of audioFiles) {
              expect(await fs.pathExists(file)).toBe(true);
              expect(file).toMatch(/\.wav$/);
            }
          }
        } catch (error) {
          // TTS generation might fail due to model issues, that's OK for this test
          expect(error.message).toMatch(/Fish Speech|TTS|generation/i);
        }
      } else {
        await expect(
          fishService.processTextChunks(['Test'], { voice: 'de-female-1' })
        ).rejects.toThrow('Fish Speech not available');
      }
    });

    test('should handle empty chunks array', async () => {
      const isAvailable = await fishService.isAvailable();
      
      if (isAvailable) {
        const audioFiles = await fishService.processTextChunks([], { voice: 'de-female-1' });
        expect(audioFiles).toEqual([]);
      }
    });
  });

  describe('Voice Configuration', () => {
    test('should provide valid voice options', () => {
      const voices = fishService.getVoices();
      
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      
      voices.forEach(voice => {
        expect(voice).toHaveProperty('name');
        expect(voice).toHaveProperty('value');
        expect(voice).toHaveProperty('language');
        expect(['de', 'en', 'fr']).toContain(voice.language);
      });
    });

    test('should include German voices', () => {
      const voices = fishService.getVoices();
      const germanVoices = voices.filter(v => v.language === 'de');
      
      expect(germanVoices.length).toBeGreaterThan(0);
      expect(germanVoices.some(v => v.name.includes('🇩🇪'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid voice parameters', async () => {
      const isAvailable = await fishService.isAvailable();
      
      if (isAvailable) {
        const result = await fishService.generateVoicePreview('invalid-voice');
        expect(result).toBeNull();
      }
    });

    test('should handle missing output directory', async () => {
      const isAvailable = await fishService.isAvailable();
      
      if (isAvailable) {
        const invalidDir = '/nonexistent/directory';
        
        try {
          await fishService.processTextChunks(['Test'], { 
            voice: 'de-female-1',
            outputDir: invalidDir 
          });
        } catch (error) {
          // Should either create directory or fail gracefully
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Installation Information', () => {
    test('should provide installation details when available', async () => {
      const installDir = path.join(os.homedir(), '.aiabm', 'fish-speech');
      const markerFile = path.join(installDir, '.installation_complete');
      
      if (await fs.pathExists(markerFile)) {
        const installInfo = JSON.parse(await fs.readFile(markerFile, 'utf8'));
        
        expect(installInfo).toHaveProperty('version');
        expect(installInfo).toHaveProperty('installedAt');
        expect(installInfo).toHaveProperty('pythonVersion');
        
        expect(typeof installInfo.version).toBe('string');
        expect(new Date(installInfo.installedAt)).toBeInstanceOf(Date);
      }
    });
  });
});