// MayaQueryFilter.js - All query filtering logic

export class MayaQueryFilter {
  constructor() {
    // Valid design intents
    this.PRIMARY_INTENTS = [   
      "change_theme",
      "style_consultation",
      "selected_swap",//only one thing change in the room
      "navigate", // to go other rooms like move to conference room
      "budget_analysis",
      "change_budget",
      "partial_swap",// things change in the room 
      "show_preview",
      "confirm_order" 
    ];

    this.INTENT_CONFIDENCE_THRESHOLD = 0.7;
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
    // ✅ CHANGED: Skip rigid validation - let OpenAI handle intent
    // Real clients say natural things like "this is amazing keep it"
    // which don't fit rigid action verb patterns
    
    // Only check: does command have minimum content?
    if (!command || command.trim().length === 0) {
      return {
        isValid: false,
        reason: "Empty command"
      };
    }

    // Let OpenAI's validateIntent() filter bad queries instead
    return { isValid: true };
  }
}