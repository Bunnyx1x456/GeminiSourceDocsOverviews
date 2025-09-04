/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export enum MessageSender {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
}

export interface UrlContextMetadataItem {
  retrievedUrl: string; // Changed from retrieved_url
  urlRetrievalStatus: string; // Changed from url_retrieval_status
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: MessageSender;
  timestamp: Date;
  isLoading?: boolean;
  urlContext?: UrlContextMetadataItem[];
  images?: string[]; // Array of data URLs
}

export interface ManagedFile {
  name: string;
  content: string;
}

export interface KnowledgeGroup {
  id:string;
  name: string;
  urls: string[];
  files: ManagedFile[];
}

export interface ModelDefinition {
  id: string;
  name: string;
}

export interface AttachedImage {
  name: string;
  dataUrl: string;
  type: string;
}
