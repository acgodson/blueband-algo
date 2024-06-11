import { v4 } from "uuid";
import { GPT3Tokenizer } from "./GPT3Tokenizer";
import { CreateIndexConfig, LocalIndex } from "./LocalIndex";
import { TextSplitter, TextSplitterConfig } from "./TextSplitter";
import {
  MetadataFilter,
  EmbeddingsModel,
  Tokenizer,
  MetadataTypes,
  EmbeddingsResponse,
  QueryResult,
  DocumentChunkMetadata,
  DocumentCatalogStats,
} from "./types";
import { LocalDocumentResult } from "./LocalDocumentResult";
import { LocalDocument } from "./LocalDocument";
import lighthouse from "@lighthouse-web3/sdk";
import dotenv from "dotenv";
dotenv.config();

export interface DocumentQueryOptions {
  maxDocuments?: number;
  maxChunks?: number;
  filter?: MetadataFilter;
}

export interface LocalDocumentIndexConfig {
  indexName?: string;
  apiKey: string;
  agent?: string;
  isCatalog?: boolean;
  _getDocumentId?: (documentUri: string) => Promise<string | undefined>;
  _getDoumentUri?: (documentId: string) => Promise<string | undefined>;
  embeddings?: EmbeddingsModel;
  tokenizer?: Tokenizer;
  chunkingConfig?: Partial<TextSplitterConfig>;
}

export class LocalDocumentIndex extends LocalIndex {
  private readonly _embeddings?: EmbeddingsModel;
  private readonly _tokenizer: Tokenizer;
  private readonly apiKey: string;
  private readonly isCatalog?: boolean;
  private readonly _getDocumentId?: (
    documentUri: string
  ) => Promise<string | undefined>;
  private readonly _getDoumentUri?: (
    documentId: string
  ) => Promise<string | undefined>;
  private readonly agent?: string;
  private readonly _chunkingConfig?: TextSplitterConfig;
  private _catalog?: DocumentCatalog;
  private _newCatalog?: DocumentCatalog;

  public constructor(config: LocalDocumentIndexConfig) {
    super(config.indexName);
    this._embeddings = config.embeddings;
    this._chunkingConfig = Object.assign(
      {
        keepSeparators: true,
        chunkSize: 512,
        chunkOverlap: 0,
      } as TextSplitterConfig,
      config.chunkingConfig
    );
    this._tokenizer =
      config.tokenizer ?? this._chunkingConfig.tokenizer ?? new GPT3Tokenizer();
    this._chunkingConfig.tokenizer = this._tokenizer;
    this.apiKey = config.apiKey;
    if (config.agent) {
      this.agent = config.agent;
    }
    this.isCatalog = config.isCatalog;
    this._getDocumentId = config._getDocumentId;
    this._getDoumentUri = config._getDoumentUri;
  }

  public get embeddings(): EmbeddingsModel | undefined {
    return this._embeddings;
  }

  public get lightHouseKey(): string {
    return this.apiKey;
  }

  public get tokenizer(): Tokenizer {
    return this._tokenizer;
  }

  public async isCatalogCreated(): Promise<boolean> {
    return this.isCatalog ?? false;
  }

  public async getDocumentId(
    uri: string,
    apiKey: string
  ): Promise<string | undefined> {
    await this.loadIndexData(apiKey);

    const x = this._getDocumentId ? await this._getDocumentId(uri) : undefined;
    return x;
  }

  public async getDocumentUri(
    documentId: string,
    apiKey: string
  ): Promise<string | undefined> {
    await this.loadIndexData(apiKey);

    const x = this._getDoumentUri
      ? await this._getDoumentUri(documentId)
      : undefined;
    return x;
  }

  public async getCatalogStats(): Promise<DocumentCatalogStats> {
    const stats = await this.getIndexStats(this.apiKey);
    return {
      version: this._catalog!.version,
      documents: this._catalog!.count,
      chunks: stats.items,
      metadata_config: stats.metadata_config,
    };
  }

