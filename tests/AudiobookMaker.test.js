const AudiobookMaker = require('../src/AudiobookMaker');
const ConfigManager = require('../src/ConfigManager');
const FileHandler = require('../src/FileHandler');
const TTSService = require('../src/TTSService');
const FishSpeechService = require('../src/FishSpeechService');
const ThorstenVoiceService = require('../src/ThorstenVoiceService');
const VoicePreview = require('../src/VoicePreview');
const ProgressManager = require('../src/ProgressManager');
const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

// Mock all dependencies
jest.mock('../src/ConfigManager');
jest.mock('../src/FileHandler');
jest.mock('../src/TTSService');
jest.mock('../src/FishSpeechService');
jest.mock('../src/ThorstenVoiceService');
jest.mock('../src/VoicePreview');
jest.mock('../src/ProgressManager');
jest.mock('inquirer');
jest.mock('chalk', () => ({
  cyan: jest.fn(text => text),
  green: jest.fn(text => text),
  red: jest.fn(text => text),
  yellow: jest.fn(text => text),
  white: jest.fn(text => text),
  gray: jest.fn(text => text),
  blue: jest.fn(text => text),
  magenta: jest.fn(text => text),
  bold: jest.fn(text => text),
  dim: jest.fn(text => text),
}));
jest.mock('fs-extra');
jest.mock('child_process');
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  }));
});

