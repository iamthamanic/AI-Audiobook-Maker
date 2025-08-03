/**
 * Unified preview texts for all TTS providers
 * Provides consistent voice comparison across different providers
 */

const PREVIEW_TEXTS = {
  // German preview texts
  german: {
    short: "Das ist eine Vorschau der ausgewählten Stimme für deutsche Texte.",
    long: "Willkommen beim AI Audiobook Maker! Diese deutsche Stimme wandelt Ihren Text in natürlich klingende Sprache um. Sie können die Geschwindigkeit und Qualität nach Ihren Wünschen anpassen."
  },

  // English preview texts
  english: {
    short: "This is a preview of the selected voice for English texts.",
    long: "Welcome to AI Audiobook Maker! This English voice converts your text into natural-sounding speech. You can adjust the speed and quality to match your preferences."
  },

  // French preview texts
  french: {
    short: "Ceci est un aperçu de la voix sélectionnée pour les textes français.",
    long: "Bienvenue dans AI Audiobook Maker! Cette voix française convertit votre texte en parole naturelle. Vous pouvez ajuster la vitesse et la qualité selon vos préférences."
  },

  // Default fallback
  default: {
    short: "This is a preview of the selected voice.",
    long: "Welcome to AI Audiobook Maker! This voice will convert your text into natural-sounding speech with customizable speed and quality settings."
  }
};

/**
 * Get preview text based on voice language and length preference
 * @param {string} language - Language code (de, en, fr)
 * @param {string} length - 'short' or 'long'
 * @returns {string} Preview text
 */
function getPreviewText(language = 'en', length = 'short') {
  // Map language codes
  const langMap = {
    'de': 'german',
    'en': 'english', 
    'fr': 'french',
    'german': 'german',
    'english': 'english',
    'french': 'french'
  };

  const mappedLang = langMap[language?.toLowerCase()] || 'default';
  const texts = PREVIEW_TEXTS[mappedLang] || PREVIEW_TEXTS.default;
  
  return texts[length] || texts.short;
}

/**
 * Detect language from voice name or value
 * @param {string|object} voice - Voice identifier or voice object
 * @returns {string} Language code
 */
function detectVoiceLanguage(voice) {
  const voiceStr = (typeof voice === 'string' ? voice : (voice?.value || voice?.name || '')).toLowerCase();
  
  // German indicators
  if (voiceStr.includes('de-') || voiceStr.includes('german') || voiceStr.includes('deutsch') || voiceStr.includes('thorsten')) {
    return 'de';
  }
  
  // French indicators  
  if (voiceStr.includes('fr-') || voiceStr.includes('french') || voiceStr.includes('français')) {
    return 'fr';
  }
  
  // Default to English
  return 'en';
}

/**
 * Generate cache-friendly filename for preview
 * @param {string} provider - TTS provider name
 * @param {string} voice - Voice identifier
 * @param {string} language - Language code
 * @returns {string} Cache filename
 */
function getPreviewCacheFilename(provider, voice, language) {
  const sanitizedVoice = voice.replace(/[^a-zA-Z0-9]/g, '_');
  return `preview_${provider}_${sanitizedVoice}_${language}.wav`;
}

module.exports = {
  PREVIEW_TEXTS,
  getPreviewText,
  detectVoiceLanguage,
  getPreviewCacheFilename
};