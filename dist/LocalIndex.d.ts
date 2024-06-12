import { IndexItem, IndexStats, MetadataFilter, MetadataTypes, QueryResult } from "./types";
export interface CreateIndexConfig {
    version: number;
    apiKey: string;
    deleteIfExists?: boolean;
    metadata_config?: {
        indexed?: string[];
    };
    client?: any;
}
export interface CreateIndexOptions {
    apiKey: string;
}
/**
 * Local vector index instance.
 * @remarks
 * This class is used to create, update, and query a local vector index.
 * Each index is a folder on disk containing an index.json file and an optional set of metadata files.
 */
export declare class LocalIndex {
    private readonly _indexName;
    private _data?;
    private _update?;
    /**
     * Creates a new instance of LocalIndex.
     * @param folderPath Path to the index folder.
     * @param indexName Optional name of the index file. Defaults to index.json.
     */
    constructor(indexName?: string);
    /**
     * Optional name of the index file.
     */
    get indexName(): string | undefined;
    /**
     * Begins an update to the index.
     * @remarks
     * This method loads the index into memory and prepares it for updates.
     */
    beginUpdate(apiKey: string): Promise<void>;
    /**
     * Cancels an update to the index.
     * @remarks
     * This method discards any changes made to the index since the update began.
     */
    cancelUpdate(): void;
    createIndex(config?: CreateIndexConfig): Promise<any>;
    deleteIndex(apiKey: string): Promise<void>;
    deleteItem(id: string, apiKey: string): Promise<void>;
    /**
     * Ends an update to the index.
     * @remarks
     * This method saves the index to disk.
     */
    endUpdate(apiKey: string): Promise<void>;
    /**
     * Loads an index from disk and returns its stats.
     * @returns Index stats.
     */
    getIndexStats(apiKey: string): Promise<IndexStats>;
    /**
     * Returns an item from the index given its ID.
     * @param id ID of the item to retrieve.
     * @returns Item or undefined if not found.
     */
    getItem<TMetadata = Record<string, MetadataTypes>>(id: string, apiKey: string): Promise<IndexItem<TMetadata> | undefined>;
    /**
     * Adds an item to the index.
     * @remarks
     * A new update is started if one is not already in progress. If an item with the same ID
     * already exists, an error will be thrown.
     * @param item Item to insert.
     * @returns Inserted item.
     */
    insertItem<TMetadata = Record<string, MetadataTypes>>(item: Partial<IndexItem<TMetadata>>, apiKey: string): Promise<IndexItem<TMetadata>>;
    /**
     * Returns true if the index exists.
     */
    isIndexCreated(apiKey: string, indexName: string | undefined): Promise<boolean>;
    /**
     * Returns all items in the index.
     * @remarks
     * This method loads the index into memory and returns all its items. A copy of the items
     * array is returned so no modifications should be made to the array.
     * @returns Array of all items in the index.
     */
    listItems<TMetadata = Record<string, MetadataTypes>>(apiKey: string): Promise<IndexItem<TMetadata>[]>;
    /**
     * Returns all items in the index matching the filter.
     * @remarks
     * This method loads the index into memory and returns all its items matching the filter.
     * @param filter Filter to apply.
     * @returns Array of items matching the filter.
     */
    listItemsByMetadata<TMetadata = Record<string, MetadataTypes>>(filter: MetadataFilter, apiKey: string): Promise<IndexItem<TMetadata>[]>;
    /**
     * Finds the top k items in the index that are most similar to the vector.
     * @remarks
     * This method loads the index into memory and returns the top k items that are most similar.
     * An optional filter can be applied to the metadata of the items.
     * @param vector Vector to query against.
     * @param topK Number of items to return.
     * @param filter Optional. Filter to apply.
     * @returns Similar items to the vector that matche the supplied filter.
     */
    queryItems<TMetadata = Record<string, MetadataTypes>>(vector: number[], topK: number, apiKey: string, filter?: MetadataFilter): Promise<QueryResult<TMetadata>[]>;
    /**
     * Adds or replaces an item in the index.
     * @remarks
     * A new update is started if one is not already in progress. If an item with the same ID
     * already exists, it will be replaced.
     * @param item Item to insert or replace.
     * @returns Upserted item.
     */
    upsertItem<TMetadata = Record<string, MetadataTypes>>(item: Partial<IndexItem<TMetadata>>, apiKey: string): Promise<IndexItem<TMetadata>>;
    /**
     * Ensures that the index has been loaded into memory.
     */
    protected loadIndexData(apiKey: string): Promise<void>;
    private addItemToUpdate;
}