  public async deleteDocument(uri: string): Promise<void> {
    // Lookup document ID
    const documentId = await this.getDocumentId(uri, this.apiKey);
    if (documentId == undefined) {
      return;
    }

    // Delete document chunks from index and remove from catalog
    await this.beginUpdate();
    try {
      // Get list of chunks for document
      const chunks = await this.listItemsByMetadata<DocumentChunkMetadata>(
        {
          documentId,
        },
        this.apiKey
      );

      // Delete chunks
      for (const chunk of chunks) {
        await this.deleteItem(chunk.id, this.apiKey);
      }
      // Remove entry from catalog
      delete this._newCatalog!.uriToId[uri];
      delete this._newCatalog!.idToUri[documentId];
      this._newCatalog!.count--;

      // Commit changes
      await this.endUpdate();
    } catch (err: unknown) {
      // Cancel update and raise error
      this.cancelUpdate();
      throw new Error(
        `Error deleting document "${uri}": ${(err as any).toString()}`
      );
    }
  }

  public async upsertDocument(
    uri: string,
    text: string,
    docType?: string,
    metadata?: Record<string, MetadataTypes>
  ): Promise<LocalDocument> {
    // Ensure embeddings configured
    if (!this._embeddings) {
      throw new Error(`Embeddings model not configured.`);
    }

    // Check for existing document ID
    let documentId = await this.getDocumentId(uri, this.apiKey);

    if (documentId != undefined) {
      // Delete existing document
      await this.deleteDocument(uri);
    }
    //save it on ipfs first

    const response = await lighthouse.uploadText(text, this.apiKey);

    // console.log(response);
    documentId = response.data.Hash;

    if (!documentId) {
      throw new Error("failed to upload text to IPFS");
    }

    // Initialize text splitter settings
    const config = Object.assign({ docType }, this._chunkingConfig);
    if (config.docType == undefined) {
      // Populate docType based on extension
      const pos = uri.lastIndexOf(".");
      if (pos >= 0) {
        const ext = uri.substring(pos + 1).toLowerCase();
        config.docType = ext;
      }
    }

    // Split text into chunks
    const splitter = new TextSplitter(config);
    const chunks = splitter.split(text);

    // Break chunks into batches for embedding generation
    let totalTokens = 0;
    const chunkBatches: string[][] = [];
    let currentBatch: string[] = [];
    for (const chunk of chunks) {
      totalTokens += chunk.tokens.length;
      if (totalTokens > this._embeddings.maxTokens) {
        chunkBatches.push(currentBatch);
        currentBatch = [];
        totalTokens = chunk.tokens.length;
      }
      currentBatch.push(chunk.text.replace(/\n/g, " "));
    }
    if (currentBatch.length > 0) {
      chunkBatches.push(currentBatch);
    }

    // Generate embeddings for chunks
    const embeddings: number[][] = [];
    for (const batch of chunkBatches) {
      let response: EmbeddingsResponse;
      try {
        response = await this._embeddings.createEmbeddings(batch);
      } catch (err: unknown) {
        throw new Error(
          `Error generating embeddings: ${(err as any).toString()}`
        );
      }

      // Check for error
      if (response.status != "success") {
        throw new Error(`Error generating embeddings: ${response.message}`);
      }

      // Add embeddings to output
      for (const embedding of response.output!) {
        embeddings.push(embedding);
      }
    }

    // Add document chunks to index
    await this.beginUpdate();

    try {
      // Add chunks to index
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        const chunkMetadata: DocumentChunkMetadata = Object.assign(
          {
            documentId,
            startPos: chunk.startPos,
            endPos: chunk.endPos,
          },
          metadata
        );
        await this.insertItem(
          {
            id: v4(),
            metadata: chunkMetadata,
            vector: embedding,
          },
          this.apiKey
        );
      }

      // Add entry to catalog
      this._newCatalog!.uriToId[uri] = documentId;
      this._newCatalog!.idToUri[documentId] = uri;
      this._newCatalog!.count++;

      // Commit changes
      await this.endUpdate();
    } catch (err: unknown) {
      // Cancel update and raise error
      this.cancelUpdate();
      throw new Error(
        `Error adding document "${uri}": ${(err as any).toString()}`
      );
    }

