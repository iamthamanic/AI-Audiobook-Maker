const ThorstenVoiceService = require('../src/ThorstenVoiceService');
const fs = require('fs-extra');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

jest.mock('fs-extra');
jest.mock('child_process');
jest.mock('chalk', () => ({
  cyan: jest.fn(str => str),
  red: jest.fn(str => str),
  green: jest.fn(str => str),
  gray: jest.fn(str => str),
  yellow: jest.fn(str => str),
  white: jest.fn(str => str)
}));
jest.mock('../src/PreviewTexts', () => ({
  getPreviewText: jest.fn().mockReturnValue('Das ist eine Testvorschau.'),
  detectVoiceLanguage: jest.fn().mockReturnValue('de'),
  getPreviewCacheFilename: jest.fn().mockReturnValue('preview_thorsten_test_voice_de.wav')
}));

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

  describe('generateVoicePreview (unified preview system)', () => {
    const { getPreviewText, detectVoiceLanguage, getPreviewCacheFilename } = require('../src/PreviewTexts');

    beforeEach(() => {
      fs.pathExists = jest.fn();
      fs.ensureDir = jest.fn();
      fs.writeFile = jest.fn();
      getPreviewText.mockClear();
      detectVoiceLanguage.mockClear();
      getPreviewCacheFilename.mockClear();
    });

    test('should use unified preview text system', async () => {
      // Mock isAvailable to return true for this test
      thorstenService.isAvailable = jest.fn().mockResolvedValue(true);
      fs.pathExists.mockResolvedValue(false);
      fs.ensureDir.mockResolvedValue(undefined);
      thorstenService.generateAudioFile = jest.fn().mockResolvedValue();

      await thorstenService.generateVoicePreview('thorsten-male');

      expect(detectVoiceLanguage).toHaveBeenCalledWith('thorsten-male');
      expect(getPreviewText).toHaveBeenCalledWith('de', 'short');
      expect(getPreviewCacheFilename).toHaveBeenCalledWith('thorsten', 'thorsten-male', 'de');
    });

    test('should return cached preview if exists', async () => {
      const cachedPath = path.join('/test/cache', 'previews', 'preview_thorsten_test_voice_de.wav');
      // Mock isAvailable to return true for this test
      thorstenService.isAvailable = jest.fn().mockResolvedValue(true);
      fs.pathExists.mockResolvedValue(true);

      const result = await thorstenService.generateVoicePreview('thorsten-male');

      expect(result).toBe(cachedPath);
      expect(fs.ensureDir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    test('should generate new preview if cache miss', async () => {
      // Mock isAvailable to return true for this test
      thorstenService.isAvailable = jest.fn().mockResolvedValue(true);
      fs.pathExists.mockResolvedValue(false);
      fs.ensureDir.mockResolvedValue(undefined);
      thorstenService.generateAudioFile = jest.fn().mockResolvedValue();

      await thorstenService.generateVoicePreview('thorsten-emotional');

      expect(fs.ensureDir).toHaveBeenCalled();
      expect(thorstenService.generateAudioFile).toHaveBeenCalledWith(
        'Das ist eine Testvorschau.',
        expect.stringContaining('preview_thorsten_test_voice_de.wav'),
        'thorsten-emotional'
      );
    });

    test('should handle generation errors gracefully', async () => {
      fs.pathExists.mockResolvedValue(false);
      thorstenService.generateAudioFile = jest.fn().mockRejectedValue(new Error('TTS failed'));

      const result = await thorstenService.generateVoicePreview('thorsten-male');

      expect(result).toBeNull();
    });
  });

  describe('isAvailable', () => {
    beforeEach(() => {
      fs.pathExists = jest.fn();
      fs.readFile = jest.fn();
      jest.spyOn(os, 'homedir').mockReturnValue('/mock/home');
    });

    test('should return false if installation marker does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await thorstenService.isAvailable();

      expect(result).toBe(false);
      expect(fs.pathExists).toHaveBeenCalledWith('/mock/home/.aiabm/thorsten-voice/.installation_complete');
    });

    test('should return true if all checks pass', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({
        version: '0.22.0',
        installedAt: new Date().toISOString()
      }));

      // Mock successful exec commands
      exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('import TTS')) {
          callback(null, { stdout: 'TTS available', stderr: '' });
        } else if (cmd.includes('TTS(')) {
          callback(null, { stdout: 'Thorsten model available', stderr: '' });
        } else {
          callback(null, { stdout: 'success', stderr: '' });
        }
      });

      thorstenService.getPythonCommand = jest.fn().mockResolvedValue('python3');

      const result = await thorstenService.isAvailable();

      expect(result).toBe(true);
      expect(thorstenService.isInstalled).toBe(true);
    });

    test('should handle dependency check failure', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({ version: '0.22.0' }));

      // Mock failed exec command
      exec.mockImplementation((cmd, options, callback) => {
        callback(new Error('TTS not found'), null);
      });

      thorstenService.getPythonCommand = jest.fn().mockResolvedValue('python3');

      const result = await thorstenService.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('processTextChunks', () => {
    beforeEach(() => {
      fs.ensureDir = jest.fn();
      thorstenService.generateAudioFile = jest.fn().mockResolvedValue();
    });

    test('should process text chunks and generate audio files', async () => {
      // Mock isAvailable to return true for this test
      thorstenService.isAvailable = jest.fn().mockResolvedValue(true);
      const chunks = ['Hallo Welt', 'Das ist ein Test'];
      const options = { outputDir: '/test/output', voice: 'thorsten-male' };
      const onProgress = jest.fn();
      fs.ensureDir.mockResolvedValue(undefined);
      thorstenService.generateAudioFile = jest.fn().mockResolvedValue();

      const result = await thorstenService.processTextChunks(chunks, options, onProgress);

      expect(fs.ensureDir).toHaveBeenCalledWith('/test/output');
      expect(thorstenService.generateAudioFile).toHaveBeenCalledTimes(2);
      expect(thorstenService.generateAudioFile).toHaveBeenNthCalledWith(
        1,
        'Hallo Welt',
        '/test/output/chunk_001.wav',
        'thorsten-male'
      );
      expect(result).toHaveLength(2);
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    test('should handle chunk processing errors', async () => {
      // Mock isAvailable to return true for this test
      thorstenService.isAvailable = jest.fn().mockResolvedValue(true);
      const chunks = ['Good chunk', 'Bad chunk'];
      const options = { voice: 'thorsten-male' };
      fs.ensureDir.mockResolvedValue(undefined);
      
      thorstenService.generateAudioFile = jest.fn()
        .mockResolvedValueOnce() // First chunk succeeds
        .mockRejectedValueOnce(new Error('TTS generation failed')); // Second chunk fails

      await expect(thorstenService.processTextChunks(chunks, options)).rejects.toThrow('TTS generation failed');
    });
  });

  describe('checkPythonInstallation', () => {
    test('should find compatible Python version', async () => {
      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('python3.11')) {
          callback(null, { stdout: 'Python 3.11.0' });
        } else {
          callback(new Error('not found'));
        }
      });

      const result = await thorstenService.checkPythonInstallation();

      expect(result).toBe('Python 3.11.0');
    });

    test('should reject Python 3.13+', async () => {
      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('python3.11') || cmd.includes('python3.10') || cmd.includes('python3.9')) {
          callback(new Error('not found'));
        } else {
          callback(null, { stdout: 'Python 3.13.0' });
        }
      });

      await expect(thorstenService.checkPythonInstallation())
        .rejects.toThrow('Coqui TTS requires Python 3.9-3.11, found Python 3.13.0');
    });

    test('should reject Python < 3.9', async () => {
      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('python3.11') || cmd.includes('python3.10') || cmd.includes('python3.9')) {
          callback(new Error('not found'));
        } else {
          callback(null, { stdout: 'Python 3.8.0' });
        }
      });

      await expect(thorstenService.checkPythonInstallation())
        .rejects.toThrow('Coqui TTS requires Python 3.9+, found Python 3.8.0');
    });

    test('should handle no Python found', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(new Error('Python not found'));
      });

      await expect(thorstenService.checkPythonInstallation())
        .rejects.toThrow('Python not found. Please install Python 3.9-3.11');
    });
  });

  describe('getPythonCommand', () => {
    beforeEach(() => {
      jest.spyOn(os, 'homedir').mockReturnValue('/mock/home');
      fs.pathExists = jest.fn();
    });

    test('should return venv python if exists', async () => {
      fs.pathExists.mockResolvedValue(true);

      const result = await thorstenService.getPythonCommand();

      expect(result).toBe('/mock/home/.aiabm/thorsten-voice/venv/bin/python');
    });

    test('should fallback to system python if venv does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      // Mock successful exec
      exec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'Python 3.10.0' });
      });

      const result = await thorstenService.getPythonCommand();

      expect(result).toBe('python');
    });

    test('should fallback to python3 if python fails', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      // Mock exec failure
      exec.mockImplementation((cmd, callback) => {
        callback(new Error('python not found'));
      });

      const result = await thorstenService.getPythonCommand();

      expect(result).toBe('python3');
    });
  });

  describe('combineAudioFiles', () => {
    beforeEach(() => {
      fs.writeFile = jest.fn();
      fs.remove = jest.fn();
      thorstenService.checkFfmpeg = jest.fn().mockResolvedValue();
    });

    test('should combine audio files successfully', async () => {
      const audioFiles = ['/test/chunk1.wav', '/test/chunk2.wav'];
      const outputPath = '/test/output.wav';
      
      exec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'success' });
      });

      const result = await thorstenService.combineAudioFiles(audioFiles, outputPath);

      expect(thorstenService.checkFfmpeg).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(fs.remove).toHaveBeenCalled();
      expect(result).toBe(outputPath);
    });

    test('should handle ffmpeg errors', async () => {
      const audioFiles = ['/test/chunk1.wav'];
      const outputPath = '/test/output.wav';
      
      exec.mockImplementation((cmd, callback) => {
        callback(new Error('ffmpeg failed'));
      });

      await expect(thorstenService.combineAudioFiles(audioFiles, outputPath))
        .rejects.toThrow('ffmpeg failed');
    });
  });

  describe('checkForUpdates', () => {
    beforeEach(() => {
      jest.spyOn(os, 'homedir').mockReturnValue('/mock/home');
      fs.pathExists = jest.fn();
      fs.readFile = jest.fn();
    });

    test('should return no update needed if not installed', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await thorstenService.checkForUpdates();

      expect(result).toEqual({ needsUpdate: false, reason: 'Not installed' });
    });

    test('should return update needed if installation is old', async () => {
      fs.pathExists.mockResolvedValue(true);
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days ago
      
      fs.readFile.mockResolvedValue(JSON.stringify({
        version: '0.22.0',
        installedAt: oldDate.toISOString()
      }));

      const result = await thorstenService.checkForUpdates();

      expect(result.needsUpdate).toBe(true);
      expect(result.reason).toContain('35 days old');
    });

    test('should return no update needed if installation is recent', async () => {
      fs.pathExists.mockResolvedValue(true);
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days ago
      
      fs.readFile.mockResolvedValue(JSON.stringify({
        version: '0.22.0',
        installedAt: recentDate.toISOString()
      }));

      const result = await thorstenService.checkForUpdates();

      expect(result.needsUpdate).toBe(false);
      expect(result.daysSince).toBe(10);
    });
  });
});