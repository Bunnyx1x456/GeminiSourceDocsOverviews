/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, X, FileUp, KeyRound, Save } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { KnowledgeGroup, ManagedFile } from '../types';

interface KnowledgeBaseManagerProps {
  urls: string[];
  files: ManagedFile[];
  onAddUrl: (url: string) => void;
  onRemoveUrl: (url: string) => void;
  onAddFiles: (files: ManagedFile[]) => void;
  onRemoveFile: (fileName: string) => void;
  maxSources?: number;
  knowledgeGroups: KnowledgeGroup[];
  activeGroupId: string;
  onSetGroupId: (id: string) => void;
  onCloseSidebar?: () => void;
  apiKey: string;
  onSetApiKey: (key: string) => void;
}

// Set worker source for pdf.js to ensure it can run in the background
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs';

const KnowledgeBaseManager: React.FC<KnowledgeBaseManagerProps> = ({ 
  urls, 
  files,
  onAddUrl, 
  onRemoveUrl, 
  onAddFiles,
  onRemoveFile,
  maxSources = 20,
  knowledgeGroups,
  activeGroupId,
  onSetGroupId,
  onCloseSidebar,
  apiKey,
  onSetApiKey,
}) => {
  const [currentUrlInput, setCurrentUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);

  useEffect(() => {
    setApiKeyInput(apiKey);
  }, [apiKey]);

  const handleSaveApiKey = () => {
    onSetApiKey(apiKeyInput.trim());
    // Optionally, you could add a success message here
  };

  const totalSources = urls.length + files.length;

  const isValidUrl = (urlString: string): boolean => {
    try {
      new URL(urlString);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleAddUrl = () => {
    if (!currentUrlInput.trim()) {
      setError('URL cannot be empty.');
      return;
    }
    if (!isValidUrl(currentUrlInput)) {
      setError('Invalid URL format. Please include http:// or https://');
      return;
    }
    if (totalSources >= maxSources) {
      setError(`You can add a maximum of ${maxSources} sources to the current group.`);
      return;
    }
    if (urls.includes(currentUrlInput)) {
      setError('This URL has already been added to the current group.');
      return;
    }
    onAddUrl(currentUrlInput);
    setCurrentUrlInput('');
    setError(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setError(null); // Reset errors on new selection

    if (totalSources >= maxSources) {
      setError(`Maximum sources (${maxSources}) reached. Cannot add more files.`);
      return;
    }

    const filesToProcess = Array.from(selectedFiles).filter(
      (file) => !files.some((existingFile) => existingFile.name === file.name)
    );

    if (totalSources + filesToProcess.length > maxSources) {
      setError(`Cannot add all selected files. Adding ${filesToProcess.length} file(s) would exceed the ${maxSources} source limit.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    
    const readPromises = filesToProcess.map((file) => {
      return new Promise<ManagedFile>((resolve, reject) => {
        const reader = new FileReader();
        const fileExtension = file.name.split('.').pop()?.toLowerCase();

        reader.onload = async (e) => {
          try {
            const fileContent = e.target?.result;
            if (!fileContent) return reject(new Error(`Could not read: ${file.name}`));

            let extractedText: string | null = null;

            switch (fileExtension) {
              case 'docx':
                const docxResult = await mammoth.extractRawText({ arrayBuffer: fileContent as ArrayBuffer });
                extractedText = docxResult.value;
                break;
              case 'xlsx':
                const workbook = XLSX.read(fileContent, { type: 'array' });
                let xlsxText = '';
                workbook.SheetNames.forEach(sheetName => {
                  xlsxText += `Sheet: ${sheetName}\n\n`;
                  const worksheet = workbook.Sheets[sheetName];
                  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
                  jsonData.forEach(row => {
                    if (row.length > 0) xlsxText += row.join('\t') + '\n';
                  });
                  xlsxText += '\n';
                });
                extractedText = xlsxText;
                break;
              case 'pdf':
                try {
                  const pdf = await pdfjsLib.getDocument({ data: fileContent as ArrayBuffer }).promise;
                  let pdfText = '';
                  for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    pdfText += textContent.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n';
                  }
                  extractedText = pdfText;
                } catch (pdfError: any) {
                  return reject(new Error(`Failed to parse PDF ${file.name}: ${pdfError.message}`));
                }
                break;
              case 'txt': case 'js': case 'ts': case 'jsx': case 'tsx':
              case 'json': case 'md': case 'html': case 'css': case 'py':
                extractedText = fileContent as string;
                break;
              case 'doc': case 'pptx':
                return reject(new Error(`.${fileExtension} is not supported`));
              default:
                // For unknown extensions, we assume it's a text file as per readAsText call.
                extractedText = fileContent as string;
            }
            
            if (extractedText !== null) {
              resolve({ name: file.name, content: extractedText });
            } else {
              reject(new Error(`Could not extract text from ${file.name}`));
            }
          } catch (processError: any) {
            reject(new Error(`Failed to process ${file.name}`));
          }
        };

        reader.onerror = () => reject(new Error(`Error reading ${file.name}`));

        if (['docx', 'xlsx', 'pdf'].includes(fileExtension || '')) {
          reader.readAsArrayBuffer(file);
        } else {
          reader.readAsText(file);
        }
      });
    });

    const results = await Promise.allSettled(readPromises);
    
    const successfulFiles: ManagedFile[] = [];
    const errorMessages: string[] = [];

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        successfulFiles.push(result.value);
      } else {
        errorMessages.push(result.reason.message);
      }
    });

    if (successfulFiles.length > 0) {
      onAddFiles(successfulFiles);
    }
    if (errorMessages.length > 0) {
      setError(`Import errors: ${errorMessages.join(', ')}.`);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  const activeGroupName = knowledgeGroups.find(g => g.id === activeGroupId)?.name || "Unknown Group";

  return (
    <div className="p-4 bg-[#1E1E1E] shadow-md rounded-xl h-full flex flex-col border border-[rgba(255,255,255,0.05)]">
       <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept=".txt,.js,.ts,.jsx,.tsx,.json,.md,.html,.css,.py,.docx,.xlsx,.pdf,.doc,.pptx"
      />
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-[#E2E2E2]">Knowledge Base</h2>
        {onCloseSidebar && (
          <button
            onClick={onCloseSidebar}
            className="p-1 text-[#A8ABB4] hover:text-white rounded-md hover:bg-white/10 transition-colors md:hidden"
            aria-label="Close knowledge base"
          >
            <X size={24} />
          </button>
        )}
      </div>
      
      <div className="mb-3">
        <label htmlFor="url-group-select-kb" className="block text-sm font-medium text-[#A8ABB4] mb-1">
          Active Knowledge Group
        </label>
        <div className="relative w-full">
          <select
            id="url-group-select-kb"
            value={activeGroupId}
            onChange={(e) => onSetGroupId(e.target.value)}
            className="w-full py-2 pl-3 pr-8 appearance-none border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] rounded-md focus:ring-1 focus:ring-white/20 focus:border-white/20 text-sm"
          >
            {knowledgeGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A8ABB4] pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        <input
          type="url"
          value={currentUrlInput}
          onChange={(e) => setCurrentUrlInput(e.target.value)}
          placeholder="https://docs.example.com"
          className="flex-grow h-8 py-1 px-2.5 border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] placeholder-[#777777] rounded-lg focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-shadow text-sm"
          onKeyPress={(e) => e.key === 'Enter' && handleAddUrl()}
        />
        <button
          onClick={handleAddUrl}
          disabled={totalSources >= maxSources}
          className="h-8 w-8 p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-lg transition-colors disabled:bg-[#4A4A4A] disabled:text-[#777777] flex items-center justify-center"
          aria-label="Add URL"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={totalSources >= maxSources}
          className="w-full flex items-center justify-center gap-2 h-8 py-1 px-2.5 border border-dashed border-[rgba(255,255,255,0.2)] hover:border-white/40 bg-white/[.05] hover:bg-white/[.08] text-[#A8ABB4] hover:text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/[.05] disabled:hover:border-[rgba(255,255,255,0.2)]"
        >
          <FileUp size={14}/> Import Files
        </button>
      </div>

      {error && <p className="text-xs text-[#f87171] mb-2">{error}</p>}
      {totalSources >= maxSources && <p className="text-xs text-[#fbbf24] mb-2">Maximum {maxSources} sources reached for this group.</p>}
      
      <div className="flex-grow overflow-y-auto space-y-2 chat-container pr-1">
        {totalSources === 0 && (
          <p className="text-[#777777] text-center py-3 text-sm">Add documentation URLs or import files to the group "{activeGroupName}" to start querying.</p>
        )}
        
        {urls.length > 0 && <h3 className="text-xs font-semibold text-[#A8ABB4] uppercase tracking-wider px-1 pt-2">URLs ({urls.length})</h3>}
        {urls.map((url) => (
          <div key={url} className="flex items-center justify-between p-2.5 bg-[#2C2C2C] border border-[rgba(255,255,255,0.05)] rounded-lg hover:shadow-sm transition-shadow">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#79B8FF] hover:underline truncate" title={url}>
              {url}
            </a>
            <button 
              onClick={() => onRemoveUrl(url)}
              className="p-1 text-[#A8ABB4] hover:text-[#f87171] rounded-md hover:bg-[rgba(255,0,0,0.1)] transition-colors flex-shrink-0 ml-2"
              aria-label={`Remove ${url}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {files.length > 0 && <h3 className="text-xs font-semibold text-[#A8ABB4] uppercase tracking-wider px-1 pt-2">Files ({files.length})</h3>}
        {files.map((file) => (
          <div key={file.name} className="flex items-center justify-between p-2.5 bg-[#2C2C2C] border border-[rgba(255,255,255,0.05)] rounded-lg hover:shadow-sm transition-shadow">
            <p className="text-xs text-white truncate" title={file.name}>
              {file.name}
            </p>
            <button 
              onClick={() => onRemoveFile(file.name)}
              className="p-1 text-[#A8ABB4] hover:text-[#f87171] rounded-md hover:bg-[rgba(255,0,0,0.1)] transition-colors flex-shrink-0 ml-2"
              aria-label={`Remove ${file.name}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      
      <div className="mt-auto pt-3 border-t border-[rgba(255,255,255,0.05)]">
        <label htmlFor="api-key-input" className="block text-sm font-medium text-[#A8ABB4] mb-1">
          Gemini API Key
        </label>
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-[#A8ABB4] flex-shrink-0" />
          <input
            id="api-key-input"
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Enter your API Key"
            className="flex-grow h-8 py-1 px-2.5 border border-[rgba(255,255,255,0.1)] bg-[#2C2C2C] text-[#E2E2E2] placeholder-[#777777] rounded-lg focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-shadow text-sm"
            onKeyPress={(e) => e.key === 'Enter' && handleSaveApiKey()}
          />
          <button
            onClick={handleSaveApiKey}
            className="h-8 w-8 p-1.5 bg-white/[.12] hover:bg-white/20 text-white rounded-lg transition-colors flex items-center justify-center"
            aria-label="Save API Key"
          >
            <Save size={16} />
          </button>
        </div>
        {!apiKey && (
          <p className="text-xs text-[#fbbf24] mt-1.5 px-1">
            Your API key is stored only in your browser's local storage.
          </p>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBaseManager;
