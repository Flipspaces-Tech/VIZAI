// MayaQueryFilter.js - All query filtering logic

export class MayaQueryFilter {
  constructor() {
    // Blocked phrases from meetings/demo environments
    this.BLOCKED_PHRASES = [
      // Greetings & Acknowledgments
      "thank you", "thanks", "thank you so much", "hello", "hi there",
      "good morning", "good afternoon", "welcome", "goodbye", "bye",

      // Confirmations
      "yes", "no", "sure", "absolutely", "correct", "exactly", "that's right",
      "okay", "ok", "alright", "fine", "good", "yeah", "yep", "nope",

      // Logistics & Setup
      "ready", "let's start", "let's begin", "how long", "how much",
      "what time", "when", "how many", "are you ready", "let me know",
      "one moment", "just a second", "give me a second", "wait",

      // Demo Control (REMOVED most - these are valid design commands)
      "next", "check this",
      "do you see", "see that", "look here", "watch this",

      // General Chat
      "i think", "you know", "right", "actually", "i mean", "basically",
      "like", "i guess", "probably", "maybe", "perhaps",

      // Feedback & Comments
      "looks good", "nice", "cool", "awesome", "great", "excellent",
      "perfect", "beautiful", "very nice",
      "that's nice", "that's good", "that works",

      // Corrections & Revisions
      "hold on", "actually no", "no wait", "scratch that",
      "never mind", "ignore that", "go back", "undo that"
    ];

    // Action verbs for command validation
    this.ACTION_VERBS = [
      "show", "display", "find", "search", "apply", "change", "redesign",
      "make", "create", "swap", "replace", "update", "use", "set up",
      "arrange", "organize", "suggest", "recommend", "tell", "compare",
      "give", "provide", "show me", "display for", "find me"
    ];

    // Valid design intents
    this.PRIMARY_INTENTS = [
      "search_product",
      "display_products",
      "apply_theme",
      "style_consultation",
      "product_swap",
      "palette_match",
      "room_setup",
      "budget_analysis",
      "quick_filter",
      "bundle",
      "comparison",
      "upgrade",
      "refine"
    ];

    this.INTENT_CONFIDENCE_THRESHOLD = 0.7;
  }

  // Check if phrase is blocked
  isBlockedPhrase(command) {
    const lowerCommand = command.toLowerCase();
    return this.BLOCKED_PHRASES.some(phrase =>
      lowerCommand.includes(phrase)
    );
  }

  // Check if command has action verb
  hasActionVerb(command) {
    const lowerCommand = command.toLowerCase();
    return this.ACTION_VERBS.some(verb =>
      lowerCommand.includes(verb)
    );
  }

  // Validate intent confidence (for Phase 2)
  validateIntent(jsonData) {
    if (!jsonData || !jsonData.intent) return false;

    const intent = jsonData.intent;
    const isPrimary = this.PRIMARY_INTENTS.includes(intent);

    let confidence = isPrimary ? 0.7 : 0.3;
    if (jsonData.reply && jsonData.reply.length > 10) confidence += 0.2;

    return confidence >= this.INTENT_CONFIDENCE_THRESHOLD;
  }

  // Full validation pipeline
  validate(command) {
    // Check 1: Blocked phrase
    if (this.isBlockedPhrase(command)) {
      return {
        isValid: false,
        reason: "Blocked phrase"
      };
    }

    // Check 2: Action verb
    if (!this.hasActionVerb(command)) {
      return {
        isValid: false,
        reason: "No action verb"
      };
    }

    return { isValid: true };
  }
}