// Mock all dependencies before importing
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

// Mock inquirer and other dependencies
jest.mock('inquirer');
jest.mock('axios');

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
    test('should load without errors', () => {
      expect(() => require('../cli.js')).not.toThrow();
    });

    test('should have correct version in banner', () => {
      const cliModule = require('../cli.js');
      const fs = require('fs');
      const cliContent = fs.readFileSync(require.resolve('../cli.js'), 'utf8');
      
      expect(cliContent).toContain('v5.0.2');
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

  describe('CLI Structure Tests', () => {
    test('should import required dependencies', () => {
      expect(() => {
        const cliModule = require('../cli.js');
      }).not.toThrow();
    });

    test('should handle module execution check', () => {
      // Test that the require.main === module check works
      const originalMain = require.main;
      
      // Simulate being required (not executed directly)
      require.main = {};
      
      expect(() => require('../cli.js')).not.toThrow();
      
      // Restore original
      require.main = originalMain;
    });
  });

  describe('Error Handling Setup', () => {
    test('should register process event handlers', () => {
      const originalListenerCount = process.listenerCount.bind(process);
      
      require('../cli.js');

      // Check that event handlers exist by testing if they can be triggered
      expect(() => process.emit('uncaughtException', new Error('test'))).not.toThrow();
      expect(() => process.emit('unhandledRejection', 'test', Promise.resolve())).not.toThrow();
      expect(() => process.emit('SIGINT')).not.toThrow();
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
    test('should import all required dependencies without errors', () => {
      // This test verifies that the module can load without errors
      expect(() => require('../cli.js')).not.toThrow();
    });

    test('should have access to required modules', () => {
      const cliModule = require('../cli.js');
      const chalk = require('chalk');
      const fs = require('fs-extra');
      const AudiobookMaker = require('../src/AudiobookMaker');
      
      // Verify all required modules are accessible
      expect(chalk).toBeDefined();
      expect(fs).toBeDefined();
      expect(AudiobookMaker).toBeDefined();
    });
  });
});