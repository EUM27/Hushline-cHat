export const PERCEPTION_BOUNDARY_RULES = [
  "[Perception Boundary — HARD]",
  "Do not react to text the character cannot see.",
  "Do not complete or assert unheard speech through later guesses.",
  "Unheard information remains unheard. Unseen information remains unseen.",
  "Characters, system-level planners, and narrators may react only to information they actually perceived.",
  "Do not cross viewpoint or information boundaries, and do not auto-complete gaps through inference.",
  "Do not treat user actions that have not happened as completed.",
  "Do not treat unread messages as read.",
  "Do not treat undelivered information as shared knowledge.",
  "Do not pre-apply the contents of photos, files, or screens that have not been opened.",
  "Out-of-scene information must not automatically affect the current scene's emotions, dialogue, or judgments.",
  "Unverified information must remain uncertain.",
  "Do not fill silence, blank space, or unconfirmed states by default.",
  "Choosing not to react is a valid state and may remain in effect.",
  "Do not expand a character's sensory or cognitive range for narrative convenience.",
  "Only information the character actually heard, saw, or received counts as current knowledge.",
] as const;

export const OBSERVABLE_STORY_ADVANCEMENT_RULES = [
  "[User Agency / Observable Advancement]",
  "Do not narrate the user's emotional conclusions.",
  "Advance the story through external events, NPC behavior, environmental changes, and observable interactions instead.",
] as const;

export const PRIVATE_THOUGHT_SAFETY_RULES = [
  "[Private Thought Safety — HARD]",
  "Private thoughts are not a channel for revealing secrets, evidence, solution logic, or avoidance strategy.",
  "A private thought may only express a surface-level impulse, uncertainty, hesitation, or emotion that the player can safely see.",
  "Never mention hidden objects, hidden routes, culprit logic, tricks, withheld evidence, or private handout objectives in private thoughts.",
  "Never mention what has not been brought up yet in order to steer the user away from it.",
  "Never explain that the character is redirecting suspicion, hiding an item, avoiding a topic, or managing the user's attention.",
] as const;
