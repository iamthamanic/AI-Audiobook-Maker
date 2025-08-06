const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const inquirer = require('inquirer');
const chalk = require('chalk');
const { safeValidateConfig, safeValidateApiKey, validateConfig } = require('./schemas');

/**
 * Manages configuration settings and API key encryption/decryption.
 * Handles secure storage of OpenAI API keys with AES-256 encryption.
 */
class ConfigManager {
  /**
   * Creates a new ConfigManager instance.
   * Sets up configuration directory paths in user's home directory.
   */
  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'aiabm');
    this.configFile = path.join(this.configDir, 'config.json');
    this.cacheDir = path.join(this.configDir, 'cache');
  }

  /**
   * Initializes configuration and cache directories.
   * Creates directories if they don't exist.
   * @throws {Error} When directory creation fails
   */
  async initialize() {
    await fs.ensureDir(this.configDir);
    await fs.ensureDir(this.cacheDir);
  }

  /**
   * Retrieves and decrypts configuration from file.
   * Returns empty object if config doesn't exist or is corrupted.
   * @returns {Object} Decrypted configuration object
   */
  async getConfig() {
    try {
      if (await fs.pathExists(this.configFile)) {
        const rawConfig = await fs.readJson(this.configFile);
        const decryptedConfig = this.decryptConfig(rawConfig);
        
        // Validate configuration structure
        const validation = safeValidateConfig(decryptedConfig);
        if (!validation.success) {
          console.log(chalk.yellow('⚠️  Config file has invalid structure, will recreate'));
          console.log(chalk.gray(`    Validation errors: ${validation.error.errors.map(e => e.message).join(', ')}`));
          return {};
        }
        
        return validation.data;
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Config file corrupted, will recreate'));
    }
    return {};
  }

  /**
   * Encrypts and saves configuration to file.
   * @param {Object} config - Configuration object to save
   * @throws {Error} When file writing fails or validation fails
   */
  async setConfig(config) {
    // Validate configuration before saving
    try {
      validateConfig(config);
    } catch (validationError) {
      throw new Error(`Invalid configuration: ${validationError.errors?.map(e => e.message).join(', ') || validationError.message}`);
    }
    
    const encryptedConfig = this.encryptConfig(config);
    await fs.writeJson(this.configFile, encryptedConfig, { spaces: 2 });
  }

  /**
   * Encrypts API key in configuration using AES-256-CBC.
   * Falls back to base64 encoding if crypto fails.
   * @param {Object} config - Configuration object with API key
   * @returns {Object} Configuration object with encrypted API key
   */
  encryptConfig(config) {
    if (!config.apiKey) {return config;}

    try {
      // Use more secure encryption with unique salt for each encryption
      const SecurityUtils = require('./SecurityUtils');
      const salt = SecurityUtils.generateSecureSalt(16);
      const key = crypto.scryptSync('aiabm-secret', salt, 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', key);

      let encrypted = cipher.update(config.apiKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        ...config,
        apiKey: `aes:${salt.toString('hex')}:${iv.toString('hex')}:${encrypted}`,
        encryptionVersion: '2.0', // Track encryption version for future upgrades
      };
    } catch (error) {
      // Fallback to base64 encoding if crypto fails
      console.log(chalk.yellow('⚠️  Using basic encoding for API key storage'));
      return {
        ...config,
        apiKey: `basic:${Buffer.from(config.apiKey).toString('base64')}`,
      };
    }
  }

  /**
   * Decrypts API key from configuration.
   * Handles both AES-encrypted and base64-encoded keys.
   * @param {Object} config - Configuration object with encrypted API key
   * @returns {Object} Configuration object with decrypted API key
   */
  decryptConfig(config) {
    if (!config.apiKey || !config.apiKey.includes(':')) {return config;}

    try {
      const parts = config.apiKey.split(':');

      if (parts[0] === 'basic') {
        // Base64 encoded (legacy)
        const decrypted = Buffer.from(parts[1], 'base64').toString('utf8');
        return { ...config, apiKey: decrypted };
      } else if (parts[0] === 'aes' && parts.length === 4) {
        // New AES encryption with salt (v2.0)
        const [, saltHex, , encrypted] = parts;
        const salt = Buffer.from(saltHex, 'hex');
        const key = crypto.scryptSync('aiabm-secret', salt, 32);
        const decipher = crypto.createDecipher('aes-256-cbc', key);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return { ...config, apiKey: decrypted };
      } else if (parts.length === 2) {
        // Legacy AES encrypted (v1.0)
        const key = crypto.scryptSync('aiabm-secret', 'salt', 32);
        const [, encrypted] = parts;
        const decipher = crypto.createDecipher('aes-256-cbc', key);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return { ...config, apiKey: decrypted };
      }

      return config;
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not decrypt API key, please re-enter'));
      return { ...config, apiKey: null };
    }
  }

  /**
   * Prompts user to enter their OpenAI API key.
   * Validates key format and saves it securely.
   * @returns {string} The entered API key
   * @throws {Error} When API key validation or saving fails
   */
  async promptForApiKey() {
    console.log(chalk.cyan('\n🔑 OpenAI API Key Setup'));
    console.log(chalk.gray('Get your API key at: https://platform.openai.com/account/api-keys'));
    console.log(chalk.gray('💡 Tip: You can also set OPENAI_API_KEY or AIABM_API_KEY environment variable\n'));

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your OpenAI API Key:',
        validate: (input) => {
          if (!input || input.length < 10) {
            return 'Please enter a valid API key';
          }
          
          // Use Zod validation for API key format
          const validation = safeValidateApiKey({ key: input });
          if (!validation.success) {
            const errorMessages = validation.error.errors.map(e => e.message);
            return errorMessages.join(', ');
          }
          
          return true;
        },
      },
    ]);

    const config = await this.getConfig();
    config.apiKey = apiKey;
    await this.setConfig(config);

    console.log(chalk.green('✅ API Key saved securely!'));
    return apiKey;
  }

  /**
   * Interactive API key management menu.
   * Allows setting, testing, updating, or removing API keys.
   * @throws {Error} When API key operations fail
   */
  async manageApiKey() {
    const config = await this.getConfig();
    const hasKey = !!config.apiKey;

    console.log(chalk.cyan('\n🔧 API Key Management'));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: hasKey ? 'Update API Key' : 'Set API Key', value: 'set' },
          ...(hasKey ? [{ name: 'Test API Key', value: 'test' }] : []),
          ...(hasKey ? [{ name: 'Remove API Key', value: 'remove' }] : []),
          { name: 'Back to main menu', value: 'back' },
        ],
      },
    ]);

    switch (action) {
      case 'set':
        await this.promptForApiKey();
        break;
      case 'test':
        await this.testApiKey();
        break;
      case 'remove':
        await this.removeApiKey();
        break;
      case 'back':
        return;
    }
  }

  /**
   * Tests the stored API key by making a request to OpenAI API.
   * Validates key by attempting to fetch available models.
   * @throws {Error} When API test request fails
   */
  async testApiKey() {
    const config = await this.getConfig();
    if (!config.apiKey) {
      console.log(chalk.red('❌ No API key found'));
      return;
    }

    console.log(chalk.yellow('🔄 Testing API key...'));

    try {
      const axios = require('axios');
      const response = await axios.post(
        'https://api.openai.com/v1/models',
        {},
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.data && response.data.data) {
        console.log(chalk.green('✅ API key is valid!'));
      } else {
        console.log(chalk.red('❌ API key test failed'));
      }
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log(chalk.red('❌ API key is invalid'));
      } else {
        console.log(chalk.red(`❌ API test failed: ${error.message}`));
      }
    }
  }

  async removeApiKey() {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to remove the API key?',
        default: false,
      },
    ]);

    if (confirm) {
      const config = await this.getConfig();
      delete config.apiKey;
      await this.setConfig(config);
      console.log(chalk.green('✅ API key removed'));
    }
  }

  /**
   * Ensures an API key is available, checking environment variables first.
   * Priority: 1. Environment variable, 2. Config file, 3. User prompt
   * @returns {string} Valid API key
   * @throws {Error} When API key cannot be obtained
   */
  async ensureApiKey() {
    // 1. Check environment variables first (most secure)
    const envApiKey = process.env.OPENAI_API_KEY || process.env.AIABM_API_KEY;
    if (envApiKey) {
      try {
        // Validate environment API key
        const validation = safeValidateApiKey({ key: envApiKey });
        if (validation.success) {
          return envApiKey;
        } else {
          console.log(chalk.yellow('⚠️  Invalid API key in environment variable, checking config file...'));
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️  Environment API key validation failed, checking config file...'));
      }
    }
    
    // 2. Check config file
    const config = await this.getConfig();
    if (config.apiKey) {
      try {
        // Validate stored API key
        const validation = safeValidateApiKey({ key: config.apiKey });
        if (validation.success) {
          return config.apiKey;
        } else {
          console.log(chalk.yellow('⚠️  Stored API key is invalid, requesting new one...'));
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️  Stored API key validation failed, requesting new one...'));
      }
    }
    
    // 3. Prompt user for new API key
    return await this.promptForApiKey();
  }

  /**
   * Returns the cache directory path.
   * @returns {string} Path to cache directory
   */
  getCacheDir() {
    return this.cacheDir;
  }

  /**
   * Clears all cached files and directories.
   * Removes voice previews and temporary files.
   * @throws {Error} When cache clearing fails
   */
  async clearCache() {
    try {
      await fs.emptyDir(this.cacheDir);
      console.log(chalk.green('✅ Cache cleared'));
    } catch (error) {
      console.log(chalk.red(`❌ Failed to clear cache: ${error.message}`));
    }
  }
}

module.exports = ConfigManager;
