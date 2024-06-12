import { CreateIndexConfig, LocalIndex } from "./LocalIndex";
import { TextSplitterConfig } from "./TextSplitter";
import { MetadataFilter, EmbeddingsModel, Tokenizer, MetadataTypes, DocumentCatalogStats } from "./types";
import { LocalDocumentResult } from "./LocalDocumentResult";
import { LocalDocument } from "./LocalDocument";
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
export declare class LocalDocumentIndex extends LocalIndex {
    private readonly _embeddings?;
    private readonly _tokenizer;
    private readonly apiKey;
    private readonly isCatalog?;
    private readonly _getDocumentId?;
    private readonly _getDoumentUri?;
    private readonly agent?;
    private readonly _chunkingConfig?;
    private _catalog?;
    private _newCatalog?;
    constructor(config: LocalDocumentIndexConfig);
    get embeddings(): EmbeddingsModel | undefined;
    get lightHouseKey(): string;
    get tokenizer(): Tokenizer;
    isCatalogCreated(): Promise<boolean>;
    getDocumentId(uri: string, apiKey: string): Promise<string | undefined>;
    getDocumentUri(documentId: string, apiKey: string): Promise<string | undefined>;
    getCatalogStats(): Promise<DocumentCatalogStats>;
    deleteDocument(uri: string): Promise<void>;
    upsertDocument(uri: string, text: string, docType?: string, metadata?: Record<string, MetadataTypes>): Promise<LocalDocument>;
    listDocuments(): Promise<LocalDocumentResult[]>;
    queryDocuments(query: string, options?: DocumentQueryOptions): Promise<LocalDocumentResult[]>;
    beginUpdate(): Promise<void>;
    cancelUpdate(): void;
    createIndex(config?: CreateIndexConfig): Promise<string | undefined>;
    endUpdate(): Promise<void>;
    protected loadIndexData(apiKey: string): Promise<void>;
}
