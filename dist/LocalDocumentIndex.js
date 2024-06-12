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
exports.LocalDocumentIndex = void 0;
const uuid_1 = require("uuid");
const GPT3Tokenizer_1 = require("./GPT3Tokenizer");
const LocalIndex_1 = require("./LocalIndex");
const TextSplitter_1 = require("./TextSplitter");
const LocalDocumentResult_1 = require("./LocalDocumentResult");
const LocalDocument_1 = require("./LocalDocument");
const sdk_1 = __importDefault(require("@lighthouse-web3/sdk"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class LocalDocumentIndex extends LocalIndex_1.LocalIndex {
    constructor(config) {
        var _a, _b;
        super(config.indexName);
        this._embeddings = config.embeddings;
        this._chunkingConfig = Object.assign({
            keepSeparators: true,
            chunkSize: 512,
            chunkOverlap: 0,
        }, config.chunkingConfig);
        this._tokenizer =
            (_b = (_a = config.tokenizer) !== null && _a !== void 0 ? _a : this._chunkingConfig.tokenizer) !== null && _b !== void 0 ? _b : new GPT3Tokenizer_1.GPT3Tokenizer();
        this._chunkingConfig.tokenizer = this._tokenizer;
        this.apiKey = config.apiKey;
        if (config.agent) {
            this.agent = config.agent;
        }
        this.isCatalog = config.isCatalog;
        this._getDocumentId = config._getDocumentId;
        this._getDoumentUri = config._getDoumentUri;
    }
    get embeddings() {
        return this._embeddings;
    }
    get lightHouseKey() {
        return this.apiKey;
    }
    get tokenizer() {
        return this._tokenizer;
    }
    isCatalogCreated() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            return (_a = this.isCatalog) !== null && _a !== void 0 ? _a : false;
        });
    }
    getDocumentId(uri, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadIndexData(apiKey);
            const x = this._getDocumentId ? yield this._getDocumentId(uri) : undefined;
            return x;
        });
    }
    getDocumentUri(documentId, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadIndexData(apiKey);
            const x = this._getDoumentUri
                ? yield this._getDoumentUri(documentId)
                : undefined;
            return x;
        });
    }
    getCatalogStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const stats = yield this.getIndexStats(this.apiKey);
            return {
                version: this._catalog.version,
                documents: this._catalog.count,
                chunks: stats.items,
                metadata_config: stats.metadata_config,
            };
        });
    }
    deleteDocument(uri) {
        return __awaiter(this, void 0, void 0, function* () {
            // Lookup document ID
            const documentId = yield this.getDocumentId(uri, this.apiKey);
            if (documentId == undefined) {
                return;
            }
            // Delete document chunks from index and remove from catalog
            yield this.beginUpdate();
            try {
                // Get list of chunks for document
                const chunks = yield this.listItemsByMetadata({
                    documentId,
                }, this.apiKey);
                // Delete chunks
                for (const chunk of chunks) {
                    yield this.deleteItem(chunk.id, this.apiKey);
                }
                // Remove entry from catalog
                delete this._newCatalog.uriToId[uri];
                delete this._newCatalog.idToUri[documentId];
                this._newCatalog.count--;
                // Commit changes
                yield this.endUpdate();
            }
            catch (err) {
                // Cancel update and raise error
                this.cancelUpdate();
                throw new Error(`Error deleting document "${uri}": ${err.toString()}`);
            }
        });
    }
    upsertDocument(uri, text, docType, metadata) {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure embeddings configured
            if (!this._embeddings) {
                throw new Error(`Embeddings model not configured.`);
            }
            // Check for existing document ID
            let documentId = yield this.getDocumentId(uri, this.apiKey);
            if (documentId != undefined) {
                // Delete existing document
                yield this.deleteDocument(uri);
            }
            //save it on ipfs first
            const response = yield sdk_1.default.uploadText(text, this.apiKey);
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
            const splitter = new TextSplitter_1.TextSplitter(config);
            const chunks = splitter.split(text);
            // Break chunks into batches for embedding generation
            let totalTokens = 0;
            const chunkBatches = [];
            let currentBatch = [];
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
            const embeddings = [];
            for (const batch of chunkBatches) {
                let response;
                try {
                    response = yield this._embeddings.createEmbeddings(batch);
                }
                catch (err) {
                    throw new Error(`Error generating embeddings: ${err.toString()}`);
                }
                // Check for error
                if (response.status != "success") {
                    throw new Error(`Error generating embeddings: ${response.message}`);
                }
                // Add embeddings to output
                for (const embedding of response.output) {
                    embeddings.push(embedding);
                }
            }
            // Add document chunks to index
            yield this.beginUpdate();
            try {
                // Add chunks to index
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    const embedding = embeddings[i];
                    const chunkMetadata = Object.assign({
                        documentId,
                        startPos: chunk.startPos,
                        endPos: chunk.endPos,
                    }, metadata);
                    yield this.insertItem({
                        id: (0, uuid_1.v4)(),
                        metadata: chunkMetadata,
                        vector: embedding,
                    }, this.apiKey);
                }
                // Add entry to catalog
                this._newCatalog.uriToId[uri] = documentId;
                this._newCatalog.idToUri[documentId] = uri;
                this._newCatalog.count++;
                // Commit changes
                yield this.endUpdate();
            }
            catch (err) {
                // Cancel update and raise error
                this.cancelUpdate();
                throw new Error(`Error adding document "${uri}": ${err.toString()}`);
            }
            // Return document
            return new LocalDocument_1.LocalDocument(this, documentId, uri);
        });
    }
    listDocuments() {
        return __awaiter(this, void 0, void 0, function* () {
            // Sort chunks by document ID
            const docs = {};
            const chunks = yield this.listItems(this.apiKey);
            chunks.forEach((chunk) => {
                const metadata = chunk.metadata;
                //TODO: verify this
                if (docs[metadata.documentId] == undefined ||
                    docs[metadata.documentId].length < 1) {
                    docs[metadata.documentId] = [];
                }
                docs[metadata.documentId].push({ item: chunk, score: 1.0 });
            }, this.apiKey);
            // Create document results
            const results = [];
            for (const documentId in docs) {
                const uri = yield this.getDocumentUri(documentId, this.apiKey);
                const documentResult = new LocalDocumentResult_1.LocalDocumentResult(this, documentId, uri, docs[documentId], this._tokenizer);
                results.push(documentResult);
            }
            return results;
        });
    }
    queryDocuments(query, options) {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure embeddings configured
            if (!this._embeddings) {
                throw new Error(`Embeddings model not configured.`);
            }
            // Ensure options are defined
            options = Object.assign({
                maxDocuments: 10,
                maxChunks: 50,
            }, options);
            // Generate embeddings for query
            let embeddings;
            try {
                embeddings = yield this._embeddings.createEmbeddings(query.replace(/\n/g, " "));
            }
            catch (err) {
                throw new Error(`Error generating embeddings for query: ${err.toString()}`);
            }
            // Check for error
            if (embeddings.status != "success") {
                throw new Error(`Error generating embeddings for query: ${embeddings.message}`);
            }
            // Query index for chunks
            const results = yield this.queryItems(embeddings.output[0], options.maxChunks, options.filter);
            // Group chunks by document
            const documentChunks = {};
            for (const result of results) {
                const metadata = result.item.metadata;
                if (documentChunks[metadata.documentId] == undefined) {
                    documentChunks[metadata.documentId] = [];
                }
                documentChunks[metadata.documentId].push(result);
            }
            // Create a document result for each document
            const documentResults = [];
            // console.log("document result", documentChunks);
            for (const documentId in documentChunks) {
                const chunks = documentChunks[documentId];
                // console.log("new chunks", documentId);
                if (documentId) {
                    const uri = yield this.getDocumentUri(documentId, this.apiKey);
                    const documentResult = new LocalDocumentResult_1.LocalDocumentResult(this, documentId, uri, chunks, this._tokenizer);
                    documentResults.push(documentResult);
                }
            }
            // Sort document results by score and return top results
            return documentResults
                .sort((a, b) => b.score - a.score)
                .slice(0, options.maxDocuments);
        });
    }
    beginUpdate() {
        const _super = Object.create(null, {
            beginUpdate: { get: () => super.beginUpdate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            yield _super.beginUpdate.call(this, this.apiKey);
            this._newCatalog = Object.assign({}, this._catalog);
        });
    }
    cancelUpdate() {
        super.cancelUpdate();
        this._newCatalog = undefined;
    }
    createIndex(config) {
        const _super = Object.create(null, {
            createIndex: { get: () => super.createIndex }
        });
        return __awaiter(this, void 0, void 0, function* () {
            const newIndex = yield _super.createIndex.call(this, config);
            yield this.loadIndexData(this.apiKey);
            return newIndex;
        });
    }
    endUpdate() {
        const _super = Object.create(null, {
            endUpdate: { get: () => super.endUpdate }
        });
        return __awaiter(this, void 0, void 0, function* () {
            yield _super.endUpdate.call(this, this.apiKey);
            try {
                // Save catalog on smart contract
                this._catalog = this._newCatalog;
                this._newCatalog = undefined;
            }
            catch (err) {
                throw new Error(`Error saving document catalog: ${err.toString()}`);
            }
        });
    }
    loadIndexData(apiKey) {
        const _super = Object.create(null, {
            loadIndexData: { get: () => super.loadIndexData }
        });
        return __awaiter(this, void 0, void 0, function* () {
            yield _super.loadIndexData.call(this, apiKey);
            if (this._catalog) {
                return;
            }
            //creating catalog on the smart contract
            if (yield this.isCatalogCreated()) {
                this._catalog = {
                    version: 1,
                    count: 0,
                    uriToId: {},
                    idToUri: {},
                };
            }
            else {
                this._catalog = {
                    version: 1,
                    count: 0,
                    uriToId: {},
                    idToUri: {},
                };
            }
        });
    }
}
exports.LocalDocumentIndex = LocalDocumentIndex;
