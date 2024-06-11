import { v4 } from "uuid";
import { ItemSelector } from "./ItemSelector";
import lighthouse from "@lighthouse-web3/sdk";
import axios from "axios";

import {
  IndexItem,
  IndexStats,
  MetadataFilter,
  MetadataTypes,
  QueryResult,
} from "./types";
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
export class LocalIndex {
  private readonly _indexName: string | undefined;

  private _data?: IndexData;
  private _update?: IndexData;

  /**
   * Creates a new instance of LocalIndex.
   * @param folderPath Path to the index folder.
   * @param indexName Optional name of the index file. Defaults to index.json.
   */
  public constructor(indexName?: string) {
    this._indexName = indexName;
  }

  /**
   * Optional name of the index file.
   */
  public get indexName(): string | undefined {
    return this._indexName || this._data?.ipnsId;
  }

  /**
   * Begins an update to the index.
   * @remarks
   * This method loads the index into memory and prepares it for updates.
   */
  public async beginUpdate(apiKey: string): Promise<void> {
    if (this._update) {
      throw new Error("Update already in progress");
    }

    await this.loadIndexData(apiKey);
    if (this._data) {
      this._update = Object.assign({}, this._data);
    }
  }

  /**
   * Cancels an update to the index.
   * @remarks
   * This method discards any changes made to the index since the update began.
   */
  public cancelUpdate(): void {
    this._update = undefined;
  }

  public async createIndex(
    config: CreateIndexConfig = { version: 1, apiKey: "" }
  ): Promise<any> {
    try {
      // Generate IPNS key using Lighthouse SDK
      const keyResponse = await lighthouse.generateKey(config.apiKey);

      this._data = {
        ipnsName: keyResponse.data.ipnsName,
        ipnsId: keyResponse.data.ipnsId,
        version: config.version,
        metadata_config: config.metadata_config ?? {},
        items: [],
      };

      const response = await lighthouse.uploadText(
        JSON.stringify(this._data),
        config.apiKey,
        keyResponse.data.ipnsName
      );

      if (response.data) {
        const pubResponse = await lighthouse.publishRecord(
          response.data.Hash,
          keyResponse.data.ipnsName,
          config.apiKey
        );
      }
      return keyResponse.data;
    } catch (err: unknown) {
      await this.deleteIndex(config.apiKey);
      throw new Error("Error creating index");
    }
  }

  public async deleteIndex(apiKey: string): Promise<void> {
    try {
      // Delete IPNS key using Lighthouse SDK if it exists
      if (this._data && this._data.ipnsName) {
        const removeRes = await lighthouse.removeKey(
          this._data.ipnsName,
          apiKey
        );
        console.log("IPNS key removed successfully:");
        console.log(removeRes.data);
      }
      this._data = undefined;
    } catch (err: unknown) {
      throw new Error("Error deleting index");
    }
  }

  public async deleteItem(id: string, apiKey: string): Promise<void> {
    if (this._update) {
      const index = this._update.items.findIndex((i) => i.id === id);
      if (index >= 0) {
        this._update.items.splice(index, 1);
      }
    } else {
      await this.beginUpdate(apiKey);
      const index = this._update!.items.findIndex((i) => i.id === id);
      if (index >= 0) {
        this._update!.items.splice(index, 1);
      }
      await this.endUpdate(apiKey);
    }
  }

  /**
   * Ends an update to the index.
   * @remarks
   * This method saves the index to disk.
   */
  public async endUpdate(apiKey: string): Promise<void> {
    if (!this._data) {
      throw new Error("No data");
    }
    if (!this._update) {
      throw new Error("No update in progress");
    }

    try {
      // console.log("this update", this._update)

      // Step 2: Upload text to IPNS
      const response = await lighthouse.uploadText(
        JSON.stringify(this._update),
        apiKey,
        this._update.ipnsName
      );

      const ipfsData = await response.data.Hash;

      // Step 2: Publish the data to IPNS
      const publishResponse = await lighthouse.publishRecord(
        ipfsData,
        this._update.ipnsName,
        apiKey
      );

      // Step 3: Handle successful publication
      if (publishResponse.data.Value) {
        console.log("Index updated on IPNS:", publishResponse.data);
        this._data = this._update;
        this._update = undefined;
      } else {
        throw new Error("Failed to publish index to IPNS");
      }
    } catch (err) {
      throw new Error(
        `Error publishing index to IPNS: ${(err as Error).message}`
      );
    }
  }

