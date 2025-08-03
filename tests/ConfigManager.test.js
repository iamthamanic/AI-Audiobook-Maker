const ConfigManager = require('../src/ConfigManager');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const inquirer = require('inquirer');
const chalk = require('chalk');
const axios = require('axios');

// Mock all dependencies
jest.mock('fs-extra');
jest.mock('inquirer');
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
jest.mock('axios');

// Mock crypto at the top level
const mockCipher = {
  update: jest.fn(),
  final: jest.fn(),
};

const mockDecipher = {
  update: jest.fn(),
  final: jest.fn(),
};

jest.mock('crypto', () => ({
  scryptSync: jest.fn(),
  randomBytes: jest.fn(),
  createCipher: jest.fn(() => mockCipher),
  createDecipher: jest.fn(() => mockDecipher),
}));

describe('ConfigManager', () => {
  let configManager;
  let mockConfigPath;
  let mockCacheDir;

  beforeEach(() => {
    jest.clearAllMocks();
    
    configManager = new ConfigManager();
    mockConfigPath = path.join(os.homedir(), '.config', 'aiabm', 'config.json');
    mockCacheDir = path.join(os.homedir(), '.config', 'aiabm', 'cache');

    // Setup default fs mocks
    fs.ensureDir = jest.fn().mockResolvedValue(undefined);
    fs.pathExists = jest.fn().mockResolvedValue(false);
    fs.readJson = jest.fn().mockResolvedValue({});
    fs.writeJson = jest.fn().mockResolvedValue(undefined);
    fs.emptyDir = jest.fn().mockResolvedValue(undefined);

    // Setup default inquirer mock
    inquirer.prompt = jest.fn();
  });

  describe('constructor', () => {
    test('should set correct paths', () => {
      expect(configManager.configDir).toBe(path.join(os.homedir(), '.config', 'aiabm'));
      expect(configManager.configFile).toBe(mockConfigPath);
      expect(configManager.cacheDir).toBe(mockCacheDir);
    });
  });

  describe('initialize', () => {
    test('should create config and cache directories', async () => {
      await configManager.initialize();

      expect(fs.ensureDir).toHaveBeenCalledWith(configManager.configDir);
      expect(fs.ensureDir).toHaveBeenCalledWith(configManager.cacheDir);
    });
  });

  describe('getConfig', () => {
    test('should return empty object when config file does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const config = await configManager.getConfig();

      expect(config).toEqual({});
      expect(fs.pathExists).toHaveBeenCalledWith(mockConfigPath);
    });

    test('should read and decrypt config when file exists', async () => {
      const mockEncryptedConfig = {
        apiKey: 'encrypted-key',
        otherSetting: 'value',
      };
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(mockEncryptedConfig);
      configManager.decryptConfig = jest.fn().mockReturnValue({
        apiKey: 'decrypted-key',
        otherSetting: 'value',
      });

      const config = await configManager.getConfig();

      expect(fs.readJson).toHaveBeenCalledWith(mockConfigPath);
      expect(configManager.decryptConfig).toHaveBeenCalledWith(mockEncryptedConfig);
      expect(config).toEqual({
        apiKey: 'decrypted-key',
        otherSetting: 'value',
      });
    });

    test('should handle corrupted config file gracefully', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockRejectedValue(new Error('Parse error'));
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const config = await configManager.getConfig();

      expect(config).toEqual({});
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Config file corrupted, will recreate')
      );
      consoleLogSpy.mockRestore();
    });
  });

  describe('setConfig', () => {
    test('should encrypt and save config', async () => {
      const mockConfig = { apiKey: 'test-key', setting: 'value' };
      const mockEncryptedConfig = { apiKey: 'encrypted-key', setting: 'value' };
      configManager.encryptConfig = jest.fn().mockReturnValue(mockEncryptedConfig);

      await configManager.setConfig(mockConfig);

      expect(configManager.encryptConfig).toHaveBeenCalledWith(mockConfig);
      expect(fs.writeJson).toHaveBeenCalledWith(
        mockConfigPath,
        mockEncryptedConfig,
        { spaces: 2 }
      );
    });
  });

  describe('encryptConfig', () => {
    test('should return config unchanged if no apiKey', () => {
      const config = { setting: 'value' };
      const result = configManager.encryptConfig(config);
      expect(result).toEqual(config);
    });

    test('should encrypt apiKey with AES-256-CBC', () => {
      const config = { apiKey: 'sk-test123456789' };
      
      // Mock crypto functions
      const mockKey = Buffer.from('mock-key-32-bytes-long-test123456');
      const mockIv = Buffer.from('mock-iv-16-bytes!');

      mockCipher.update.mockReturnValue('encrypted1');
      mockCipher.final.mockReturnValue('encrypted2');

      jest.spyOn(crypto, 'scryptSync').mockReturnValue(mockKey);
      jest.spyOn(crypto, 'randomBytes').mockReturnValue(mockIv);

      const result = configManager.encryptConfig(config);

      expect(crypto.scryptSync).toHaveBeenCalledWith('aiabm-secret', 'salt', 32);
      expect(crypto.randomBytes).toHaveBeenCalledWith(16);
      expect(crypto.createCipher).toHaveBeenCalledWith('aes-256-cbc', mockKey);
      expect(mockCipher.update).toHaveBeenCalledWith('sk-test123456789', 'utf8', 'hex');
      expect(result.apiKey).toBe(`${mockIv.toString('hex')}:encrypted1encrypted2`);
    });

    test('should fallback to base64 encoding if crypto fails', () => {
      const config = { apiKey: 'sk-test123456789' };
      
      // Mock crypto to throw error
      jest.spyOn(crypto, 'scryptSync').mockImplementation(() => {
        throw new Error('Crypto error');
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = configManager.encryptConfig(config);

      expect(result.apiKey).toBe(`basic:${Buffer.from('sk-test123456789').toString('base64')}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Using basic encoding for API key storage')
      );
      consoleLogSpy.mockRestore();
    });
  });

  describe('decryptConfig', () => {
    test('should return config unchanged if no apiKey or no colon', () => {
      expect(configManager.decryptConfig({ setting: 'value' })).toEqual({ setting: 'value' });
      expect(configManager.decryptConfig({ apiKey: 'plainkey' })).toEqual({ apiKey: 'plainkey' });
    });

    test('should decrypt base64 encoded apiKey', () => {
      const originalKey = 'sk-test123456789';
      const encodedKey = Buffer.from(originalKey).toString('base64');
      const config = { apiKey: `basic:${encodedKey}` };

      const result = configManager.decryptConfig(config);

      expect(result.apiKey).toBe(originalKey);
    });

    test('should decrypt AES encrypted apiKey', () => {
      const config = { apiKey: 'mock-iv-hex:encrypted-data' };
      const mockKey = Buffer.from('mock-key-32-bytes-long-test123456');

      mockDecipher.update.mockReturnValue('decrypted1');
      mockDecipher.final.mockReturnValue('decrypted2');

      jest.spyOn(crypto, 'scryptSync').mockReturnValue(mockKey);

      const result = configManager.decryptConfig(config);

      expect(crypto.scryptSync).toHaveBeenCalledWith('aiabm-secret', 'salt', 32);
      expect(crypto.createDecipher).toHaveBeenCalledWith('aes-256-cbc', mockKey);
      expect(mockDecipher.update).toHaveBeenCalledWith('encrypted-data', 'hex', 'utf8');
      expect(result.apiKey).toBe('decrypted1decrypted2');
    });

    test('should handle decryption errors gracefully', () => {
      const config = { apiKey: 'invalid:encrypted-data' };
      
      // Mock crypto to throw error
      jest.spyOn(crypto, 'scryptSync').mockImplementation(() => {
        throw new Error('Decryption error');
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = configManager.decryptConfig(config);

      expect(result.apiKey).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Could not decrypt API key, please re-enter')
      );
      consoleLogSpy.mockRestore();
    });
  });

  describe('promptForApiKey', () => {
    test('should prompt for API key and save it', async () => {
      const mockApiKey = 'sk-test123456789';
      inquirer.prompt.mockResolvedValue({ apiKey: mockApiKey });
      configManager.getConfig = jest.fn().mockResolvedValue({ setting: 'value' });
      configManager.setConfig = jest.fn().mockResolvedValue(undefined);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await configManager.promptForApiKey();

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'password',
          name: 'apiKey',
          message: 'Enter your OpenAI API Key:',
        }),
      ]);
      expect(configManager.setConfig).toHaveBeenCalledWith({
        setting: 'value',
        apiKey: mockApiKey,
      });
      expect(result).toBe(mockApiKey);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ API Key saved securely!'));
      consoleLogSpy.mockRestore();
    });

    test('should validate API key format', async () => {
      inquirer.prompt.mockResolvedValue({ apiKey: 'sk-valid123456789' });
      configManager.getConfig = jest.fn().mockResolvedValue({});
      configManager.setConfig = jest.fn().mockResolvedValue(undefined);

      await configManager.promptForApiKey();

      const promptCall = inquirer.prompt.mock.calls[0][0][0];
      expect(promptCall.validate('short')).toBe('Please enter a valid API key');
      expect(promptCall.validate('not-sk-prefix')).toBe('OpenAI API keys typically start with "sk-"');
      expect(promptCall.validate('sk-valid123456789')).toBe(true);
    });
  });

  describe('manageApiKey', () => {
    test('should show set option when no API key exists', async () => {
      configManager.getConfig = jest.fn().mockResolvedValue({});
      inquirer.prompt.mockResolvedValue({ action: 'back' });

      await configManager.manageApiKey();

      const promptCall = inquirer.prompt.mock.calls[0][0][0];
      const choices = promptCall.choices;
      expect(choices).toContainEqual({ name: 'Set API Key', value: 'set' });
      expect(choices).not.toContainEqual(expect.objectContaining({ value: 'test' }));
      expect(choices).not.toContainEqual(expect.objectContaining({ value: 'remove' }));
    });

    test('should show all options when API key exists', async () => {
      configManager.getConfig = jest.fn().mockResolvedValue({ apiKey: 'sk-test123' });
      inquirer.prompt.mockResolvedValue({ action: 'back' });

      await configManager.manageApiKey();

      const promptCall = inquirer.prompt.mock.calls[0][0][0];
      const choices = promptCall.choices;
      expect(choices).toContainEqual({ name: 'Update API Key', value: 'set' });
      expect(choices).toContainEqual(expect.objectContaining({ value: 'test' }));
      expect(choices).toContainEqual(expect.objectContaining({ value: 'remove' }));
    });

    test('should handle set action', async () => {
      configManager.getConfig = jest.fn().mockResolvedValue({});
      configManager.promptForApiKey = jest.fn().mockResolvedValue('sk-test123');
      inquirer.prompt.mockResolvedValue({ action: 'set' });

      await configManager.manageApiKey();

      expect(configManager.promptForApiKey).toHaveBeenCalled();
    });

    test('should handle test action', async () => {
      configManager.getConfig = jest.fn().mockResolvedValue({ apiKey: 'sk-test123' });
      configManager.testApiKey = jest.fn().mockResolvedValue(undefined);
      inquirer.prompt.mockResolvedValue({ action: 'test' });

      await configManager.manageApiKey();

      expect(configManager.testApiKey).toHaveBeenCalled();
    });

    test('should handle remove action', async () => {
      configManager.getConfig = jest.fn().mockResolvedValue({ apiKey: 'sk-test123' });
      configManager.removeApiKey = jest.fn().mockResolvedValue(undefined);
      inquirer.prompt.mockResolvedValue({ action: 'remove' });

      await configManager.manageApiKey();

      expect(configManager.removeApiKey).toHaveBeenCalled();
    });
  });

  describe('testApiKey', () => {
    beforeEach(() => {
      axios.post = jest.fn();
    });

    test('should test valid API key successfully', async () => {
      const mockApiKey = 'sk-test123456789';
      configManager.getConfig = jest.fn().mockResolvedValue({ apiKey: mockApiKey });
      axios.post.mockResolvedValue({ data: { data: ['model1', 'model2'] } });
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await configManager.testApiKey();

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        {},
        {
          headers: {
            Authorization: `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ API key is valid!'));
      consoleLogSpy.mockRestore();
    });

    test('should handle invalid API key', async () => {
      configManager.getConfig = jest.fn().mockResolvedValue({ apiKey: 'invalid-key' });
      axios.post.mockRejectedValue({ response: { status: 401 } });
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await configManager.testApiKey();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('❌ API key is invalid'));
      consoleLogSpy.mockRestore();
    });

    test('should handle network errors', async () => {
      configManager.getConfig = jest.fn().mockResolvedValue({ apiKey: 'sk-test123' });
      axios.post.mockRejectedValue(new Error('Network error'));
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await configManager.testApiKey();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ API test failed: Network error')
      );
      consoleLogSpy.mockRestore();
    });

    test('should handle missing API key', async () => {
      configManager.getConfig = jest.fn().mockResolvedValue({});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await configManager.testApiKey();

      expect(axios.post).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('❌ No API key found'));
      consoleLogSpy.mockRestore();
    });
  });

  describe('removeApiKey', () => {
    test('should remove API key when confirmed', async () => {
      inquirer.prompt.mockResolvedValue({ confirm: true });
      configManager.getConfig = jest.fn().mockResolvedValue({ 
        apiKey: 'sk-test123', 
        otherSetting: 'value' 
      });
      configManager.setConfig = jest.fn().mockResolvedValue(undefined);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await configManager.removeApiKey();

      expect(configManager.setConfig).toHaveBeenCalledWith({ otherSetting: 'value' });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ API key removed'));
      consoleLogSpy.mockRestore();
    });

    test('should not remove API key when not confirmed', async () => {
      inquirer.prompt.mockResolvedValue({ confirm: false });
      configManager.setConfig = jest.fn();

      await configManager.removeApiKey();

      expect(configManager.setConfig).not.toHaveBeenCalled();
    });
  });

  describe('ensureApiKey', () => {
    test('should return existing API key', async () => {
      const existingKey = 'sk-existing123';
      configManager.getConfig = jest.fn().mockResolvedValue({ apiKey: existingKey });

      const result = await configManager.ensureApiKey();

      expect(result).toBe(existingKey);
    });

    test('should prompt for API key if none exists', async () => {
      const newKey = 'sk-new123';
      configManager.getConfig = jest.fn().mockResolvedValue({});
      configManager.promptForApiKey = jest.fn().mockResolvedValue(newKey);

      const result = await configManager.ensureApiKey();

      expect(configManager.promptForApiKey).toHaveBeenCalled();
      expect(result).toBe(newKey);
    });
  });

  describe('getCacheDir', () => {
    test('should return cache directory path', () => {
      const result = configManager.getCacheDir();
      expect(result).toBe(mockCacheDir);
    });
  });

  describe('clearCache', () => {
    test('should clear cache directory successfully', async () => {
      fs.emptyDir.mockResolvedValue(undefined);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await configManager.clearCache();

      expect(fs.emptyDir).toHaveBeenCalledWith(mockCacheDir);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Cache cleared'));
      consoleLogSpy.mockRestore();
    });

    test('should handle cache clear errors', async () => {
      fs.emptyDir.mockRejectedValue(new Error('Permission denied'));
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await configManager.clearCache();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to clear cache: Permission denied')
      );
      consoleLogSpy.mockRestore();
    });
  });
});