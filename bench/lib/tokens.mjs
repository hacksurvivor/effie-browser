// Approximate token counts for browser output. Claude's tokenizer isn't public, so this uses
// OpenAI's o200k_base as a stand-in: good for comparing two outputs, not for billing.
// Real model usage comes from the agent's own reports (agent.mjs).
import { Tiktoken } from "js-tiktoken/lite";
import o200k from "js-tiktoken/ranks/o200k_base";

const enc = new Tiktoken(o200k);

export const countTokens = (text) => (text ? enc.encode(String(text)).length : 0);