  /**
   * Loads an index from disk and returns its stats.
   * @returns Index stats.
   */
  public async getIndexStats(apiKey: string): Promise<IndexStats> {
    await this.loadIndexData(apiKey);
    return {
      version: this._data!.version,
      metadata_config: this._data!.metadata_config,
      items: this._data!.items.length,
    };
  }

  /**
   * Returns an item from the index given its ID.
   * @param id ID of the item to retrieve.
   * @returns Item or undefined if not found.
   */
  public async getItem<TMetadata = Record<string, MetadataTypes>>(
    id: string,
    apiKey: string
  ): Promise<IndexItem<TMetadata> | undefined> {
    await this.loadIndexData(apiKey);
    return this._data!.items.find((i) => i.id === id) as any | undefined;
  }

  /**
   * Adds an item to the index.
   * @remarks
   * A new update is started if one is not already in progress. If an item with the same ID
   * already exists, an error will be thrown.
   * @param item Item to insert.
   * @returns Inserted item.
   */
  public async insertItem<TMetadata = Record<string, MetadataTypes>>(
    item: Partial<IndexItem<TMetadata>>,
    apiKey: string
  ): Promise<IndexItem<TMetadata>> {
    if (this._update) {
      return (await this.addItemToUpdate(item, true)) as any;
    } else {
      await this.beginUpdate(apiKey);
      const newItem = await this.addItemToUpdate(item, true);
      await this.endUpdate(apiKey);
      return newItem as any;
    }
  }

  /**
   * Returns true if the index exists.
   */

  public async isIndexCreated(
    apiKey: string,
    indexName: string | undefined
  ): Promise<boolean> {
    try {
      // return true;

      const response = await axios.get(
        `https://gateway.lighthouse.storage/ipns/${indexName}`
      );
      const data = response.data;

      if (data) {
        return true;
      } else {
        false;
      }

      // console.log("index created", data);

      // // Get all keys from Lighthouse SDK
      // const allKeys = await lighthouse.getAllKeys(apiKey);

      // if (!allKeys.data) {
      //   console.error("lighthouse didn't return any key");
      // }

      // if (indexName) {
      //   console.log("I found this", indexName);
      //   if (allKeys.data.find((key) => key.ipnsId === indexName)) {
      //     return true;
      //   } else {
      //     console.log("didnt find the id amongst available keys");
      //     return false;
      //   }
      // } else if (this._data) {
      //   if (allKeys.data.find((key) => key.ipnsId === this._data?.ipnsId))
      //     return true;
      // }
      return false;
    } catch (err: unknown) {
      // Handle errors
      console.error("Error checking if index is created:", err);
      return false;
    }
  }

  /**
   * Returns all items in the index.
   * @remarks
   * This method loads the index into memory and returns all its items. A copy of the items
   * array is returned so no modifications should be made to the array.
   * @returns Array of all items in the index.
   */
  public async listItems<TMetadata = Record<string, MetadataTypes>>(
    apiKey: string
  ): Promise<IndexItem<TMetadata>[]> {
    await this.loadIndexData(apiKey);
    return this._data!.items.slice() as any;
  }

  /**
   * Returns all items in the index matching the filter.
   * @remarks
   * This method loads the index into memory and returns all its items matching the filter.
   * @param filter Filter to apply.
   * @returns Array of items matching the filter.
   */
  public async listItemsByMetadata<TMetadata = Record<string, MetadataTypes>>(
    filter: MetadataFilter,
    apiKey: string
  ): Promise<IndexItem<TMetadata>[]> {
    await this.loadIndexData(apiKey);
    return this._data!.items.filter((i) =>
      ItemSelector.select(i.metadata, filter)
    ) as any;
  }

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
  public async queryItems<TMetadata = Record<string, MetadataTypes>>(
    vector: number[],
    topK: number,
    apiKey: string,
    filter?: MetadataFilter
  ): Promise<QueryResult<TMetadata>[]> {
    await this.loadIndexData(apiKey);

    // Filter items
    let items = this._data!.items;
    if (filter) {
      items = items.filter((i) => ItemSelector.select(i.metadata, filter));
    }

    // Calculate distances
    const norm = ItemSelector.normalize(vector);
    const distances: { index: number; distance: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const distance = ItemSelector.normalizedCosineSimilarity(
        vector,
        norm,
        item.vector,
        item.norm
      );
      distances.push({ index: i, distance: distance });
    }

    // Sort by distance DESCENDING
    distances.sort((a, b) => b.distance - a.distance);

    // Find top k
    const top: QueryResult<TMetadata>[] = distances.slice(0, topK).map((d) => {
      return {
        item: Object.assign({}, items[d.index]) as any,
        score: d.distance,
      };
    });

    // Load external metadata
    // for (const item of top) {
    //   if (item.item.metadataFile) {
    //     const metadataPath = path.join(
    //       //@ts-ignore
    //       this._folderPath,
    //       item.item.metadataFile
    //     );
    //     const metadata = await fs.readFile(metadataPath);
    //     item.item.metadata = JSON.parse(metadata.toString());
    //   }
    // }

    return top;
  }

