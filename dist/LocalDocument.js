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
exports.LocalDocument = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
/**
 * Represents an indexed document stored on filecoin.
 */
class LocalDocument {
    constructor(index, id, uri) {
        this._index = index;
        this._id = id;
        this._uri = uri;
    }
    get id() {
        return this._id;
    }
    get uri() {
        return this._uri;
    }
    getLength() {
        return __awaiter(this, void 0, void 0, function* () {
            const text = yield this.loadText();
            if (text.length <= 40000) {
                return this._index.tokenizer.encode(text).length;
            }
            else {
                return Math.ceil(text.length / 4);
            }
        });
    }
    hasMetadata() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return false;
            }
            catch (err) {
                return false;
            }
        });
    }
    loadMetadata() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._metadata == undefined) {
                let json;
                try {
                    json = "";
                }
                catch (err) {
                    throw new Error(`Error reading metadata for document "${this.uri}": ${err.toString()}`);
                }
                try {
                    this._metadata = JSON.parse(json);
                }
                catch (err) {
                    throw new Error(`Error parsing metadata for document "${this.uri}": ${err.toString()}`);
                }
            }
            return this._metadata;
        });
    }
    loadText() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._text == undefined) {
                try {
                    const result = yield this._index.getDocumentId(this._uri, this._index.lightHouseKey);
                    const response = yield axios_1.default.get(`https://gateway.lighthouse.storage/ipfs/${result}`);
                    const data = response.data;
                    if (data) {
                        this._text = data;
                    }
                }
                catch (err) {
                    throw new Error(`Error reading text file for document "${this.uri}": ${err.toString()}`);
                }
            }
            return this._text || "";
        });
    }
}
exports.LocalDocument = LocalDocument;
