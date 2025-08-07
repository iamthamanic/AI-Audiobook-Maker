/**
 * Unit Tests for UIHelpers
 * Tests for enhanced UI components and user experience
 */

const UIHelpers = require('../src/UIHelpers');
const chalk = require('chalk');

// Mock chalk for consistent testing
jest.mock('chalk', () => ({
  cyan: jest.fn(text => text),
  gray: jest.fn(text => text),
  yellow: jest.fn(text => text),
  green: jest.fn(text => text),
  red: jest.fn(text => text),
  white: jest.fn(text => text),
}));

// Mock ora
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  }));
});

describe('UIHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console methods
    global.console = {
      log: jest.fn(),
      clear: jest.fn(),
      error: jest.fn(),
    };
  });

  describe('showWelcomeBanner', () => {
    test('should display welcome banner with version', () => {
      UIHelpers.showWelcomeBanner('5.0.3');
      
      expect(console.clear).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('AI AUDIOBOOK MAKER v5.0.3')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Enhanced Security')
      );
    });

    test('should show helpful tips', () => {
      UIHelpers.showWelcomeBanner();
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('💡 Tips:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('arrow keys'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Drag & drop'));
    });
  });

  describe('getMainMenuChoices', () => {
    test('should return array of menu choices', () => {
      const choices = UIHelpers.getMainMenuChoices();
      
      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBeGreaterThan(5);
      
      // Check for required menu items
      expect(choices.some(c => c.value === 'convert')).toBe(true);
      expect(choices.some(c => c.value === 'preview')).toBe(true);
      expect(choices.some(c => c.value === 'config')).toBe(true);
      expect(choices.some(c => c.value === 'help')).toBe(true);
      expect(choices.some(c => c.value === 'exit')).toBe(true);
    });

    test('should have proper structure for each choice', () => {
      const choices = UIHelpers.getMainMenuChoices();
      
      choices.forEach(choice => {
        expect(choice).toHaveProperty('name');
        expect(choice).toHaveProperty('value');
        expect(choice).toHaveProperty('description');
        expect(typeof choice.name).toBe('string');
        expect(typeof choice.value).toBe('string');
        expect(typeof choice.description).toBe('string');
      });
    });
  });

  describe('createProgressBar', () => {
    test('should create progress bar with custom message', () => {
      const progressBar = UIHelpers.createProgressBar('Testing progress...');
      
      expect(progressBar).toBeDefined();
      expect(typeof progressBar.start).toBe('function');
      expect(typeof progressBar.succeed).toBe('function');
    });

    test('should accept custom options', () => {
      const options = { color: 'green', prefixText: '🚀' };
      const progressBar = UIHelpers.createProgressBar('Custom test', options);
      
      expect(progressBar).toBeDefined();
    });
  });

  describe('showProcessingStages', () => {
    test('should display processing stages with progress', () => {
      UIHelpers.showProcessingStages(2, 5, 'Processing chunks');
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Processing Stages:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Stage 2/5'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('40%')); // 2/5 = 40%
    });

    test('should show progress bar visualization', () => {
      UIHelpers.showProcessingStages(3, 4, 'Almost done');
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('75%')); // 3/4 = 75%
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('█')); // Progress bar characters
    });
  });

  describe('getProviderChoices', () => {
    test('should return provider options', () => {
      const choices = UIHelpers.getProviderChoices();
      
      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBeGreaterThan(2);
      
      // Check for OpenAI and Thorsten options
      expect(choices.some(c => c.value === 'openai')).toBe(true);
      expect(choices.some(c => c.value === 'thorsten')).toBe(true);
      expect(choices.some(c => c.value === 'help')).toBe(true);
    });

    test('should have descriptions for each provider', () => {
      const choices = UIHelpers.getProviderChoices();
      
      choices.forEach(choice => {
        expect(choice).toHaveProperty('name');
        expect(choice).toHaveProperty('value');
        expect(choice).toHaveProperty('description');
      });
    });
  });

  describe('getVoiceChoices', () => {
    test('should return OpenAI voice choices', () => {
      const choices = UIHelpers.getVoiceChoices('openai');
      
      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBe(6); // OpenAI has 6 voices
      
      const voiceValues = choices.map(c => c.value);
      expect(voiceValues).toContain('alloy');
      expect(voiceValues).toContain('nova');
      expect(voiceValues).toContain('shimmer');
    });

    test('should return Thorsten voice choices', () => {
      const choices = UIHelpers.getVoiceChoices('thorsten');
      
      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBe(2); // Thorsten has 2 voices
      
      const voiceValues = choices.map(c => c.value);
      expect(voiceValues).toContain('thorsten');
      expect(voiceValues).toContain('thorsten_emotional');
    });

    test('should return empty array for unknown provider', () => {
      const choices = UIHelpers.getVoiceChoices('unknown');
      
      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBe(0);
    });
  });

  describe('showProcessingInfo', () => {
    test('should display file processing information', () => {
      const fileData = {
        fileName: 'test.pdf',
        characterCount: 5000,
        wordCount: 1000,
        pageCount: 10,
      };
      
      const options = {
        provider: 'openai',
        voice: 'alloy',
        estimatedCost: '$0.075',
        estimatedTime: '2 minutes',
      };

      UIHelpers.showProcessingInfo(fileData, options);
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Processing Summary:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test.pdf'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('5,000'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('openai'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('$0.075'));
    });

    test('should handle missing optional fields', () => {
      const fileData = {
        fileName: 'simple.txt',
        characterCount: 1000,
      };
      
      const options = {
        provider: 'thorsten',
        voice: 'thorsten',
      };

      expect(() => {
        UIHelpers.showProcessingInfo(fileData, options);
      }).not.toThrow();
    });
  });

  describe('showSuccess', () => {
    test('should display success message', () => {
      UIHelpers.showSuccess('File converted successfully');
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('File converted successfully'));
    });

    test('should show next steps when provided', () => {
      const nextSteps = ['Check output folder', 'Play the audiobook'];
      UIHelpers.showSuccess('Conversion complete', nextSteps);
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('What\'s next:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Check output folder'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Play the audiobook'));
    });
  });

  describe('showError', () => {
    test('should display error message', () => {
      UIHelpers.showError('File not found');
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    });

    test('should show suggestions when provided', () => {
      const suggestions = ['Check file path', 'Verify permissions'];
      UIHelpers.showError('Access denied', suggestions);
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Try these solutions:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Check file path'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Verify permissions'));
    });
  });

  describe('showHelpContent', () => {
    test('should display general help content', () => {
      UIHelpers.showHelpContent('general');
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('AI Audiobook Maker Help'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Getting Started'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cost Information'));
    });

    test('should display provider-specific help', () => {
      UIHelpers.showHelpContent('providers');
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('TTS Provider Guide'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('OpenAI TTS'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Thorsten-Voice'));
    });

    test('should fallback to general help for unknown topics', () => {
      UIHelpers.showHelpContent('unknown');
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('AI Audiobook Maker Help'));
    });
  });
});