    // Return document
    return new LocalDocument(this, documentId, uri);
  }

  public async listDocuments(): Promise<LocalDocumentResult[]> {
    // Sort chunks by document ID
    const docs: { [documentId: string]: QueryResult<DocumentChunkMetadata>[] } =
      {};
    const chunks = await this.listItems<DocumentChunkMetadata>(this.apiKey);
    chunks.forEach((chunk) => {
      const metadata = chunk.metadata;
      //TODO: verify this
      if (
        docs[metadata.documentId] == undefined ||
        docs[metadata.documentId].length < 1
      ) {
        docs[metadata.documentId] = [];
      }
      docs[metadata.documentId].push({ item: chunk, score: 1.0 });
    }, this.apiKey);

    // Create document results
    const results: LocalDocumentResult[] = [];
    for (const documentId in docs) {
      const uri = await this.getDocumentUri(documentId, this.apiKey);
      const documentResult = new LocalDocumentResult(
        this,
        documentId,
        uri!,
        docs[documentId],
        this._tokenizer
      );
      results.push(documentResult);
    }

    return results;
  }

  public async queryDocuments(
    query: string,
    options?: DocumentQueryOptions
  ): Promise<LocalDocumentResult[]> {
    // Ensure embeddings configured
    if (!this._embeddings) {
      throw new Error(`Embeddings model not configured.`);
    }

    // Ensure options are defined
    options = Object.assign(
      {
        maxDocuments: 10,
        maxChunks: 50,
      },
      options
    );

    // Generate embeddings for query
    let embeddings: EmbeddingsResponse;
    try {
      embeddings = await this._embeddings.createEmbeddings(
        query.replace(/\n/g, " ")
      );
    } catch (err: unknown) {
      throw new Error(
        `Error generating embeddings for query: ${(err as any).toString()}`
      );
    }

    // Check for error
    if (embeddings.status != "success") {
      throw new Error(
        `Error generating embeddings for query: ${embeddings.message}`
      );
    }

    // Query index for chunks
    const results = await this.queryItems<DocumentChunkMetadata>(
      embeddings.output![0],
      options.maxChunks!,
      options.filter as any
    );

    // Group chunks by document
    const documentChunks: {
      [documentId: string]: QueryResult<DocumentChunkMetadata>[];
    } = {};

    for (const result of results) {
      const metadata = result.item.metadata;
      if (documentChunks[metadata.documentId] == undefined) {
        documentChunks[metadata.documentId] = [];
      }
      documentChunks[metadata.documentId].push(result);
    }

    // Create a document result for each document
    const documentResults: LocalDocumentResult[] = [];

    // console.log("document result", documentChunks);

    for (const documentId in documentChunks) {
      const chunks = documentChunks[documentId];
      // console.log("new chunks", documentId);
      if (documentId) {
        const uri = await this.getDocumentUri(documentId, this.apiKey);
        const documentResult = new LocalDocumentResult(
          this,
          documentId,
          uri!,
          chunks,
          this._tokenizer
        );
        documentResults.push(documentResult);
      }
    }

    // Sort document results by score and return top results
    return documentResults
      .sort((a, b) => b.score - a.score)
      .slice(0, options.maxDocuments!);
  }

  public async beginUpdate(): Promise<void> {
    await super.beginUpdate(this.apiKey);
    this._newCatalog = Object.assign({}, this._catalog);
  }

  public cancelUpdate(): void {
    super.cancelUpdate();
    this._newCatalog = undefined;
  }

  public async createIndex(
    config?: CreateIndexConfig
  ): Promise<string | undefined> {
    const newIndex = await super.createIndex(config);
    await this.loadIndexData(this.apiKey);
    return newIndex;
  }

  public async endUpdate(): Promise<void> {
    await super.endUpdate(this.apiKey);

    try {
      // Save catalog on smart contract
      this._catalog = this._newCatalog;
      this._newCatalog = undefined;
    } catch (err: unknown) {
      throw new Error(
        `Error saving document catalog: ${(err as any).toString()}`
      );
    }
  }

  protected async loadIndexData(apiKey: string): Promise<void> {
    await super.loadIndexData(apiKey);

    if (this._catalog) {
      return;
    }
    //creating catalog on the smart contract
    if (await this.isCatalogCreated()) {
      this._catalog = {
        version: 1,
        count: 0,
        uriToId: {},
        idToUri: {},
      };
    } else {
      this._catalog = {
        version: 1,
        count: 0,
        uriToId: {},
        idToUri: {},
      };
    }
  }
}

interface DocumentCatalog {
  version: number;
  count: number;
  uriToId: { [uri: string]: string };
  idToUri: { [id: string]: string };
}
