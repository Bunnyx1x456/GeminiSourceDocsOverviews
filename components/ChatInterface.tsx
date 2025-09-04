/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, MessageSender, ModelDefinition, AttachedImage } from '../types'; 
import MessageItem from './MessageItem';
import { Send, Menu, ChevronDown, ChevronsUpDown, Paperclip, XCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (query: string, images: AttachedImage[]) => void;
  isLoading: boolean;
  placeholderText?: string;
  initialQuerySuggestions?: string[];
  onSuggestedQueryClick?: (query: string) => void;
  isFetchingSuggestions?: boolean;
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleCollapse?: () => void;
  availableModels: ModelDefinition[];
  selectedModel: string;
  onSetModel: (modelId: string) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  isLoading, 
  placeholderText,
  initialQuerySuggestions,
  onSuggestedQueryClick,
  isFetchingSuggestions,
  onToggleSidebar,
  isSidebarCollapsed,
  onToggleCollapse,
  availableModels,
  selectedModel,
  onSetModel,
}) => {
  const [userQuery, setUserQuery] = useState('');
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatInterfaceRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);
  
  useEffect(() => {
    const textarea = textareaRef.current;
    const chatInterface = chatInterfaceRef.current;
    if (!textarea || !chatInterface) return;

    const maxHeight = chatInterface.clientHeight * 0.5;

    if (isManuallyExpanded) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
    } else {
      // Auto-sizing logic
      textarea.style.height = 'auto'; // Temporarily shrink to get correct scrollHeight
      const scrollHeight = textarea.scrollHeight;
      
      const newHeight = Math.min(scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [userQuery, isManuallyExpanded, messages]);

  const addImages = (files: File[]) => {
    if (files.length === 0) return;

    const newImages: AttachedImage[] = [];
    const promises: Promise<void>[] = [];

    for (const file of files) {
      // Create a unique name for pasted files
      const fileName = file.name || `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`;
      
      const promise = new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            newImages.push({
              name: fileName,
              dataUrl: e.target.result as string,
              type: file.type,
            });
          }
          resolve();
        };
        reader.readAsDataURL(file);
      });
      promises.push(promise);
    }
    
    Promise.all(promises).then(() => {
      setAttachedImages(prev => [...prev, ...newImages]);
    });
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      addImages(Array.from(files));
    }
    
    // Reset file input to allow selecting the same file again
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };
  
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles: File[] = [];
    for (const item of Array.from(event.clipboardData.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
                imageFiles.push(file);
            }
        }
    }

    if (imageFiles.length > 0) {
        event.preventDefault();
        addImages(imageFiles);
    }
  };

  const handleRemoveImage = (name: string) => {
    setAttachedImages(prev => prev.filter(img => img.name !== name));
  };


  const handleSend = () => {
    const query = userQuery.trim();
    if ((!query && attachedImages.length === 0) || isLoading) return;

    onSendMessage(query, attachedImages);
    setUserQuery('');
    setAttachedImages([]);
    setIsManuallyExpanded(false); // Collapse after sending
  };
  
  const handleToggleExpand = () => {
    setIsManuallyExpanded(prev => !prev);
    textareaRef.current?.focus();
  };

  const showSuggestions = initialQuerySuggestions && initialQuerySuggestions.length > 0 && messages.filter(m => m.sender !== MessageSender.SYSTEM).length <= 1;

  return (
    <div ref={chatInterfaceRef} className="flex flex-col h-full bg-[#1E1E1E] rounded-xl shadow-md border border-[rgba(255,255,255,0.05)]">
      <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex justify-between items-center">
        <div className="flex items-center gap-3">
          {/* Desktop Sidebar Toggle */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden md:block p-1.5 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors"
              aria-label={isSidebarCollapsed ? "Open knowledge base" : "Close knowledge base"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
          )}
           {/* Mobile Sidebar Toggle */}
           {onToggleSidebar && (
            <button 
              onClick={onToggleSidebar}
              className="p-1.5 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors md:hidden"
              aria-label="Open knowledge base"
            >
              <Menu size={20} />
            </button>
          )}
          <div>
            <h2 className="text-xl font-semibold text-[#E2E2E2]">Documentation Browser</h2>
            {placeholderText && messages.filter(m => m.sender !== MessageSender.SYSTEM).length === 0 && (
               <p className="text-xs text-[#A8ABB4] mt-1 max-w-md truncate" title={placeholderText}>{placeholderText}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
              <select 
                id="model-select"
                value={selectedModel}
                onChange={(e) => onSetModel(e.target.value)}
                className="h-8 py-1 pl-2 pr-7 text-xs appearance-none border border-[rgba(255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] rounded-md focus:ring-1 focus:ring-white/20 focus:border-white/20"
                aria-label="Select AI Model"
              >
                {availableModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A8ABB4] pointer-events-none"
                aria-hidden="true"
              />
          </div>
        </div>
      </div>

      <div className="flex-grow p-4 overflow-y-auto chat-container bg-[#282828]">
        {/* New wrapper for max-width and centering */}
        <div className="max-w-4xl mx-auto w-full">
          {messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}
          
          {isFetchingSuggestions && (
              <div className="flex justify-center items-center p-3">
                  <div className="flex items-center space-x-1.5 text-[#A8ABB4]">
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
                      <span className="text-sm">Fetching suggestions...</span>
                  </div>
              </div>
          )}

          {showSuggestions && onSuggestedQueryClick && (
            <div className="my-3 px-1">
              <p className="text-xs text-[#A8ABB4] mb-1.5 font-medium">Or try one of these: </p>
              <div className="flex flex-wrap gap-1.5">
                {initialQuerySuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => onSuggestedQueryClick(suggestion)}
                    className="bg-[#79B8FF]/10 text-[#79B8FF] px-2.5 py-1 rounded-full text-xs hover:bg-[#79B8FF]/20 transition-colors shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 border-t border-[rgba(255,255,255,0.05)] bg-[#1E1E1E] rounded-b-xl">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            onPaste={handlePaste}
            placeholder="Ask about the documents..."
            className="flex-grow py-1.5 px-2.5 border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] placeholder-[#777777] rounded-lg focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-shadow resize-none text-sm"
            rows={1}
            style={{ overflowY: 'hidden' }}
            disabled={isLoading || isFetchingSuggestions}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
             {attachedImages.length > 0 && (
                <div className="max-h-[280px] w-16 overflow-y-auto flex flex-col items-center gap-2 chat-container pr-1">
                  {attachedImages.map((image, index) => (
                    <div key={`${image.name}-${index}`} className="relative w-16 h-16 flex-shrink-0">
                      <img src={image.dataUrl} alt={image.name} className="w-full h-full object-cover rounded-md" />
                      <button
                        onClick={() => handleRemoveImage(image.name)}
                        className="absolute -top-1.5 -right-1.5 p-0 bg-gray-800 rounded-full text-white hover:bg-red-500 transition-colors flex items-center justify-center"
                        aria-label={`Remove ${image.name}`}
                      >
                        <XCircle size={18} strokeWidth={1.5}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            <div className="flex items-center gap-2">
               <input
                type="file"
                ref={imageInputRef}
                onChange={handleImageChange}
                className="hidden"
                multiple
                accept="image/png, image/jpeg, image/webp, image/heic, image/heif"
              />
              <button
                onClick={() => imageInputRef.current?.click()}
                className="h-8 w-8 p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-lg transition-colors flex items-center justify-center flex-shrink-0"
                aria-label="Attach images"
                disabled={isLoading || isFetchingSuggestions}
              >
                <Paperclip size={16} />
              </button>
              <button
                onClick={handleToggleExpand}
                className="h-8 w-8 p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-lg transition-colors flex items-center justify-center flex-shrink-0"
                aria-label={isManuallyExpanded ? "Shrink input field" : "Expand input field"}
              >
                <ChevronsUpDown size={16} />
              </button>
              <button
                onClick={handleSend}
                disabled={isLoading || isFetchingSuggestions || (!userQuery.trim() && attachedImages.length === 0)}
                className="h-8 w-8 p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-lg transition-colors disabled:bg-[#4A4A4A] disabled:text-[#777777] flex items-center justify-center flex-shrink-0"
                aria-label="Send message"
              >
                {(isLoading && messages[messages.length-1]?.isLoading && messages[messages.length-1]?.sender === MessageSender.MODEL) ? 
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> 
                  : <Send size={16} />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
