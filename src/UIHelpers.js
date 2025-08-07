/**
 * UI Helper utilities for better user experience
 * Provides enhanced prompts, progress bars, and visual feedback
 */

const chalk = require('chalk');
const ora = require('ora');

class UIHelpers {
  /**
   * Creates an enhanced welcome banner with system info
   */
  static showWelcomeBanner(version = '5.1.1') {
    console.clear();
    console.log(
      chalk.cyan(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║                    🎧 AI AUDIOBOOK MAKER v${version} 🎧                    ║
║                                                                      ║
║                Transform PDFs & Text into Audiobooks                ║
║                  OpenAI TTS & Thorsten-Voice TTS                    ║
║                                                                      ║
║   ✨ Enhanced Security • 🧪 Comprehensive Testing • 🚀 Fast & Reliable   ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
      `)
    );
    
    // Show helpful tips
    console.log(chalk.gray('💡 Tips:'));
    console.log(chalk.gray('   • Use arrow keys to navigate menus'));
    console.log(chalk.gray('   • Drag & drop files into the terminal'));
    console.log(chalk.gray('   • Press Ctrl+C anytime to exit safely'));
    console.log('');
  }

  /**
   * Creates enhanced main menu with better descriptions
   */
  static getMainMenuChoices() {
    return [
      { 
        name: '📖 Convert file to audiobook', 
        value: 'convert',
        description: 'Transform your PDF or text file into high-quality audio'
      },
      { 
        name: '🎤 Preview voices', 
        value: 'preview',
        description: 'Listen to different voices before choosing'
      },
      { 
        name: '⚙️  Manage configuration', 
        value: 'config',
        description: 'Set up API keys, preferences, and settings'
      },
      { 
        name: '📊 View session history', 
        value: 'history',
        description: 'Resume previous conversions or check past projects'
      },
      { 
        name: '🧹 Clear cache & data', 
        value: 'clear_cache',
        description: 'Free up disk space by removing temporary files'
      },
      { 
        name: '❓ Help & troubleshooting', 
        value: 'help',
        description: 'Get help with common issues and usage tips'
      },
      { 
        name: '❌ Exit application', 
        value: 'exit',
        description: 'Close AI Audiobook Maker'
      },
    ];
  }

  /**
   * Creates enhanced progress bar with context
   */
  static createProgressBar(message, options = {}) {
    const defaultOptions = {
      text: message,
      spinner: 'dots',
      color: 'cyan',
      prefixText: '🎧',
    };
    
    return ora({ ...defaultOptions, ...options });
  }

  /**
   * Shows processing stages with visual feedback
   */
  static showProcessingStages(currentStage, totalStages, stageName) {
    const progress = Math.round((currentStage / totalStages) * 100);
    const progressBar = '█'.repeat(Math.floor(progress / 5)) + '▒'.repeat(20 - Math.floor(progress / 5));
    
    console.log(chalk.cyan('\n📋 Processing Stages:'));
    console.log(chalk.gray(`   Stage ${currentStage}/${totalStages}: ${stageName}`));
    console.log(chalk.cyan(`   [${progressBar}] ${progress}%\n`));
  }

  /**
   * Enhanced file selection prompt with file info
   */
  static async promptFileSelection(files, context = '') {
    if (files.length === 0) {
      console.log(chalk.yellow('📂 No recent files found. Let\'s browse for a file instead.\n'));
      return null;
    }

    console.log(chalk.cyan(`\n📁 Recent ${context} Files:`));
    console.log(chalk.gray('   Select a file from your recent conversions\n'));

    const choices = files.map(file => ({
      name: `${file.name} ${chalk.gray(`(${file.size || 'Unknown size'})`)}`,
      value: file.path,
      short: file.name
    }));

    choices.push(
      { name: chalk.gray('─'.repeat(50)), disabled: true },
      { name: '📂 Browse for different file', value: 'browse' },
      { name: '🔙 Back to main menu', value: 'back' }
    );

    return choices;
  }

  /**
   * Enhanced confirmation prompt with details
   */
  static async confirmAction(action, details = {}) {
    console.log(chalk.yellow(`\n⚠️  Confirm ${action}:`));
    
    if (details.cost) {
      console.log(chalk.gray(`   💰 Estimated cost: ${details.cost}`));
    }
    if (details.time) {
      console.log(chalk.gray(`   ⏱️  Estimated time: ${details.time}`));
    }
    if (details.size) {
      console.log(chalk.gray(`   📊 File size: ${details.size}`));
    }
    if (details.chunks) {
      console.log(chalk.gray(`   🔧 Processing chunks: ${details.chunks}`));
    }

    return {
      type: 'confirm',
      name: 'confirmed',
      message: `Proceed with ${action}?`,
      default: true
    };
  }

  /**
   * Success message with next steps
   */
  static showSuccess(message, nextSteps = []) {
    console.log(chalk.green(`\n✅ ${message}\n`));
    
    if (nextSteps.length > 0) {
      console.log(chalk.cyan('🚀 What\'s next:'));
      nextSteps.forEach((step, index) => {
        console.log(chalk.gray(`   ${index + 1}. ${step}`));
      });
      console.log('');
    }
  }

  /**
   * Error message with helpful suggestions
   */
  static showError(error, suggestions = []) {
    console.log(chalk.red(`\n❌ Error: ${error}\n`));
    
    if (suggestions.length > 0) {
      console.log(chalk.yellow('💡 Try these solutions:'));
      suggestions.forEach((suggestion, index) => {
        console.log(chalk.gray(`   ${index + 1}. ${suggestion}`));
      });
      console.log('');
    }
  }

  /**
   * Provider selection with detailed info
   */
  static getProviderChoices() {
    return [
      {
        name: '☁️  OpenAI TTS (Premium Cloud)',
        value: 'openai',
        description: 'High-quality voices • 6 voice options • Requires API key • ~$0.015/1K chars'
      },
      {
        name: '🇩🇪 Thorsten-Voice (German Local)',
        value: 'thorsten', 
        description: 'Native German pronunciation • Completely FREE • Runs locally • Auto-install'
      },
      {
        name: '❓ Help me choose',
        value: 'help',
        description: 'Get recommendations based on your needs'
      },
      {
        name: '🔙 Back to main menu',
        value: 'back',
        description: 'Return to previous menu'
      }
    ];
  }

  /**
   * Voice selection with preview info
   */
  static getVoiceChoices(provider) {
    const baseChoices = {
      openai: [
        { name: '🎵 Alloy (Neutral, versatile)', value: 'alloy', description: 'Great for most content types' },
        { name: '🎭 Echo (Expressive, dynamic)', value: 'echo', description: 'Perfect for dramatic content' },
        { name: '📖 Fable (Warm, storytelling)', value: 'fable', description: 'Ideal for books and narratives' },
        { name: '🎯 Onyx (Deep, authoritative)', value: 'onyx', description: 'Professional and commanding' },
        { name: '✨ Nova (Bright, engaging)', value: 'nova', description: 'Energetic and clear' },
        { name: '🌟 Shimmer (Gentle, soothing)', value: 'shimmer', description: 'Calm and pleasant' },
      ],
      thorsten: [
        { name: '🇩🇪 Thorsten (Standard German)', value: 'thorsten', description: 'Clear, standard German pronunciation' },
        { name: '🎭 Thorsten Emotional (Expressive)', value: 'thorsten_emotional', description: 'More expressive German voice' },
      ]
    };

    return baseChoices[provider] || [];
  }

  /**
   * Shows detailed processing information
   */
  static showProcessingInfo(fileData, options) {
    console.log(chalk.cyan('\n📋 Processing Summary:'));
    console.log(chalk.gray('   File: ') + chalk.white(fileData.fileName || 'Unknown'));
    console.log(chalk.gray('   Characters: ') + chalk.white(fileData.characterCount?.toLocaleString() || '0'));
    console.log(chalk.gray('   Words: ') + chalk.white(fileData.wordCount?.toLocaleString() || '0'));
    
    if (fileData.pageCount) {
      console.log(chalk.gray('   Pages: ') + chalk.white(fileData.pageCount));
    }
    
    console.log(chalk.gray('   Provider: ') + chalk.white(options.provider || 'Unknown'));
    console.log(chalk.gray('   Voice: ') + chalk.white(options.voice || 'Unknown'));
    
    if (options.estimatedCost) {
      console.log(chalk.gray('   Estimated cost: ') + chalk.green(`$${options.estimatedCost}`));
    }
    
    if (options.estimatedTime) {
      console.log(chalk.gray('   Estimated time: ') + chalk.yellow(options.estimatedTime));
    }
    
    console.log('');
  }

  /**
   * Animated loading with rotating messages
   */
  static createRotatingLoader(messages, interval = 3000) {
    let currentIndex = 0;
    const spinner = this.createProgressBar(messages[0]);
    
    const rotateMessages = setInterval(() => {
      currentIndex = (currentIndex + 1) % messages.length;
      spinner.text = messages[currentIndex];
    }, interval);

    // Return spinner with cleanup function
    spinner._cleanup = () => clearInterval(rotateMessages);
    return spinner;
  }

  /**
   * Shows help content for different topics
   */
  static showHelpContent(topic = 'general') {
    const helpContent = {
      general: {
        title: '🆘 AI Audiobook Maker Help',
        sections: [
          {
            title: '🚀 Getting Started',
            items: [
              'Choose "Convert file to audiobook" to start',
              'Select your TTS provider (OpenAI or Thorsten)',
              'Pick a voice and adjust settings',
              'Let the magic happen!'
            ]
          },
          {
            title: '💰 Cost Information',
            items: [
              'OpenAI TTS: ~$0.015 per 1,000 characters',
              'Thorsten-Voice: Completely FREE',
              'Check file size before processing'
            ]
          },
          {
            title: '🔧 Troubleshooting',
            items: [
              'Ensure you have a stable internet connection',
              'Check file size limits (50MB PDF, 1M chars text)',
              'Verify API key is valid and has credit',
              'Try clearing cache if issues persist'
            ]
          }
        ]
      },
      providers: {
        title: '🎙️ TTS Provider Guide',
        sections: [
          {
            title: '☁️ OpenAI TTS',
            items: [
              'Premium cloud-based text-to-speech',
              'Requires OpenAI API key with billing setup',
              '6 high-quality voice options',
              'Fast processing, excellent quality',
              'Supports multiple languages'
            ]
          },
          {
            title: '🇩🇪 Thorsten-Voice',
            items: [
              'Native German TTS (completely free)',
              'Runs entirely on your computer',
              'Authentic German pronunciation',
              'No internet required after setup',
              'Automatic installation of dependencies'
            ]
          }
        ]
      }
    };

    const content = helpContent[topic] || helpContent.general;
    
    console.log(chalk.cyan(`\n${content.title}`));
    console.log(chalk.gray('─'.repeat(60)));

    content.sections.forEach(section => {
      console.log(chalk.yellow(`\n${section.title}:`));
      section.items.forEach(item => {
        console.log(chalk.gray(`   • ${item}`));
      });
    });

    console.log(chalk.gray('\n─'.repeat(60)));
    console.log(chalk.cyan('💡 Need more help? Visit: https://github.com/iamthamanic/AI-Audiobook-Maker\n'));
  }
}

module.exports = UIHelpers;