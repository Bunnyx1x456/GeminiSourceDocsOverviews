/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { ChatMessage, MessageSender, KnowledgeGroup, ManagedFile, ModelDefinition, AttachedImage } from './types';
import { generateContentWithUrlContext, getInitialSuggestions } from './services/geminiService';
import KnowledgeBaseManager from './components/KnowledgeBaseManager';
import ChatInterface from './components/ChatInterface';

const GEMINI_DOCS_URLS = [
  "https://ai.google.dev/gemini-api/docs",
  "https://ai.google.dev/gemini-api/docs/quickstart",
  "https://ai.google.dev/gemini-api/docs/api-key",
  "https://ai.google.dev/gemini-api/docs/libraries",
  "https://ai.google.dev/gemini-api/docs/models",
  "https://ai.google.dev/gemini-api/docs/pricing",
  "https://ai.google.dev/gemini-api/docs/rate-limits",
  "https://ai.google.dev/gemini-api/docs/billing",
  "https://ai.google.dev/gemini-api/docs/changelog",
];

const MODEL_CAPABILITIES_URLS = [
  "https://ai.google.dev/gemini-api/docs/text-generation",
  "https://ai.google.dev/gemini-api/docs/image-generation",
  "https://ai.google.dev/gemini-api/docs/video",
  "https://ai.google.dev/gemini-api/docs/speech-generation",
  "https://ai.google.dev/gemini-api/docs/music-generation",
  "https://ai.google.dev/gemini-api/docs/long-context",
  "https://ai.google.dev/gemini-api/docs/structured-output",
  "https://ai.google.dev/gemini-api/docs/thinking",
  "https://ai.google.dev/gemini-api/docs/function-calling",
  "https://ai.google.dev/gemini-api/docs/document-processing",
  "https://ai.google.dev/gemini-api/docs/image-understanding",
  "https://ai.google.dev/gemini-api/docs/video-understanding",
  "https://ai.google.dev/gemini-api/docs/audio",
  "https://ai.google.dev/gemini-api/docs/code-execution",
  "https://ai.google.dev/gemini-api/docs/grounding",
];

const INITIAL_KNOWLEDGE_GROUPS: KnowledgeGroup[] = [
  { id: 'gemini-overview', name: 'Gemini Docs Overview', urls: GEMINI_DOCS_URLS, files: [] },
  { id: 'model-capabilities', name: 'Model Capabilities', urls: MODEL_CAPABILITIES_URLS, files: [] },
];

const AVAILABLE_MODELS: ModelDefinition[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' },
];

