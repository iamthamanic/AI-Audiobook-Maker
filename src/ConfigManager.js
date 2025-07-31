const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const inquirer = require('inquirer');
const chalk = require('chalk');

class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'aiabm');
    this.configFile = path.join(this.configDir, 'config.json');
    this.cacheDir = path.join(this.configDir, 'cache');
  }

  async initialize() {
    await fs.ensureDir(this.configDir);
    await fs.ensureDir(this.cacheDir);
  }

  async getConfig() {
    try {
      if (await fs.pathExists(this.configFile)) {
        const config = await fs.readJson(this.configFile);
        return this.decryptConfig(config);
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Config file corrupted, will recreate'));
    }
    return {};
  }

  async setConfig(config) {
    const encryptedConfig = this.encryptConfig(config);
    await fs.writeJson(this.configFile, encryptedConfig, { spaces: 2 });
  }

  encryptConfig(config) {
    if (!config.apiKey) return config;
    
    const key = crypto.scryptSync('aiabm-secret', 'salt', 24);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes192', key);
    
    let encrypted = cipher.update(config.apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      ...config,
      apiKey: `${iv.toString('hex')}:${encrypted}`
    };
  }

  decryptConfig(config) {
    if (!config.apiKey || !config.apiKey.includes(':')) return config;
    
    try {
      const key = crypto.scryptSync('aiabm-secret', 'salt', 24);
      const [ivHex, encrypted] = config.apiKey.split(':');
      const decipher = crypto.createDecipher('aes192', key);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return {
        ...config,
        apiKey: decrypted
      };
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not decrypt API key, please re-enter'));
      return { ...config, apiKey: null };
    }
  }

  async promptForApiKey() {
    console.log(chalk.cyan('\n🔑 OpenAI API Key Setup'));
    console.log(chalk.gray('Get your API key at: https://platform.openai.com/account/api-keys\n'));

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your OpenAI API Key:',
        validate: (input) => {
          if (!input || input.length < 10) {
            return 'Please enter a valid API key';
          }
          if (!input.startsWith('sk-')) {
            return 'OpenAI API keys typically start with "sk-"';
          }
          return true;
        }
      }
    ]);

    const config = await this.getConfig();
    config.apiKey = apiKey;
    await this.setConfig(config);

    console.log(chalk.green('✅ API Key saved securely!'));
    return apiKey;
  }

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
          { name: 'Back to main menu', value: 'back' }
        ]
      }
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
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
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
        default: false
      }
    ]);

    if (confirm) {
      const config = await this.getConfig();
      delete config.apiKey;
      await this.setConfig(config);
      console.log(chalk.green('✅ API key removed'));
    }
  }

  async ensureApiKey() {
    const config = await this.getConfig();
    if (!config.apiKey) {
      return await this.promptForApiKey();
    }
    return config.apiKey;
  }

  getCacheDir() {
    return this.cacheDir;
  }

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