  /**
   * Adds or replaces an item in the index.
   * @remarks
   * A new update is started if one is not already in progress. If an item with the same ID
   * already exists, it will be replaced.
   * @param item Item to insert or replace.
   * @returns Upserted item.
   */
  public async upsertItem<TMetadata = Record<string, MetadataTypes>>(
    item: Partial<IndexItem<TMetadata>>,
    apiKey: string
  ): Promise<IndexItem<TMetadata>> {
    if (this._update) {
      return (await this.addItemToUpdate(item, false)) as any;
    } else {
      await this.beginUpdate(apiKey);
      const newItem = await this.addItemToUpdate(item, false);
      await this.endUpdate(apiKey);
      return newItem as any;
    }
  }

  /**
   * Ensures that the index has been loaded into memory.
   */

  protected async loadIndexData(apiKey: string): Promise<void> {
    if (!this._data && !this._indexName) {
      console.error("data is not there");
      return;
    }

    // console.log(this._indexName, this._data?.ipnsId);

    if (
      !(await this.isIndexCreated(
        apiKey,
        this._data?.ipnsId || this._indexName // ?  this._indexName : this._data?.ipnsId
      ))
    ) {
      throw new Error("Index does not exist");
    }

    try {
      // Get all keys from Lighthouse SDK
      // const allKeys = await lighthouse.getAllKeys(apiKey);
      const ipnsId = this._indexName ? this._indexName : this._data?.ipnsId;

      // if (!allKeys.data) {
      //   console.error("lighthouse didn't return any key");
      // }
      // console.log("ipnsId", ipnsId);
      // console.log(allKeys.data.map((x) => x.ipnsId));

      // // Find the IPNS record associated with the index
      // const ipnsRecord = allKeys.data.find((key) => key.ipnsId === ipnsId);
      // if (!ipnsRecord) {
      //   throw new Error("IPNS record not found");
      // }

      // Use a gateway to retrieve the content associated with the CID
      const response = await axios.get(
        `https://gateway.lighthouse.storage/ipns/${ipnsId}`
      );
      const data = response.data;

      // console.log("index created", data);

      // Parse the retrieved data
      this._data = data;
    } catch (error) {
      console.error("Error loading index data:", error);
      throw new Error("Failed to load index data");
    }
  }

  private async addItemToUpdate(
    item: Partial<IndexItem<any>>,
    unique: boolean
  ): Promise<IndexItem> {
    // Ensure vector is provided
    if (!item.vector) {
      throw new Error("Vector is required");
    }

    // Ensure unique
    const id = item.id ?? v4();

    if (unique) {
      const existing = (this._update?.items || []).find(
        (i) => i.id && i.id === id
      );
      if (existing) {
        throw new Error(`Item with id ${id} already exists`);
      }
    }

    // Check for indexed metadata
    let metadata: Record<string, any> = {};
    let metadataFile: string | undefined;
    if (
      this._update &&
      this._update.metadata_config.indexed &&
      this._update.metadata_config.indexed.length > 0 &&
      item.metadata
    ) {
      // Copy only indexed metadata
      for (const key of this._update!.metadata_config.indexed) {
        if (item.metadata && item.metadata[key]) {
          metadata[key] = item.metadata[key];
        }
      }
    } else if (item.metadata) {
      metadata = item.metadata;
    }

    // Create new item
    const newItem: IndexItem = {
      id: id,
      metadata: metadata,
      vector: item.vector,
      norm: ItemSelector.normalize(item.vector),
    };

    // Add item to index
    if (!unique) {
      const existing = (this._update?.items || []).find(
        (i) => i.id && i.id === id
      );
      if (existing) {
        existing.metadata = newItem.metadata;
        existing.vector = newItem.vector;
        existing.metadataFile = newItem.metadataFile;
        return existing;
      } else {
        this._update?.items.push(newItem);
        return newItem;
      }
    } else {
      this._update?.items.push(newItem);
      return newItem;
    }
  }
}

interface IndexData {
  ipnsName: string;
  ipnsId: string;
  version: number;
  metadata_config: {
    indexed?: string[];
  };
  items: IndexItem[];
}