describe('AudiobookMaker', () => {
  let audiobookMaker;
  let mockConfigManager;
  let mockFileHandler;
  let mockTTSService;
  let mockVoicePreview;
  let mockProgressManager;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Mock process.exit to prevent test termination
    jest.spyOn(process, 'exit').mockImplementation();
    
    // Setup default inquirer mock
    inquirer.prompt = jest.fn();

    // Setup mock instances
    mockConfigManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getCacheDir: jest.fn().mockReturnValue('/mock/cache'),
      configDir: '/mock/config',
      ensureApiKey: jest.fn().mockResolvedValue('mock-api-key'),
      manageApiKey: jest.fn().mockResolvedValue(undefined),
      clearCache: jest.fn().mockResolvedValue(undefined),
    };

    mockFileHandler = {
      selectFile: jest.fn().mockResolvedValue('/mock/file.pdf'),
      readFile: jest.fn().mockResolvedValue({
        content: 'Mock file content',
        type: 'pdf',
        characterCount: 100,
        wordCount: 20,
        pageCount: 1,
      }),
      splitTextIntoChunks: jest.fn().mockReturnValue(['chunk1', 'chunk2']),
      calculateCost: jest.fn().mockReturnValue({ estimatedCost: 0.15 }),
    };

    mockTTSService = {
      estimateProcessingTime: jest.fn().mockReturnValue('5 minutes'),
      processTextChunks: jest.fn().mockResolvedValue(['/mock/audio1.mp3', '/mock/audio2.mp3']),
      concatenateAudioFiles: jest.fn().mockResolvedValue(undefined),
    };

    mockVoicePreview = {
      showVoiceSelection: jest.fn().mockResolvedValue('nova'),
      getAdvancedSettings: jest.fn().mockResolvedValue({
        speed: 1.0,
        model: 'tts-1',
        outputOptions: 'single',
      }),
    };

    mockProgressManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      showResumeDialog: jest.fn().mockResolvedValue(null),
      findExistingSession: jest.fn().mockResolvedValue(null),
      createSession: jest.fn().mockResolvedValue({
        id: 'session-123',
        filePath: '/mock/file.pdf',
        fileName: 'file.pdf',
        options: {},
      }),
      updateProgress: jest.fn().mockResolvedValue(undefined),
      getSessionStats: jest.fn().mockResolvedValue({
        total: 5,
        completed: 3,
        inProgress: 1,
        failed: 1,
        totalProcessedChunks: 50,
      }),
      getRecentSessions: jest.fn().mockResolvedValue([]),
      clearOldSessions: jest.fn().mockResolvedValue(undefined),
      getTimeAgo: jest.fn().mockReturnValue('2 hours ago'),
    };

    // Mock constructors
    ConfigManager.mockImplementation(() => mockConfigManager);
    FileHandler.mockImplementation(() => mockFileHandler);
    TTSService.mockImplementation(() => mockTTSService);
    VoicePreview.mockImplementation(() => mockVoicePreview);
    ProgressManager.mockImplementation(() => mockProgressManager);

    // Mock fs-extra
    fs.ensureDir = jest.fn().mockResolvedValue(undefined);
    fs.remove = jest.fn().mockResolvedValue(undefined);
    fs.existsSync = jest.fn().mockReturnValue(true);

    audiobookMaker = new AudiobookMaker();
  });

  afterEach(() => {
    // Restore process.exit
    if (process.exit.mockRestore) {
      process.exit.mockRestore();
    }
  });

  describe('constructor', () => {
    test('should initialize with null dependencies', () => {
      expect(audiobookMaker.configManager).toBeNull();
      expect(audiobookMaker.fileHandler).toBeNull();
      expect(audiobookMaker.ttsService).toBeNull();
      expect(audiobookMaker.voicePreview).toBeNull();
      expect(audiobookMaker.progressManager).toBeNull();
    });
  });

  describe('initialize', () => {
    test('should initialize all services', async () => {
      await audiobookMaker.initialize();

      expect(ConfigManager).toHaveBeenCalled();
      expect(mockConfigManager.initialize).toHaveBeenCalled();
      expect(FileHandler).toHaveBeenCalled();
      expect(ProgressManager).toHaveBeenCalledWith('/mock/config');
      expect(mockProgressManager.initialize).toHaveBeenCalled();
    });
  });

  describe('manageConfig', () => {
    test('should delegate to configManager', async () => {
      audiobookMaker.configManager = mockConfigManager;
      
      await audiobookMaker.manageConfig();
      
      expect(mockConfigManager.manageApiKey).toHaveBeenCalled();
    });
  });

  describe('runInteractive', () => {
    test('should check for resumable sessions first', async () => {
      audiobookMaker.progressManager = mockProgressManager;
      audiobookMaker.showMainMenu = jest.fn().mockResolvedValue(undefined);

      await audiobookMaker.runInteractive();

      expect(mockProgressManager.showResumeDialog).toHaveBeenCalled();
      expect(audiobookMaker.showMainMenu).toHaveBeenCalled();
    });

    test('should resume session if available', async () => {
      const mockSession = { id: 'session-123' };
      mockProgressManager.showResumeDialog.mockResolvedValue(mockSession);
      audiobookMaker.progressManager = mockProgressManager;
      audiobookMaker.resumeSession = jest.fn().mockResolvedValue(undefined);

      await audiobookMaker.runInteractive();

      expect(audiobookMaker.resumeSession).toHaveBeenCalledWith(mockSession);
    });
  });

  describe('showMainMenu', () => {
    test('should handle convert action', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ action: 'convert' })
        .mockResolvedValueOnce({ action: 'exit' });
      
      audiobookMaker.startConversion = jest.fn().mockResolvedValue(undefined);

      await audiobookMaker.showMainMenu();

      expect(audiobookMaker.startConversion).toHaveBeenCalled();
    });

    test('should handle preview action', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ action: 'preview' })
        .mockResolvedValueOnce({ action: 'exit' });
      
      audiobookMaker.previewVoicesOnly = jest.fn().mockResolvedValue(undefined);

      await audiobookMaker.showMainMenu();

      expect(audiobookMaker.previewVoicesOnly).toHaveBeenCalled();
    });

    test('should handle config action', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ action: 'config' })
        .mockResolvedValueOnce({ action: 'exit' });
      
      audiobookMaker.configManager = mockConfigManager;

      await audiobookMaker.showMainMenu();

      expect(mockConfigManager.manageApiKey).toHaveBeenCalled();
    });

    test('should handle history action', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ action: 'history' })
        .mockResolvedValueOnce({ action: 'exit' });
      
      audiobookMaker.showSessionHistory = jest.fn().mockResolvedValue(undefined);

      await audiobookMaker.showMainMenu();

      expect(audiobookMaker.showSessionHistory).toHaveBeenCalled();
    });

    test('should handle clear_cache action', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ action: 'clear_cache' })
        .mockResolvedValueOnce({ action: 'exit' });
      
      audiobookMaker.configManager = mockConfigManager;

      await audiobookMaker.showMainMenu();

      expect(mockConfigManager.clearCache).toHaveBeenCalled();
    });
  });

  describe('startConversion', () => {
    beforeEach(() => {
      audiobookMaker.configManager = mockConfigManager;
      audiobookMaker.fileHandler = mockFileHandler;
      audiobookMaker.processFile = jest.fn().mockResolvedValue(undefined);
    });

    test('should initialize services and process file', async () => {
      await audiobookMaker.startConversion();

      expect(mockConfigManager.ensureApiKey).toHaveBeenCalled();
      expect(TTSService).toHaveBeenCalledWith('mock-api-key', '/mock/cache');
      expect(VoicePreview).toHaveBeenCalled();
      expect(mockFileHandler.selectFile).toHaveBeenCalled();
      expect(audiobookMaker.processFile).toHaveBeenCalledWith('/mock/file.pdf');
    });

    test('should handle file selection cancellation', async () => {
      mockFileHandler.selectFile.mockResolvedValue(null);

      await audiobookMaker.startConversion();

      expect(audiobookMaker.processFile).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockConfigManager.ensureApiKey.mockRejectedValue(new Error('API key error'));

      await audiobookMaker.startConversion();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Error: API key error'));
      consoleLogSpy.mockRestore();
    });
  });

  describe('processFile', () => {
    beforeEach(() => {
      audiobookMaker.configManager = mockConfigManager;
      audiobookMaker.fileHandler = mockFileHandler;
      audiobookMaker.progressManager = mockProgressManager;
      audiobookMaker.displayFileInfo = jest.fn();
      audiobookMaker.getConversionSettings = jest.fn().mockResolvedValue({
        provider: 'openai',
        voice: 'nova',
        speed: 1.0,
        model: 'tts-1',
        outputOptions: 'single',
      });
      audiobookMaker.convertToAudio = jest.fn().mockResolvedValue(undefined);
    });

    test('should process file successfully', async () => {
      await audiobookMaker.processFile('/mock/file.pdf');

      expect(mockFileHandler.readFile).toHaveBeenCalledWith('/mock/file.pdf');
      expect(mockFileHandler.splitTextIntoChunks).toHaveBeenCalled();
      expect(mockFileHandler.calculateCost).toHaveBeenCalled();
      expect(audiobookMaker.displayFileInfo).toHaveBeenCalled();
      expect(mockProgressManager.createSession).toHaveBeenCalled();
      expect(audiobookMaker.convertToAudio).toHaveBeenCalled();
    });

    test('should handle CLI options', async () => {
      const cliOptions = { voice: 'alloy', speed: 1.2, model: 'tts-1-hd' };
      audiobookMaker.initializeServices = jest.fn().mockResolvedValue(undefined);

      await audiobookMaker.processFile('/mock/file.pdf', cliOptions);

      expect(audiobookMaker.getConversionSettings).toHaveBeenCalledWith(cliOptions);
    });

    test('should handle existing session resume', async () => {
      const existingSession = {
        id: 'existing-123',
        progress: { completedChunks: 5 },
      };
      mockProgressManager.findExistingSession.mockResolvedValue(existingSession);
      audiobookMaker.promptResumeExisting = jest.fn().mockResolvedValue(true);
      audiobookMaker.resumeSession = jest.fn().mockResolvedValue(undefined);

      await audiobookMaker.processFile('/mock/file.pdf');

      expect(audiobookMaker.resumeSession).toHaveBeenCalledWith(
        existingSession,
        expect.objectContaining({ chunks: expect.any(Array) })
      );
    });

    test('should handle conversion settings cancellation', async () => {
      audiobookMaker.getConversionSettings.mockResolvedValue(null);

      await audiobookMaker.processFile('/mock/file.pdf');

      expect(audiobookMaker.convertToAudio).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockFileHandler.readFile.mockRejectedValue(new Error('File read error'));

      await audiobookMaker.processFile('/mock/file.pdf');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Error processing file: File read error')
      );
      consoleLogSpy.mockRestore();
    });
  });

  describe('initializeServices', () => {
    beforeEach(() => {
      audiobookMaker.configManager = mockConfigManager;
    });

    test('should initialize OpenAI service', async () => {
      await audiobookMaker.initializeServices('openai');

      expect(mockConfigManager.ensureApiKey).toHaveBeenCalled();
      expect(TTSService).toHaveBeenCalledWith('mock-api-key', '/mock/cache');
      expect(VoicePreview).toHaveBeenCalled();
    });

    test('should initialize Fish Speech service', async () => {
      const mockFishService = { isAvailable: jest.fn().mockResolvedValue(true) };
      FishSpeechService.mockImplementation(() => mockFishService);

      await audiobookMaker.initializeServices('fishspeech');

      expect(FishSpeechService).toHaveBeenCalledWith('/mock/cache');
      expect(mockFishService.isAvailable).toHaveBeenCalled();
      expect(VoicePreview).toHaveBeenCalled();
    });

    test('should initialize Thorsten-Voice service', async () => {
      const mockThorstenService = { isAvailable: jest.fn().mockResolvedValue(true) };
      ThorstenVoiceService.mockImplementation(() => mockThorstenService);

      await audiobookMaker.initializeServices('thorsten');

      expect(ThorstenVoiceService).toHaveBeenCalledWith('/mock/cache');
      expect(mockThorstenService.isAvailable).toHaveBeenCalled();
      expect(VoicePreview).toHaveBeenCalled();
    });

    test('should throw error if Fish Speech not available', async () => {
      const mockFishService = { isAvailable: jest.fn().mockResolvedValue(false) };
      FishSpeechService.mockImplementation(() => mockFishService);

      await expect(audiobookMaker.initializeServices('fishspeech')).rejects.toThrow(
        'Fish Speech not available'
      );
    });

    test('should throw error if Thorsten-Voice not available', async () => {
      const mockThorstenService = { isAvailable: jest.fn().mockResolvedValue(false) };
      ThorstenVoiceService.mockImplementation(() => mockThorstenService);

      await expect(audiobookMaker.initializeServices('thorsten')).rejects.toThrow(
        'Thorsten-Voice not available'
      );
    });

    test('should throw error if OpenAI API key missing', async () => {
      mockConfigManager.ensureApiKey.mockResolvedValue(null);

      await expect(audiobookMaker.initializeServices('openai')).rejects.toThrow(
        'OpenAI API key required'
      );
    });
  });

  describe('convertToAudio', () => {
    beforeEach(() => {
      audiobookMaker.ttsService = mockTTSService;
      audiobookMaker.progressManager = mockProgressManager;
      audiobookMaker.displayCompletionSummary = jest.fn().mockResolvedValue(undefined);
      audiobookMaker.cleanupChunkFiles = jest.fn().mockResolvedValue(undefined);
    });

    test('should convert audio successfully with single output', async () => {
      const session = {
        id: 'session-123',
        filePath: '/mock/file.pdf',
      };
      const chunks = ['chunk1', 'chunk2'];
      const fileData = { content: 'test content' };
      const settings = {
        voice: 'nova',
        model: 'tts-1',
        speed: 1.0,
        outputOptions: 'single',
      };

      await audiobookMaker.convertToAudio(session, chunks, fileData, settings);

      expect(fs.ensureDir).toHaveBeenCalled();
      expect(mockTTSService.processTextChunks).toHaveBeenCalledWith(
        chunks,
        expect.objectContaining({
          voice: 'nova',
          model: 'tts-1',
          speed: 1.0,
        }),
        expect.any(Function)
      );
      expect(mockTTSService.concatenateAudioFiles).toHaveBeenCalled();
      expect(mockProgressManager.updateProgress).toHaveBeenCalledWith(
        'session-123',
        expect.objectContaining({ status: 'completed' })
      );
    });

    test('should handle separate output option', async () => {
      const session = { id: 'session-123', filePath: '/mock/file.pdf' };
      const settings = { outputOptions: 'separate' };

      await audiobookMaker.convertToAudio(session, [], {}, settings);

      expect(mockTTSService.concatenateAudioFiles).not.toHaveBeenCalled();
      expect(audiobookMaker.cleanupChunkFiles).not.toHaveBeenCalled();
    });

    test('should handle both output option', async () => {
      const session = { id: 'session-123', filePath: '/mock/file.pdf' };
      const settings = { outputOptions: 'both' };

      await audiobookMaker.convertToAudio(session, [], {}, settings);

      expect(mockTTSService.concatenateAudioFiles).toHaveBeenCalled();
      expect(audiobookMaker.cleanupChunkFiles).not.toHaveBeenCalled();
    });

    test('should handle conversion errors', async () => {
      const session = { id: 'session-123', filePath: '/mock/file.pdf' };
      mockTTSService.processTextChunks.mockRejectedValue(new Error('TTS error'));

      await expect(audiobookMaker.convertToAudio(session, [], {}, {})).rejects.toThrow('TTS error');

      expect(mockProgressManager.updateProgress).toHaveBeenCalledWith(
        'session-123',
        expect.objectContaining({
          status: 'failed',
          error: 'TTS error',
        })
      );
    });
  });

  describe('checkThorstenPythonCompatibility', () => {
    test('should return true for compatible Python versions', async () => {
      const { exec } = require('child_process');
      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('python3.11')) {
          callback(null, { stdout: 'Python 3.11.0' });
        } else {
          callback(new Error('not found'));
        }
      });

      const result = await audiobookMaker.checkThorstenPythonCompatibility();
      expect(result).toBe(true);
    });

    test('should return false for incompatible Python versions', async () => {
      const { exec } = require('child_process');
      exec.mockImplementation((cmd, callback) => {
        if (cmd.includes('python3.11') || cmd.includes('python3.10') || cmd.includes('python3.9')) {
          callback(new Error('not found'));
        } else if (cmd.includes('python3 --version')) {
          callback(null, { stdout: 'Python 3.13.0' });
        } else {
          callback(new Error('not found'));
        }
      });

      const result = await audiobookMaker.checkThorstenPythonCompatibility();
      expect(result).toBe(false);
    });
  });

  describe('getStatusEmoji', () => {
    test('should return correct emojis for different statuses', () => {
      expect(audiobookMaker.getStatusEmoji('completed')).toBe('✅');
      expect(audiobookMaker.getStatusEmoji('processing')).toBe('🔄');
      expect(audiobookMaker.getStatusEmoji('failed')).toBe('❌');
      expect(audiobookMaker.getStatusEmoji('unknown')).toBe('⏳');
    });
  });

  describe('showSessionHistory', () => {
    test('should display session statistics and recent sessions', async () => {
      const mockSessions = [
        {
          fileName: 'test.pdf',
          status: 'completed',
          progress: { completedChunks: 10, totalChunks: 10 },
          updatedAt: new Date(),
        },
      ];
      mockProgressManager.getRecentSessions.mockResolvedValue(mockSessions);
      inquirer.prompt.mockResolvedValue({ action: 'back' });

      audiobookMaker.progressManager = mockProgressManager;
      audiobookMaker.getStatusEmoji = jest.fn().mockReturnValue('✅');

      await audiobookMaker.showSessionHistory();

      expect(mockProgressManager.getSessionStats).toHaveBeenCalled();
      expect(mockProgressManager.getRecentSessions).toHaveBeenCalledWith(10);
    });

    test('should handle clear sessions action', async () => {
      inquirer.prompt.mockResolvedValue({ action: 'clear' });
      audiobookMaker.progressManager = mockProgressManager;

      await audiobookMaker.showSessionHistory();

      expect(mockProgressManager.clearOldSessions).toHaveBeenCalled();
    });
  });
});