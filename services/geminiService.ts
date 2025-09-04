/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI, GenerateContentResponse, Tool, HarmCategory, HarmBlockThreshold, Content, Part } from "@google/genai";
import { UrlContextMetadataItem, ManagedFile, AttachedImage } from '../types';

// IMPORTANT: The API key MUST be set as an environment variable `process.env.API_KEY`
const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI;

const getAiInstance = (): GoogleGenAI => {
  if (!API_KEY) {
    console.error("API_KEY is not set in environment variables. Please set process.env.API_KEY.");
    throw new Error("Gemini API Key not configured. Set process.env.API_KEY.");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  }
  return ai;
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

interface GeminiResponse {
  text: string;
  urlContextMetadata?: UrlContextMetadataItem[];
}

export const generateContentWithUrlContext = async (
  prompt: string,
  urls: string[],
  files: ManagedFile[],
  modelName: string,
  images: AttachedImage[],
): Promise<GeminiResponse> => {
  const currentAi = getAiInstance();
  
  let fullPrompt = prompt;

  if (files.length > 0) {
    const filePreamble = files.map(f => `Content from file "${f.name}":\n---\n${f.content}\n---\n`).join('\n\n');
    fullPrompt = `Based on the following file contents, answer the user's query.\n\n${filePreamble}\n\nUser Query: ${prompt}`;
  }

  if (urls.length > 0) {
    const urlList = urls.join('\n');
    // The urlContext tool requires the URLs to be present in the prompt text.
    fullPrompt = `${fullPrompt}\n\nAdditionally, use these URLs for context:\n${urlList}`;
  }
  
  const parts: Part[] = [];
  
  if(fullPrompt.trim()){
    parts.push({ text: fullPrompt });
  }

  for(const image of images) {
    parts.push({
      inlineData: {
        mimeType: image.type,
        data: image.dataUrl.split(',')[1],
      }
    });
  }

  const tools: Tool[] = urls.length > 0 ? [{ urlContext: {} }] : [];
  const contents: Content[] = [{ role: "user", parts: parts }];

  try {
    const response: GenerateContentResponse = await currentAi.models.generateContent({
      model: modelName,
      contents: contents,
      config: { 
        tools: tools,
        safetySettings: safetySettings,
      },
    });

    const text = response.text;
    const candidate = response.candidates?.[0];
    let extractedUrlContextMetadata: UrlContextMetadataItem[] | undefined = undefined;

    if (candidate && candidate.urlContextMetadata && candidate.urlContextMetadata.urlMetadata) {
      console.log("Raw candidate.urlContextMetadata.urlMetadata from API/SDK:", JSON.stringify(candidate.urlContextMetadata.urlMetadata, null, 2));
      extractedUrlContextMetadata = candidate.urlContextMetadata.urlMetadata as UrlContextMetadataItem[];
    } else if (candidate && candidate.urlContextMetadata) {
      console.warn("candidate.urlContextMetadata is present, but 'urlMetadata' field is missing or empty:", JSON.stringify(candidate.urlContextMetadata, null, 2));
    }
    
    return { text, urlContextMetadata: extractedUrlContextMetadata };

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
      const googleError = error as any; 
      if (googleError.message && googleError.message.includes("API key not valid")) {
         throw new Error("Invalid API Key. Please check your GEMINI_API_KEY environment variable.");
      }
      if (googleError.message && googleError.message.includes("quota")) {
        throw new Error("API quota exceeded. Please check your Gemini API quota.");
      }
      if (googleError.type === 'GoogleGenAIError' && googleError.message) {
        throw new Error(`Gemini API Error: ${googleError.message}`);
      }
      throw new Error(`Failed to get response from AI: ${error.message}`);
    }
    throw new Error("Failed to get response from AI due to an unknown error.");
  }
};

export const getInitialSuggestions = async (
  urls: string[], 
  files: ManagedFile[],
  modelName: string
): Promise<GeminiResponse> => {
  if (urls.length === 0 && files.length === 0) {
    return { text: JSON.stringify({ suggestions: ["Add URLs or import files to get suggestions."] }) };
  }
  const currentAi = getAiInstance();

  const urlList = urls.length > 0 ? `\nRelevant URLs:\n${urls.join('\n')}` : '';
  const filePreamble = files.length > 0 ? `\nFile Contents:\n${files.map(f => `File: ${f.name}\nContent: ${f.content.substring(0, 500)}...`).join('\n')}` : '';
  
  const promptText = `Based on the content of the following documentation URLs and/or file contents, provide 3-4 concise and actionable questions a developer might ask to explore these documents. These questions should be suitable as quick-start prompts. Return ONLY a JSON object with a key "suggestions" containing an array of these question strings. For example: {"suggestions": ["What are the rate limits?", "How do I get an API key?", "Explain model X."]}
${urlList}
${filePreamble}`;

  const contents: Content[] = [{ role: "user", parts: [{ text: promptText }] }];

  try {
    const response: GenerateContentResponse = await currentAi.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        safetySettings: safetySettings,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    
    return { text };

  } catch (error) {
    console.error("Error calling Gemini API for initial suggestions:", error);
     if (error instanceof Error) {
      const googleError = error as any; 
      if (googleError.message && googleError.message.includes("API key not valid")) {
         throw new Error("Invalid API Key for suggestions. Please check your GEMINI_API_KEY environment variable.");
      }
      if (googleError.message && googleError.message.includes("Tool use with a response mime type: 'application/json' is unsupported")) {
        throw new Error("Configuration error: Cannot use tools with JSON response type for suggestions. This should be fixed in the code.");
      }
      throw new Error(`Failed to get initial suggestions from AI: ${error.message}`);
    }
    throw new Error("Failed to get initial suggestions from AI due to an unknown error.");
  }
};
