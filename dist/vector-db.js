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
exports.queryIndex = exports.addDocuments = exports.createIndex = void 0;
const LocalDocumentIndex_1 = require("./LocalDocumentIndex");
const OpenAIEmbeddings_1 = require("./OpenAIEmbeddings");
const internals_1 = require("./internals");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const openaiKey = process.env.NEXT_PUBLIC_OPENAI_KEY;
//TODO: use index to update the catalog later
function createIndex(apiKey) {
    return __awaiter(this, void 0, void 0, function* () {
        //algo Txn
        const indexInstance = new LocalDocumentIndex_1.LocalDocumentIndex({
            agent: "",
            apiKey: apiKey,
        });
        console.log(internals_1.Colorize.output(`indexing on IPFS`));
        const newIndex = yield indexInstance.createIndex({
            version: 1,
            deleteIfExists: true,
            apiKey: apiKey,
        });
        if (newIndex) {
            return newIndex;
        }
    });
}
exports.createIndex = createIndex;
function addDocuments(indexName, //ipnsName, we query on the front end for this
apiKey, agent, //Event creator
appID, uris, chunkSize, indexerClient, decryptedTexts) {
    return __awaiter(this, void 0, void 0, function* () {
        const embeddings = new OpenAIEmbeddings_1.OpenAIEmbeddings({
            apiKey: openaiKey,
            model: "text-embedding-ada-002",
            logRequests: true,
        });
        const loadIsCatalog = () => __awaiter(this, void 0, void 0, function* () {
            if (!agent) {
                console.log("no agent submitted");
                return true;
            }
            try {
                const prefix = `Buni${appID}`;
                const response = yield indexerClient
                    .searchForAssets()
                    .creator(agent)
                    .name(prefix)
                    .do();
                if (response.assets.length < 0) {
                    return false;
                }
                return true;
            }
            catch (err) {
                return false;
            }
        });
        const getDocumentID = (prefix) => __awaiter(this, void 0, void 0, function* () {
            let responseCID;
            try {
                const prefix = `Buni${appID}`;
                const response = yield indexerClient
                    .searchForAssets()
                    .creator(agent)
                    .name(prefix)
                    .do();
                if (response.assets.length > 0) {
                    const assetID = response.assets[response.assets.length - 1].index;
                    console.log(`Found Asset ID: ${assetID}`);
                    const txResponse = yield indexerClient
                        .searchForTransactions()
                        .assetID(assetID)
                        .txType("acfg")
                        .do();
                    if (txResponse.transactions.length > 0) {
                        const noteField = txResponse.transactions[0].note;
                        const decodedNote = Buffer.from(noteField, "base64").toString();
                        const [appID, ipfsCID] = decodedNote.split(":");
                        responseCID = ipfsCID;
                    }
                    else {
                        console.log("No asset creation transactions found for the specified asset ID.");
                    }
                    return responseCID;
                }
            }
            catch (e) {
                console.log(e);
            }
            return responseCID;
        });
        const getDocumentUri = (prefix) => __awaiter(this, void 0, void 0, function* () {
            let responseCID = "";
            try {
                try {
                    const prefix = `Buni${appID}`;
                    const response = yield indexerClient
                        .searchForAssets()
                        .creator(agent)
                        .name(prefix)
                        .do();
                    if (response.assets.length > 0) {
                        const assetID = response.assets[response.assets.length - 1].index;
                        console.log(`Found Asset ID: ${assetID}`);
                        const txResponse = yield indexerClient
                            .searchForTransactions()
                            .assetID(assetID)
                            .txType("acfg")
                            .do();
                        if (txResponse.transactions.length > 0) {
                            const noteField = txResponse.transactions[0].note;
                            const decodedNote = Buffer.from(noteField, "base64").toString();
                            const [appID, ipfsCID] = decodedNote.split(":");
                            responseCID = ipfsCID;
                        }
                        else {
                            console.log("No asset creation transactions found for the specified asset ID.");
                        }
                        return responseCID;
                    }
                }
                catch (e) {
                    console.log(e);
                }
                responseCID;
            }
            catch (e) {
                console.log(e);
            }
        });
        const isCatalog = yield loadIsCatalog();
        const indexInstance = new LocalDocumentIndex_1.LocalDocumentIndex({
            indexName: indexName,
            apiKey: apiKey,
            agent,
            embeddings,
            isCatalog: isCatalog,
            _getDocumentId: getDocumentID,
            _getDoumentUri: getDocumentUri,
            chunkingConfig: {
                chunkSize: chunkSize,
            },
        });
        // const webFetcher = new WebFetcher();
        let ids = [];
        for (let i = 0; i < uris.length; i++) {
            const uri = uris[i];
            let documentResult;
            try {
                if (decryptedTexts) {
                    const decryptedText = decryptedTexts[i];
                    documentResult = yield indexInstance.upsertDocument(uri, decryptedText, "text/plain");
                    ids.push(documentResult.id);
                    console.log(internals_1.Colorize.replaceLine(internals_1.Colorize.success(`added ${uri}`)));
                }
            }
            catch (err) {
                console.log(internals_1.Colorize.replaceLine(internals_1.Colorize.error(`Error adding: ${uri}\n${err.message}`)));
            }
        }
        return { uris, ids };
    });
}
exports.addDocuments = addDocuments;
function queryIndex(indexName, agent, appID, apiKey, query, documentCount, chunkCount, sectionCount, tokens, format, overlap, indexerClient) {
    return __awaiter(this, void 0, void 0, function* () {
        // Initialize an array to store the results
        const queryResults = [];
        const embeddings = new OpenAIEmbeddings_1.OpenAIEmbeddings({
            apiKey: openaiKey,
            model: "text-embedding-ada-002",
            logRequests: true,
        });
        const loadIsCatalog = () => __awaiter(this, void 0, void 0, function* () {
            if (!agent) {
                console.log("no agent submitted");
                return true;
            }
            try {
                const prefix = `Buni${appID}`;
                const response = yield indexerClient
                    .searchForAssets()
                    .creator(agent)
                    .name(prefix)
                    .do();
                if (response.assets.length < 0) {
                    return false;
                }
                return true;
            }
            catch (err) {
                return false;
            }
        });
        const getDocumentID = (prefix) => __awaiter(this, void 0, void 0, function* () {
            let responseCID;
            try {
                const prefix = `Buni${appID}`;
                const response = yield indexerClient
                    .searchForAssets()
                    .creator(agent)
                    .name(prefix)
                    .do();
                if (response.assets.length > 0) {
                    const assetID = response.assets[response.assets.length - 1].index;
                    console.log(`Found Asset ID: ${assetID}`);
                    const txResponse = yield indexerClient
                        .searchForTransactions()
                        .assetID(assetID)
                        .txType("acfg")
                        .do();
                    if (txResponse.transactions.length > 0) {
                        const noteField = txResponse.transactions[0].note;
                        const decodedNote = Buffer.from(noteField, "base64").toString();
                        const [appID, ipfsCID] = decodedNote.split(":");
                        responseCID = ipfsCID;
                    }
                    else {
                        console.log("No asset creation transactions found for the specified asset ID.");
                    }
                    return responseCID;
                }
            }
            catch (e) {
                console.log(e);
            }
            return responseCID;
        });
        const getDocumentUri = (prefix) => __awaiter(this, void 0, void 0, function* () {
            let responseCID = "";
            try {
                try {
                    const prefix = `Buni${appID}`;
                    const response = yield indexerClient
                        .searchForAssets()
                        .creator(agent)
                        .name(prefix)
                        .do();
                    if (response.assets.length > 0) {
                        const assetID = response.assets[response.assets.length - 1].index;
                        console.log(`Found Asset ID: ${assetID}`);
                        const txResponse = yield indexerClient
                            .searchForTransactions()
                            .assetID(assetID)
                            .txType("acfg")
                            .do();
                        if (txResponse.transactions.length > 0) {
                            const noteField = txResponse.transactions[0].note;
                            const decodedNote = Buffer.from(noteField, "base64").toString();
                            const [appID, ipfsCID] = decodedNote.split(":");
                            responseCID = ipfsCID;
                        }
                        else {
                            console.log("No asset creation transactions found for the specified asset ID.");
                        }
                        return responseCID;
                    }
                }
                catch (e) {
                    console.log(e);
                }
                responseCID;
            }
            catch (e) {
                console.log(e);
            }
        });
        const isCatalog = yield loadIsCatalog();
        // Initialize index
        const indexInstance = new LocalDocumentIndex_1.LocalDocumentIndex({
            indexName: indexName,
            apiKey: apiKey,
            agent: "0x5D75A8d20ddDA716e716ff2a138c06727365d247",
            embeddings,
            isCatalog: isCatalog,
            _getDocumentId: getDocumentID,
            _getDoumentUri: getDocumentUri,
        });
        // Query index
        const results = yield indexInstance.queryDocuments(query, {
            maxDocuments: documentCount,
            maxChunks: chunkCount,
        });
        // Process each result
        for (const result of results) {
            const resultObj = {
                uri: result.uri,
                score: result.score,
                chunks: result.chunks.length,
                sections: [],
            };
            // Render sections if format is "sections"
            if (format === "sections") {
                const sections = yield result.renderSections(tokens, sectionCount, overlap);
                resultObj.sections = sections.map((section, index) => ({
                    title: sectionCount === 1 ? "Section" : `Section ${index + 1}`,
                    score: section.score,
                    tokens: section.tokenCount,
                    text: section.text,
                }));
            }
            queryResults.push(resultObj);
        }
        return queryResults;
    });
}
exports.queryIndex = queryIndex;
