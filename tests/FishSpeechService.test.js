const FishSpeechService = require('../src/FishSpeechService');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const os = require('os');

jest.mock('fs-extra');
jest.mock('child_process');
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
  getPreviewCacheFilename: jest.fn().mockReturnValue('preview_fishspeech_test_voice_en.wav')
}));

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
      fs.pathExists.mockResolvedValue(false);
      fishSpeechService.generateAudioFile = jest.fn().mockResolvedValue();

      await fishSpeechService.generateVoicePreview('de-female-1');

      expect(detectVoiceLanguage).toHaveBeenCalledWith('de-female-1');
      expect(getPreviewText).toHaveBeenCalledWith('en', 'short');
      expect(getPreviewCacheFilename).toHaveBeenCalledWith('fishspeech', 'de-female-1', 'en');
    });

    test('should return cached preview if exists', async () => {
      const cachedPath = path.join('/test/cache', 'previews', 'preview_fishspeech_test_voice_en.wav');
      fs.pathExists.mockResolvedValue(true);

      const result = await fishSpeechService.generateVoicePreview('test-voice');

      expect(result).toBe(cachedPath);
      expect(fs.ensureDir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    test('should generate new preview if cache miss', async () => {
      fs.pathExists.mockResolvedValue(false);
      fishSpeechService.generateAudioFile = jest.fn().mockResolvedValue();

      const result = await fishSpeechService.generateVoicePreview('en-female-1');

      expect(fs.ensureDir).toHaveBeenCalled();
      expect(fishSpeechService.generateAudioFile).toHaveBeenCalledWith(
        'This is a test preview.',
        expect.stringContaining('preview_fishspeech_test_voice_en.wav'),
        'en-female-1'
      );
    });

    test('should handle generation errors gracefully', async () => {
      fs.pathExists.mockResolvedValue(false);
      fishSpeechService.generateAudioFile = jest.fn().mockRejectedValue(new Error('Generation failed'));

      const result = await fishSpeechService.generateVoicePreview('test-voice');

      expect(result).toBeNull();
    });
  });

  describe('isAvailable', () => {
    beforeEach(() => {
      fs.pathExists = jest.fn();
      fs.readFile = jest.fn();
      fs.writeFile = jest.fn();
      fs.remove = jest.fn();
      jest.spyOn(os, 'homedir').mockReturnValue('/mock/home');
    });

    test('should return false if installation marker does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await fishSpeechService.isAvailable();

      expect(result).toBe(false);
      expect(fs.pathExists).toHaveBeenCalledWith('/mock/home/.aiabm/fish-speech/.installation_complete');
    });

    test('should return false if fish-speech directory does not exist', async () => {
      fs.pathExists.mockImplementation((path) => {
        if (path.includes('.installation_complete')) return Promise.resolve(true);
        if (path.includes('fish-speech/fish-speech')) return Promise.resolve(false);
        return Promise.resolve(true);
      });

      const result = await fishSpeechService.isAvailable();

      expect(result).toBe(false);
    });

    test('should return true if all checks pass', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({
        version: '1.2',
        installedAt: new Date().toISOString()
      }));

      // Mock successful exec command
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      exec.mockImplementation((cmd, options, callback) => {
        callback(null, { stdout: 'All dependencies verified successfully!', stderr: '' });
      });

      fishSpeechService.getPythonCommand = jest.fn().mockResolvedValue('python3');

      const result = await fishSpeechService.isAvailable();

      expect(result).toBe(true);
      expect(fishSpeechService.isInstalled).toBe(true);
    });

    test('should handle dependency check failure and remove marker', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify({ version: '1.2' }));

      // Mock failed exec command
      exec.mockImplementation((cmd, options, callback) => {
        callback(new Error('ImportError: No module named fish_speech'), null);
      });

      fishSpeechService.getPythonCommand = jest.fn().mockResolvedValue('python3');

      const result = await fishSpeechService.isAvailable();

      expect(result).toBe(false);
      expect(fs.remove).toHaveBeenCalledWith('/mock/home/.aiabm/fish-speech/.installation_complete');
    });
  });

  describe('processTextChunks', () => {
    beforeEach(() => {
      fs.ensureDir = jest.fn();
      fishSpeechService.generateAudioFile = jest.fn().mockResolvedValue();
    });

    test('should process text chunks and generate audio files', async () => {
      const chunks = ['First chunk text', 'Second chunk text'];
      const options = { outputDir: '/test/output', voice: 'de-female-1' };
      const onProgress = jest.fn();

      const result = await fishSpeechService.processTextChunks(chunks, options, onProgress);

      expect(fs.ensureDir).toHaveBeenCalledWith('/test/output');
      expect(fishSpeechService.generateAudioFile).toHaveBeenCalledTimes(2);
      expect(fishSpeechService.generateAudioFile).toHaveBeenNthCalledWith(
        1,
        'First chunk text',
        '/test/output/chunk_001.wav',
        'de-female-1'
      );
      expect(fishSpeechService.generateAudioFile).toHaveBeenNthCalledWith(
        2,
        'Second chunk text',
        '/test/output/chunk_002.wav',
        'de-female-1'
      );
      expect(result).toHaveLength(2);
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    test('should handle chunk processing errors', async () => {
      const chunks = ['Good chunk', 'Bad chunk'];
      const options = { voice: 'test-voice' };
      
      fishSpeechService.generateAudioFile = jest.fn()
        .mockResolvedValueOnce() // First chunk succeeds
        .mockRejectedValueOnce(new Error('Generation failed')); // Second chunk fails

      await expect(fishSpeechService.processTextChunks(chunks, options)).rejects.toThrow('Generation failed');
    });
  });

  describe('getPythonCommand', () => {
    beforeEach(() => {
      jest.spyOn(os, 'homedir').mockReturnValue('/mock/home');
      fs.pathExists = jest.fn();
    });

    test('should return venv python if exists', async () => {
      fs.pathExists.mockResolvedValue(true);

      const result = await fishSpeechService.getPythonCommand();

      expect(result).toBe('/mock/home/.aiabm/fish-speech/venv/bin/python');
      expect(fs.pathExists).toHaveBeenCalledWith('/mock/home/.aiabm/fish-speech/venv/bin/python');
    });

    test('should fallback to system python if venv does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      // Mock successful exec
      exec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'Python 3.9.0' });
      });

      const result = await fishSpeechService.getPythonCommand();

      expect(result).toBe('python');
    });

    test('should fallback to python3 if python fails', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      // Mock exec failure
      exec.mockImplementation((cmd, callback) => {
        callback(new Error('python not found'));
      });

      const result = await fishSpeechService.getPythonCommand();

      expect(result).toBe('python3');
    });
  });

  describe('checkFfmpeg', () => {
    test('should resolve if ffmpeg is available', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'ffmpeg version 4.4.0' });
      });

      await expect(fishSpeechService.checkFfmpeg()).resolves.toBeUndefined();
    });

    test('should reject if ffmpeg is not available', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(new Error('ffmpeg not found'));
      });

      await expect(fishSpeechService.checkFfmpeg()).rejects.toThrow('ffmpeg not found');
    });
  });

  describe('combineAudioFiles', () => {
    beforeEach(() => {
      fs.writeFile = jest.fn();
      fs.remove = jest.fn();
      fishSpeechService.checkFfmpeg = jest.fn().mockResolvedValue();
    });

    test('should combine audio files successfully', async () => {
      const audioFiles = ['/test/chunk1.wav', '/test/chunk2.wav'];
      const outputPath = '/test/output.wav';
      
      exec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'success' });
      });

      const result = await fishSpeechService.combineAudioFiles(audioFiles, outputPath);

      expect(fishSpeechService.checkFfmpeg).toHaveBeenCalled();
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

      await expect(fishSpeechService.combineAudioFiles(audioFiles, outputPath))
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

      const result = await fishSpeechService.checkForUpdates();

      expect(result).toEqual({ needsUpdate: false, reason: 'Not installed' });
    });

    test('should return update needed if installation is old', async () => {
      fs.pathExists.mockResolvedValue(true);
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days ago
      
      fs.readFile.mockResolvedValue(JSON.stringify({
        version: '1.2',
        installedAt: oldDate.toISOString()
      }));

      const result = await fishSpeechService.checkForUpdates();

      expect(result.needsUpdate).toBe(true);
      expect(result.reason).toContain('35 days old');
    });

    test('should return no update needed if installation is recent', async () => {
      fs.pathExists.mockResolvedValue(true);
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days ago
      
      fs.readFile.mockResolvedValue(JSON.stringify({
        version: '1.2',
        installedAt: recentDate.toISOString()
      }));

      const result = await fishSpeechService.checkForUpdates();

      expect(result.needsUpdate).toBe(false);
      expect(result.daysSince).toBe(10);
    });
  });
});