const App: React.FC = () => {
  const [knowledgeGroups, setKnowledgeGroups] = useState<KnowledgeGroup[]>(INITIAL_KNOWLEDGE_GROUPS);
  const [activeGroupId, setActiveGroupId] = useState<string>(INITIAL_KNOWLEDGE_GROUPS[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[1].id); // Default to Flash

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [initialQuerySuggestions, setInitialQuerySuggestions] = useState<string[]>([]);
  
  const MAX_SOURCES = 20;

  const activeGroup = knowledgeGroups.find(group => group.id === activeGroupId);
  const currentUrls = activeGroup ? activeGroup.urls : [];
  const currentFiles = activeGroup ? activeGroup.files : [];

   useEffect(() => {
    const apiKey = process.env.API_KEY;
    const currentActiveGroup = knowledgeGroups.find(group => group.id === activeGroupId);
    const welcomeMessageText = !apiKey 
        ? 'ERROR: Gemini API Key (process.env.API_KEY) is not configured. Please set this environment variable to use the application.'
        : `Welcome to Documentation Browser! You're currently browsing content from: "${currentActiveGroup?.name || 'None'}". Just ask me questions, or try one of the suggestions below to get started`;
    
    setChatMessages([{
      id: `system-welcome-${activeGroupId}-${Date.now()}`,
      text: welcomeMessageText,
      sender: MessageSender.SYSTEM,
      timestamp: new Date(),
    }]);
  }, [activeGroupId, knowledgeGroups]); 


  const fetchAndSetInitialSuggestions = useCallback(async (urls: string[], files: ManagedFile[], model: string) => {
    if (urls.length === 0 && files.length === 0) {
      setInitialQuerySuggestions([]);
      return;
    }
      
    setIsFetchingSuggestions(true);
    setInitialQuerySuggestions([]); 

    try {
      const response = await getInitialSuggestions(urls, files, model); 
      let suggestionsArray: string[] = [];
      if (response.text) {
        try {
          let jsonStr = response.text.trim();
          const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s; 
          const match = jsonStr.match(fenceRegex);
          if (match && match[2]) {
            jsonStr = match[2].trim();
          }
          const parsed = JSON.parse(jsonStr);
          if (parsed && Array.isArray(parsed.suggestions)) {
            suggestionsArray = parsed.suggestions.filter((s: unknown) => typeof s === 'string');
          } else {
            console.warn("Parsed suggestions response, but 'suggestions' array not found or invalid:", parsed);
             setChatMessages(prev => [...prev, { id: `sys-err-suggestion-fmt-${Date.now()}`, text: "Received suggestions in an unexpected format.", sender: MessageSender.SYSTEM, timestamp: new Date() }]);
          }
        } catch (parseError) {
          console.error("Failed to parse suggestions JSON:", parseError, "Raw text:", response.text);
          setChatMessages(prev => [...prev, { id: `sys-err-suggestion-parse-${Date.now()}`, text: "Error parsing suggestions from AI.", sender: MessageSender.SYSTEM, timestamp: new Date() }]);
        }
      }
      setInitialQuerySuggestions(suggestionsArray.slice(0, 4)); 
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to fetch initial suggestions.';
      setChatMessages(prev => [...prev, { id: `sys-err-suggestion-fetch-${Date.now()}`, text: `Error fetching suggestions: ${errorMessage}`, sender: MessageSender.SYSTEM, timestamp: new Date() }]);
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, []); 

  useEffect(() => {
    if ((currentUrls.length > 0 || currentFiles.length > 0) && process.env.API_KEY) { 
        fetchAndSetInitialSuggestions(currentUrls, currentFiles, selectedModel);
    } else {
        setInitialQuerySuggestions([]); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrls, currentFiles, selectedModel, fetchAndSetInitialSuggestions]); 


  const handleAddUrl = (url: string) => {
    setKnowledgeGroups(prevGroups => 
      prevGroups.map(group => {
        if (group.id === activeGroupId) {
          if ((group.urls.length + group.files.length) < MAX_SOURCES && !group.urls.includes(url)) {
            return { ...group, urls: [...group.urls, url] };
          }
        }
        return group;
      })
    );
  };

  const handleRemoveUrl = (urlToRemove: string) => {
    setKnowledgeGroups(prevGroups =>
      prevGroups.map(group => {
        if (group.id === activeGroupId) {
          return { ...group, urls: group.urls.filter(url => url !== urlToRemove) };
        }
        return group;
      })
    );
  };

  const handleAddFiles = (newFiles: ManagedFile[]) => {
    setKnowledgeGroups(prevGroups =>
      prevGroups.map(group => {
        if (group.id === activeGroupId) {
          const combinedFiles = [...group.files, ...newFiles];
          const uniqueFiles = combinedFiles.filter((file, index, self) =>
            index === self.findIndex((f) => f.name === file.name)
          );
          return { ...group, files: uniqueFiles };
        }
        return group;
      })
    );
  };

  const handleRemoveFile = (fileNameToRemove: string) => {
    setKnowledgeGroups(prevGroups =>
      prevGroups.map(group => {
        if (group.id === activeGroupId) {
          return { ...group, files: group.files.filter(file => file.name !== fileNameToRemove) };
        }
        return group;
      })
    );
  };

  const handleSendMessage = async (query: string, images: AttachedImage[]) => {
    if ((!query.trim() && images.length === 0) || isLoading || isFetchingSuggestions) return;

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
       setChatMessages(prev => [...prev, {
        id: `error-apikey-${Date.now()}`,
        text: 'ERROR: API Key (process.env.API_KEY) is not configured. Please set it up to send messages.',
        sender: MessageSender.SYSTEM,
        timestamp: new Date(),
      }]);
      return;
    }
    
    setIsLoading(true);
    setInitialQuerySuggestions([]); 

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      text: query,
      sender: MessageSender.USER,
      timestamp: new Date(),
      images: images.map(img => img.dataUrl),
    };
    
    const modelPlaceholderMessage: ChatMessage = {
      id: `model-response-${Date.now()}`,
      text: 'Thinking...', 
      sender: MessageSender.MODEL,
      timestamp: new Date(),
      isLoading: true,
    };

    setChatMessages(prevMessages => [...prevMessages, userMessage, modelPlaceholderMessage]);

    try {
      const response = await generateContentWithUrlContext(query, currentUrls, currentFiles, selectedModel, images);
      setChatMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === modelPlaceholderMessage.id
            ? { ...modelPlaceholderMessage, text: response.text || "I received an empty response.", isLoading: false, urlContext: response.urlContextMetadata }
            : msg
        )
      );
    } catch (e: any) {
      const errorMessage = e.message || 'Failed to get response from AI.';
      setChatMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === modelPlaceholderMessage.id
            ? { ...modelPlaceholderMessage, text: `Error: ${errorMessage}`, sender: MessageSender.SYSTEM, isLoading: false } 
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQueryClick = (query: string) => {
    handleSendMessage(query, []);
  };
  
  const chatPlaceholder = (currentUrls.length + currentFiles.length) > 0 
    ? `Ask about "${activeGroup?.name || 'current documents'}"...`
    : "Select a group and add sources to the knowledge base to enable chat.";

  return (
    <div 
      className="h-screen max-h-screen antialiased relative overflow-x-hidden bg-[#121212] text-[#E2E2E2]"
    >
      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      
      <div className="flex h-full w-full md:p-4 md:gap-4">
        {/* Sidebar */}
        <div className={`
          fixed top-0 left-0 h-full w-11/12 max-w-sm z-30 transform transition-transform ease-in-out duration-300 p-3
          md:static md:p-0 md:w-1/3 lg:w-1/4 md:h-full md:max-w-none md:translate-x-0 md:z-auto
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <KnowledgeBaseManager
            urls={currentUrls}
            files={currentFiles}
            onAddUrl={handleAddUrl}
            onRemoveUrl={handleRemoveUrl}
            onAddFiles={handleAddFiles}
            onRemoveFile={handleRemoveFile}
            maxSources={MAX_SOURCES}
            knowledgeGroups={knowledgeGroups}
            activeGroupId={activeGroupId}
            onSetGroupId={setActiveGroupId}
            onCloseSidebar={() => setIsSidebarOpen(false)}
          />
        </div>

        {/* Chat Interface */}
        <div className="w-full h-full p-3 md:p-0 md:w-2/3 lg:w-3/4">
          <ChatInterface
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            placeholderText={chatPlaceholder}
            initialQuerySuggestions={initialQuerySuggestions}
            onSuggestedQueryClick={handleSuggestedQueryClick}
            isFetchingSuggestions={isFetchingSuggestions}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            availableModels={AVAILABLE_MODELS}
            selectedModel={selectedModel}
            onSetModel={setSelectedModel}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
