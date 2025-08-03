// Mock all dependencies before importing
jest.mock('commander', () => ({
  program: {
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    version: jest.fn().mockReturnThis(),
    argument: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    opts: jest.fn(() => ({})),
    args: [],
  },
}));

jest.mock('chalk', () => ({
  cyan: jest.fn(text => text),
  red: jest.fn(text => text),
  yellow: jest.fn(text => text),
  green: jest.fn(text => text),
  blue: jest.fn(text => text),
  magenta: jest.fn(text => text),
  bold: jest.fn(text => text),
  dim: jest.fn(text => text),
  white: jest.fn(text => text),
  gray: jest.fn(text => text),
}));

jest.mock('fs-extra', () => ({
  existsSync: jest.fn(),
}));

// Mock AudiobookMaker class
const mockAudiobookMaker = {
  initialize: jest.fn().mockResolvedValue(undefined),
  manageConfig: jest.fn().mockResolvedValue(undefined),
  processFile: jest.fn().mockResolvedValue(undefined),
  runInteractive: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../src/AudiobookMaker', () => {
  return jest.fn().mockImplementation(() => mockAudiobookMaker);
});

// Mock other dependencies that AudiobookMaker might need
jest.mock('inquirer');
jest.mock('axios');
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  }));
});

// Mock crypto
jest.mock('crypto', () => ({
  scryptSync: jest.fn(),
  randomBytes: jest.fn(),
  createCipher: jest.fn(() => ({
    update: jest.fn(),
    final: jest.fn(),
  })),
  createDecipher: jest.fn(() => ({
    update: jest.fn(),
    final: jest.fn(),
  })),
}));

// Import the modules after mocking
const { program } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const AudiobookMaker = require('../src/AudiobookMaker');

describe('CLI', () => {
  let originalExit;
  let originalConsoleLog;
  let originalConsoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock process methods
    originalExit = process.exit;
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    
    process.exit = jest.fn();
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    // Restore original methods
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    
    // Remove CLI module from cache to allow fresh imports
    delete require.cache[require.resolve('../cli.js')];
  });

  describe('CLI Module Loading', () => {
    test('should load and configure commander correctly', () => {
      require('../cli.js');

      expect(program.name).toHaveBeenCalledWith('aiabm');
      expect(program.description).toHaveBeenCalledWith(
        'AI Audiobook Maker - Convert PDFs and text files to audiobooks'
      );
      expect(program.version).toHaveBeenCalledWith('4.0.6');
    });

    test('should configure CLI arguments and options', () => {
      require('../cli.js');

      expect(program.argument).toHaveBeenCalledWith(
        '[file]',
        'Path to PDF or text file to convert'
      );
      expect(program.option).toHaveBeenCalledWith(
        '-v, --voice <voice>',
        'Voice to use (alloy, echo, fable, onyx, nova, shimmer)'
      );
      expect(program.option).toHaveBeenCalledWith(
        '-s, --speed <speed>',
        'Speech speed (0.25-4.0)',
        '1.0'
      );
      expect(program.option).toHaveBeenCalledWith(
        '-m, --model <model>',
        'TTS model (tts-1, tts-1-hd)',
        'tts-1'
      );
      expect(program.option).toHaveBeenCalledWith(
        '--config',
        'Manage API key configuration'
      );
    });

    test('should display welcome banner', () => {
      require('../cli.js');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('🎧 AI AUDIOBOOK MAKER v4.0.6 🎧')
      );
    });
  });

  describe('Process Event Handlers', () => {
    test('should handle uncaught exceptions', () => {
      require('../cli.js');

      const error = new Error('Test uncaught error');
      process.emit('uncaughtException', error);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Unexpected error: Test uncaught error')
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    test('should handle unhandled rejections', () => {
      require('../cli.js');

      const reason = 'Test promise rejection';
      const promise = Promise.resolve(); // Use resolved promise to avoid actual rejection
      process.emit('unhandledRejection', reason, promise);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Unhandled rejection: Test promise rejection')
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    test('should handle SIGINT gracefully', () => {
      require('../cli.js');

      process.emit('SIGINT');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('👋 Goodbye! Thank you for using AI Audiobook Maker! 🌟')
      );
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('CLI Configuration Tests', () => {
    test('should setup proper commander configuration', () => {
      require('../cli.js');

      // Verify parse was called to process command line arguments
      expect(program.parse).toHaveBeenCalled();
    });

    test('should have correct version number', () => {
      require('../cli.js');

      expect(program.version).toHaveBeenCalledWith('4.0.6');
    });

    test('should configure all required CLI options', () => {
      require('../cli.js');

      // Check that all expected options were configured
      const optionCalls = program.option.mock.calls;
      const optionNames = optionCalls.map(call => call[0]);

      expect(optionNames).toContain('-v, --voice <voice>');
      expect(optionNames).toContain('-s, --speed <speed>');
      expect(optionNames).toContain('-m, --model <model>');
      expect(optionNames).toContain('--config');
    });
  });

  describe('Error Handling Setup', () => {
    test('should register process event handlers', () => {
      const originalListenerCount = process.listenerCount.bind(process);
      let listenerCounts = {};

      // Mock listenerCount to track when listeners are added
      process.listenerCount = jest.fn((event) => {
        const count = originalListenerCount(event);
        listenerCounts[event] = count;
        return count;
      });

      require('../cli.js');

      // Check that event handlers exist by testing if they can be triggered
      expect(() => process.emit('uncaughtException', new Error('test'))).not.toThrow();
      expect(() => process.emit('unhandledRejection', 'test', Promise.resolve())).not.toThrow();
      expect(() => process.emit('SIGINT')).not.toThrow();

      process.listenerCount = originalListenerCount;
    });

    test('should handle process exit codes correctly', () => {
      require('../cli.js');

      // Test uncaught exception exit code
      process.emit('uncaughtException', new Error('test'));
      expect(process.exit).toHaveBeenCalledWith(1);

      // Reset and test unhandled rejection exit code
      process.exit.mockClear();
      process.emit('unhandledRejection', 'test');
      expect(process.exit).toHaveBeenCalledWith(1);

      // Reset and test SIGINT exit code
      process.exit.mockClear();
      process.emit('SIGINT');
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('Module Integration', () => {
    test('should import all required dependencies', () => {
      // This test verifies that the module can load without errors
      expect(() => require('../cli.js')).not.toThrow();
    });

    test('should setup chalk for console styling', () => {
      require('../cli.js');

      // Verify chalk functions are called for styling
      expect(chalk.cyan).toHaveBeenCalled();
    });

    test('should configure program with correct metadata', () => {
      require('../cli.js');

      expect(program.name).toHaveBeenCalledWith('aiabm');
      expect(program.description).toHaveBeenCalledWith(
        expect.stringContaining('Convert PDFs and text files to audiobooks')
      );
    });
  });
});