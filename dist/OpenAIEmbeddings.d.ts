import { AxiosResponse, AxiosRequestConfig } from "axios";
import { EmbeddingsModel, EmbeddingsResponse } from "./types";
import { CreateEmbeddingRequest, CreateEmbeddingResponse } from "./internals";
export interface BaseOpenAIEmbeddingsOptions {
    logRequests?: boolean;
    retryPolicy?: number[];
    requestConfig?: AxiosRequestConfig;
}
export interface OpenAIEmbeddingsOptions extends BaseOpenAIEmbeddingsOptions {
    apiKey: string;
    model: string;
    organization?: string;
    endpoint?: string;
}
export declare class OpenAIEmbeddings implements EmbeddingsModel {
    private readonly _httpClient;
    readonly maxTokens = 8000;
    readonly options: OpenAIEmbeddingsOptions;
    constructor(options: OpenAIEmbeddingsOptions);
    createEmbeddings(inputs: string | string[]): Promise<EmbeddingsResponse>;
    protected createEmbeddingRequest(request: CreateEmbeddingRequest): Promise<AxiosResponse<CreateEmbeddingResponse>>;
    protected post<TData>(url: string, body: object, retryCount?: number): Promise<AxiosResponse<TData>>;
}
