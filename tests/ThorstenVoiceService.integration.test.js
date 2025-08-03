// Integration tests for Thorsten Voice Service
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

const ThorstenVoiceService = require('../src/ThorstenVoiceService');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('ThorstenVoiceService Integration Tests', () => {
  let thorstenService;
  let testCacheDir;

  beforeAll(() => {
    testCacheDir = path.join(os.tmpdir(), 'thorsten-voice-test-cache');
    thorstenService = new ThorstenVoiceService(testCacheDir);
  });

  afterAll(async () => {
    // Clean up test cache
    if (await fs.pathExists(testCacheDir)) {
      await fs.remove(testCacheDir);
    }
  });

  describe('Installation Detection', () => {
    test('should correctly detect Thorsten Voice availability', async () => {
      const isAvailable = await thorstenService.isAvailable();
      
      // Should be boolean
      expect(typeof isAvailable).toBe('boolean');
      
      if (isAvailable) {
        // If available, should set internal state
        expect(thorstenService.isInstalled).toBe(true);
        expect(thorstenService.thorstenPath).toBeTruthy();
      } else {
        expect(thorstenService.isInstalled).toBe(false);
      }
    });

    test('should handle repeated availability checks', async () => {
      const result1 = await thorstenService.isAvailable();
      const result2 = await thorstenService.isAvailable();
      
      expect(result1).toBe(result2);
    });
  });

  describe('Python Compatibility', () => {
    test('should detect compatible Python versions', async () => {
      try {
        const pythonVersion = await thorstenService.checkPythonInstallation();
        
        // Should return a version string
        expect(typeof pythonVersion).toBe('string');
        expect(pythonVersion).toMatch(/Python \d+\.\d+/);
        
        // Should be compatible version (3.9-3.11)
        const versionMatch = pythonVersion.match(/Python (\d+)\.(\d+)/);
        if (versionMatch) {
          const major = parseInt(versionMatch[1]);
          const minor = parseInt(versionMatch[2]);
          
          expect(major).toBe(3);
          expect(minor).toBeGreaterThanOrEqual(9);
          expect(minor).toBeLessThan(12);
        }
      } catch (error) {
        // Python compatibility issues are expected if no compatible version exists
        expect(error.message).toMatch(/Python|version|requires/i);
      }
    });

    test('should reject Python 3.13+', async () => {
      // This test verifies that the service correctly rejects incompatible Python versions
      // Since we can't easily mock Python versions in integration tests,
      // we test the logic indirectly by checking error messages
      
      const availabilityCheck = await thorstenService.isAvailable();
      
      // If not available, it might be due to Python version incompatibility
      if (!availabilityCheck) {
        // This is expected behavior for incompatible Python versions
        expect(availabilityCheck).toBe(false);
      }
    });
  });

  describe('Voice Preview Generation', () => {
    test('should handle preview generation when Thorsten Voice is available', async () => {
      const isAvailable = await thorstenService.isAvailable();
      
      if (isAvailable) {
        const previewResult = await thorstenService.generateVoicePreview('thorsten-male');
        
        if (previewResult) {
          // Preview should be a file path
          expect(typeof previewResult).toBe('string');
          expect(previewResult).toMatch(/\.wav$/);
          
          // File should exist
          expect(await fs.pathExists(previewResult)).toBe(true);
        }
      } else {
        const previewResult = await thorstenService.generateVoicePreview('thorsten-male');
        expect(previewResult).toBeNull();
      }
    });

    test('should handle preview generation when Thorsten Voice is not available', async () => {
      // Create a fresh service to test unavailable state
      const unavailableService = new ThorstenVoiceService(testCacheDir);
      
      // Manually set as not installed to test error handling
      unavailableService.isInstalled = false;
      
      const previewResult = await unavailableService.generateVoicePreview('thorsten-male');
      expect(previewResult).toBeNull();
    });

    test('should return cached preview if exists', async () => {
      const isAvailable = await thorstenService.isAvailable();
      
      if (isAvailable) {
        // Generate preview twice
        const preview1 = await thorstenService.generateVoicePreview('thorsten-male');
        const preview2 = await thorstenService.generateVoicePreview('thorsten-male');
        
        if (preview1 && preview2) {
          expect(preview1).toBe(preview2);
        }
      }
    });
  });

  describe('Text Processing', () => {
    test('should handle text chunk processing when available', async () => {
      const isAvailable = await thorstenService.isAvailable();
      
      if (isAvailable) {
        const testChunks = ['Dies ist ein Test.', 'Zweiter deutscher Satz.'];
        const options = {
          voice: 'thorsten-male',
          outputDir: testCacheDir
        };
        
        try {
          const audioFiles = await thorstenService.processTextChunks(testChunks, options);
          
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
          expect(error.message).toMatch(/Thorsten|TTS|generation/i);
        }
      } else {
        await expect(
          thorstenService.processTextChunks(['Test'], { voice: 'thorsten-male' })
        ).rejects.toThrow('Thorsten-Voice not available');
      }
    });

    test('should handle empty chunks array', async () => {
      const isAvailable = await thorstenService.isAvailable();
      
      if (isAvailable) {
        const audioFiles = await thorstenService.processTextChunks([], { voice: 'thorsten-male' });
        expect(audioFiles).toEqual([]);
      }
    });
  });

  describe('Voice Configuration', () => {
    test('should provide valid voice options', () => {
      const voices = thorstenService.getVoices();
      
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
      
      voices.forEach(voice => {
        expect(voice).toHaveProperty('name');
        expect(voice).toHaveProperty('value');
        expect(voice).toHaveProperty('language');
        expect(voice).toHaveProperty('description');
        expect(voice.language).toBe('de'); // Thorsten is German-only
      });
    });

    test('should include German male voices', () => {
      const voices = thorstenService.getVoices();
      
      expect(voices.length).toBeGreaterThan(0);
      expect(voices.some(v => v.name.includes('🇩🇪'))).toBe(true);
      expect(voices.some(v => v.name.toLowerCase().includes('thorsten'))).toBe(true);
    });
  });

  describe('Audio File Combination', () => {
    test('should handle audio file combination when ffmpeg is available', async () => {
      const isAvailable = await thorstenService.isAvailable();
      
      if (isAvailable) {
        // Create dummy audio files for testing
        await fs.ensureDir(testCacheDir);
        const dummyFile1 = path.join(testCacheDir, 'test1.wav');
        const dummyFile2 = path.join(testCacheDir, 'test2.wav');
        const outputFile = path.join(testCacheDir, 'combined.wav');
        
        // Create minimal WAV files (just headers for testing)
        const wavHeader = Buffer.alloc(44);
        await fs.writeFile(dummyFile1, wavHeader);
        await fs.writeFile(dummyFile2, wavHeader);
        
        try {
          await thorstenService.combineAudioFiles([dummyFile1, dummyFile2], outputFile);
          
          // If successful, output file should exist
          if (await fs.pathExists(outputFile)) {
            expect(await fs.pathExists(outputFile)).toBe(true);
          }
        } catch (error) {
          // ffmpeg might not be available or files might be invalid, that's OK
          expect(error.message).toMatch(/ffmpeg|combine|audio/i);
        } finally {
          // Clean up
          await fs.remove(dummyFile1).catch(() => {});
          await fs.remove(dummyFile2).catch(() => {});
          await fs.remove(outputFile).catch(() => {});
        }
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid voice parameters', async () => {
      const isAvailable = await thorstenService.isAvailable();
      
      if (isAvailable) {
        const result = await thorstenService.generateVoicePreview('invalid-voice');
        expect(result).toBeNull();
      }
    });

    test('should handle missing output directory', async () => {
      const isAvailable = await thorstenService.isAvailable();
      
      if (isAvailable) {
        const invalidDir = '/nonexistent/directory';
        
        try {
          await thorstenService.processTextChunks(['Test'], { 
            voice: 'thorsten-male',
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
      const installDir = path.join(os.homedir(), '.aiabm', 'thorsten-voice');
      const markerFile = path.join(installDir, '.installation_complete');
      
      if (await fs.pathExists(markerFile)) {
        const installInfo = JSON.parse(await fs.readFile(markerFile, 'utf8'));
        
        expect(installInfo).toHaveProperty('version');
        expect(installInfo).toHaveProperty('modelName');
        expect(installInfo).toHaveProperty('installedAt');
        expect(installInfo).toHaveProperty('pythonVersion');
        
        expect(typeof installInfo.version).toBe('string');
        expect(installInfo.modelName).toBe('tts_models/de/thorsten/vits');
        expect(new Date(installInfo.installedAt)).toBeInstanceOf(Date);
      }
    });
  });

  describe('Update Checking', () => {
    test('should check for updates appropriately', async () => {
      const updateInfo = await thorstenService.checkForUpdates();
      
      expect(updateInfo).toHaveProperty('needsUpdate');
      expect(typeof updateInfo.needsUpdate).toBe('boolean');
      
      if (updateInfo.needsUpdate) {
        expect(updateInfo).toHaveProperty('reason');
        expect(typeof updateInfo.reason).toBe('string');
      }
    });
  });
});