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
exports.OpenAIEmbeddings = void 0;
const axios_1 = __importDefault(require("axios"));
const internals_1 = require("./internals");
class OpenAIEmbeddings {
    constructor(options) {
        this.maxTokens = 8000;
        this.options = Object.assign({
            retryPolicy: [2000, 5000],
        }, options);
        this._httpClient = axios_1.default.create({
            validateStatus: (status) => status < 400 || status == 429,
        });
    }
    createEmbeddings(inputs) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.options.logRequests) {
                console.log(internals_1.Colorize.title("EMBEDDINGS REQUEST:"));
                // console.log(Colorize.output(inputs));
            }
            const startTime = Date.now();
            const response = yield this.createEmbeddingRequest({
                input: inputs,
            });
            if (this.options.logRequests) {
                console.log(internals_1.Colorize.title("RESPONSE:"));
                console.log(internals_1.Colorize.value("status", response.status));
                console.log(internals_1.Colorize.value("duration", Date.now() - startTime, "ms"));
                // console.log(Colorize.output(response.data));
            }
            if (response.status < 300) {
                return {
                    status: "success",
                    output: response.data.data
                        .sort((a, b) => a.index - b.index)
                        .map((item) => item.embedding),
                };
            }
            else if (response.status == 429) {
                return {
                    status: "rate_limited",
                    message: `The embeddings API returned a rate limit error.`,
                };
            }
            else {
                return {
                    status: "error",
                    message: `The embeddings API returned an error status of ${response.status}: ${response.statusText}`,
                };
            }
        });
    }
    createEmbeddingRequest(request) {
        var _a;
        const options = this.options;
        const url = `${(_a = options.endpoint) !== null && _a !== void 0 ? _a : "https://api.openai.com"}/v1/embeddings`;
        request.model = options.model;
        return this.post(url, request);
    }
    post(url, body, retryCount = 0) {
        return __awaiter(this, void 0, void 0, function* () {
            const requestConfig = Object.assign({}, this.options.requestConfig);
            if (!requestConfig.headers) {
                requestConfig.headers = {};
            }
            if (!requestConfig.headers["Content-Type"]) {
                requestConfig.headers["Content-Type"] = "application/json";
            }
            const options = this.options;
            requestConfig.headers["Authorization"] = `Bearer ${options.apiKey}`;
            if (options.organization) {
                requestConfig.headers["OpenAI-Organization"] = options.organization;
            }
            const response = yield this._httpClient.post(url, body, requestConfig);
            if (response.status == 429 &&
                Array.isArray(this.options.retryPolicy) &&
                retryCount < this.options.retryPolicy.length) {
                const delay = this.options.retryPolicy[retryCount];
                yield new Promise((resolve) => setTimeout(resolve, delay));
                return this.post(url, body, retryCount + 1);
            }
            else {
                return response;
            }
        });
    }
}
exports.OpenAIEmbeddings = OpenAIEmbeddings;
