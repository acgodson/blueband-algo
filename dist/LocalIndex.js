"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalIndex = void 0;
const uuid_1 = require("uuid");
const ItemSelector_1 = require("./ItemSelector");
const sdk_1 = __importDefault(require("@lighthouse-web3/sdk"));
const axios_1 = __importDefault(require("axios"));
/**
 * Local vector index instance.
 * @remarks
 * This class is used to create, update, and query a local vector index.
 * Each index is a folder on disk containing an index.json file and an optional set of metadata files.
 */
class LocalIndex {
    /**
     * Creates a new instance of LocalIndex.
     * @param folderPath Path to the index folder.
     * @param indexName Optional name of the index file. Defaults to index.json.
     */
    constructor(indexName) {
        this._indexName = indexName;
    }
    /**
     * Optional name of the index file.
     */
    get indexName() {
        var _a;
        return this._indexName || ((_a = this._data) === null || _a === void 0 ? void 0 : _a.ipnsId);
    }
    /**
     * Begins an update to the index.
     * @remarks
     * This method loads the index into memory and prepares it for updates.
     */
    beginUpdate(apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._update) {
                throw new Error("Update already in progress");
            }
            yield this.loadIndexData(apiKey);
            if (this._data) {
                this._update = Object.assign({}, this._data);
            }
        });
    }
    /**
     * Cancels an update to the index.
     * @remarks
     * This method discards any changes made to the index since the update began.
     */
    cancelUpdate() {
        this._update = undefined;
    }
    createIndex(config = { version: 1, apiKey: "" }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Generate IPNS key using Lighthouse SDK
                const keyResponse = yield sdk_1.default.generateKey(config.apiKey);
                this._data = {
                    ipnsName: keyResponse.data.ipnsName,
                    ipnsId: keyResponse.data.ipnsId,
                    version: config.version,
                    metadata_config: (_a = config.metadata_config) !== null && _a !== void 0 ? _a : {},
                    items: [],
                };
                const response = yield sdk_1.default.uploadText(JSON.stringify(this._data), config.apiKey, keyResponse.data.ipnsName);
                if (response.data) {
                    const pubResponse = yield sdk_1.default.publishRecord(response.data.Hash, keyResponse.data.ipnsName, config.apiKey);
                }
                return keyResponse.data;
            }
            catch (err) {
                yield this.deleteIndex(config.apiKey);
                throw new Error("Error creating index");
            }
        });
    }
    deleteIndex(apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Delete IPNS key using Lighthouse SDK if it exists
                if (this._data && this._data.ipnsName) {
                    const removeRes = yield sdk_1.default.removeKey(this._data.ipnsName, apiKey);
                    console.log("IPNS key removed successfully:");
                    console.log(removeRes.data);
                }
                this._data = undefined;
            }
            catch (err) {
                throw new Error("Error deleting index");
            }
        });
    }
    deleteItem(id, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._update) {
                const index = this._update.items.findIndex((i) => i.id === id);
                if (index >= 0) {
                    this._update.items.splice(index, 1);
                }
            }
            else {
                yield this.beginUpdate(apiKey);
                const index = this._update.items.findIndex((i) => i.id === id);
                if (index >= 0) {
                    this._update.items.splice(index, 1);
                }
                yield this.endUpdate(apiKey);
            }
        });
    }
    /**
     * Ends an update to the index.
     * @remarks
     * This method saves the index to disk.
     */
    endUpdate(apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._data) {
                throw new Error("No data");
            }
            if (!this._update) {
                throw new Error("No update in progress");
            }
            try {
                // console.log("this update", this._update)
                // Step 2: Upload text to IPNS
                const response = yield sdk_1.default.uploadText(JSON.stringify(this._update), apiKey, this._update.ipnsName);
                const ipfsData = yield response.data.Hash;
                // Step 2: Publish the data to IPNS
                const publishResponse = yield sdk_1.default.publishRecord(ipfsData, this._update.ipnsName, apiKey);
                // Step 3: Handle successful publication
                if (publishResponse.data.Value) {
                    console.log("Index updated on IPNS:", publishResponse.data);
                    this._data = this._update;
                    this._update = undefined;
                }
                else {
                    throw new Error("Failed to publish index to IPNS");
                }
            }
            catch (err) {
                throw new Error(`Error publishing index to IPNS: ${err.message}`);
            }
        });
    }
    /**
     * Loads an index from disk and returns its stats.
     * @returns Index stats.
     */
    getIndexStats(apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadIndexData(apiKey);
            return {
                version: this._data.version,
                metadata_config: this._data.metadata_config,
                items: this._data.items.length,
            };
        });
    }
    /**
     * Returns an item from the index given its ID.
     * @param id ID of the item to retrieve.
     * @returns Item or undefined if not found.
     */
    getItem(id, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadIndexData(apiKey);
            return this._data.items.find((i) => i.id === id);
        });
    }
    /**
     * Adds an item to the index.
     * @remarks
     * A new update is started if one is not already in progress. If an item with the same ID
     * already exists, an error will be thrown.
     * @param item Item to insert.
     * @returns Inserted item.
     */
    insertItem(item, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._update) {
                return (yield this.addItemToUpdate(item, true));
            }
            else {
                yield this.beginUpdate(apiKey);
                const newItem = yield this.addItemToUpdate(item, true);
                yield this.endUpdate(apiKey);
                return newItem;
            }
        });
    }
    /**
     * Returns true if the index exists.
     */
    isIndexCreated(apiKey, indexName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // return true;
                const response = yield axios_1.default.get(`https://gateway.lighthouse.storage/ipns/${indexName}`);
                const data = response.data;
                if (data) {
                    return true;
                }
                else {
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
            }
            catch (err) {
                // Handle errors
                console.error("Error checking if index is created:", err);
                return false;
            }
        });
    }
    /**
     * Returns all items in the index.
     * @remarks
     * This method loads the index into memory and returns all its items. A copy of the items
     * array is returned so no modifications should be made to the array.
     * @returns Array of all items in the index.
     */
    listItems(apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadIndexData(apiKey);
            return this._data.items.slice();
        });
    }
    /**
     * Returns all items in the index matching the filter.
     * @remarks
     * This method loads the index into memory and returns all its items matching the filter.
     * @param filter Filter to apply.
     * @returns Array of items matching the filter.
     */
    listItemsByMetadata(filter, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadIndexData(apiKey);
            return this._data.items.filter((i) => ItemSelector_1.ItemSelector.select(i.metadata, filter));
        });
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
    queryItems(vector, topK, apiKey, filter) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadIndexData(apiKey);
            // Filter items
            let items = this._data.items;
            if (filter) {
                items = items.filter((i) => ItemSelector_1.ItemSelector.select(i.metadata, filter));
            }
            // Calculate distances
            const norm = ItemSelector_1.ItemSelector.normalize(vector);
            const distances = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const distance = ItemSelector_1.ItemSelector.normalizedCosineSimilarity(vector, norm, item.vector, item.norm);
                distances.push({ index: i, distance: distance });
            }
            // Sort by distance DESCENDING
            distances.sort((a, b) => b.distance - a.distance);
            // Find top k
            const top = distances.slice(0, topK).map((d) => {
                return {
                    item: Object.assign({}, items[d.index]),
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
        });
    }
    /**
     * Adds or replaces an item in the index.
     * @remarks
     * A new update is started if one is not already in progress. If an item with the same ID
     * already exists, it will be replaced.
     * @param item Item to insert or replace.
     * @returns Upserted item.
     */
    upsertItem(item, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._update) {
                return (yield this.addItemToUpdate(item, false));
            }
            else {
                yield this.beginUpdate(apiKey);
                const newItem = yield this.addItemToUpdate(item, false);
                yield this.endUpdate(apiKey);
                return newItem;
            }
        });
    }
    /**
     * Ensures that the index has been loaded into memory.
     */
    loadIndexData(apiKey) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._data && !this._indexName) {
                console.error("data is not there");
                return;
            }
            // console.log(this._indexName, this._data?.ipnsId);
            if (!(yield this.isIndexCreated(apiKey, ((_a = this._data) === null || _a === void 0 ? void 0 : _a.ipnsId) || this._indexName // ?  this._indexName : this._data?.ipnsId
            ))) {
                throw new Error("Index does not exist");
            }
            try {
                // Get all keys from Lighthouse SDK
                // const allKeys = await lighthouse.getAllKeys(apiKey);
                const ipnsId = this._indexName ? this._indexName : (_b = this._data) === null || _b === void 0 ? void 0 : _b.ipnsId;
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
                const response = yield axios_1.default.get(`https://gateway.lighthouse.storage/ipns/${ipnsId}`);
                const data = response.data;
                // console.log("index created", data);
                // Parse the retrieved data
                this._data = data;
            }
            catch (error) {
                console.error("Error loading index data:", error);
                throw new Error("Failed to load index data");
            }
        });
    }
    addItemToUpdate(item, unique) {
        var _a, _b, _c, _d, _e;
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure vector is provided
            if (!item.vector) {
                throw new Error("Vector is required");
            }
            // Ensure unique
            const id = (_a = item.id) !== null && _a !== void 0 ? _a : (0, uuid_1.v4)();
            if (unique) {
                const existing = (((_b = this._update) === null || _b === void 0 ? void 0 : _b.items) || []).find((i) => i.id && i.id === id);
                if (existing) {
                    throw new Error(`Item with id ${id} already exists`);
                }
            }
            // Check for indexed metadata
            let metadata = {};
            let metadataFile;
            if (this._update &&
                this._update.metadata_config.indexed &&
                this._update.metadata_config.indexed.length > 0 &&
                item.metadata) {
                // Copy only indexed metadata
                for (const key of this._update.metadata_config.indexed) {
                    if (item.metadata && item.metadata[key]) {
                        metadata[key] = item.metadata[key];
                    }
                }
            }
            else if (item.metadata) {
                metadata = item.metadata;
            }
            // Create new item
            const newItem = {
                id: id,
                metadata: metadata,
                vector: item.vector,
                norm: ItemSelector_1.ItemSelector.normalize(item.vector),
            };
            // Add item to index
            if (!unique) {
                const existing = (((_c = this._update) === null || _c === void 0 ? void 0 : _c.items) || []).find((i) => i.id && i.id === id);
                if (existing) {
                    existing.metadata = newItem.metadata;
                    existing.vector = newItem.vector;
                    existing.metadataFile = newItem.metadataFile;
                    return existing;
                }
                else {
                    (_d = this._update) === null || _d === void 0 ? void 0 : _d.items.push(newItem);
                    return newItem;
                }
            }
            else {
                (_e = this._update) === null || _e === void 0 ? void 0 : _e.items.push(newItem);
                return newItem;
            }
        });
    }
}
exports.LocalIndex = LocalIndex;
