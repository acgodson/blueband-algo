import axios, { AxiosInstance, AxiosResponse, AxiosRequestConfig } from "axios";
import { EmbeddingsModel, EmbeddingsResponse } from "./types";
import {
  CreateEmbeddingRequest,
  CreateEmbeddingResponse,
  OpenAICreateEmbeddingRequest,
} from "./internals";
import { Colorize } from "./internals";

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

export class OpenAIEmbeddings implements EmbeddingsModel {
  private readonly _httpClient: AxiosInstance;

  public readonly maxTokens = 8000;
  public readonly options: OpenAIEmbeddingsOptions;

  public constructor(options: OpenAIEmbeddingsOptions) {
    this.options = Object.assign(
      {
        retryPolicy: [2000, 5000],
      },
      options
    ) as OpenAIEmbeddingsOptions;

    this._httpClient = axios.create({
      validateStatus: (status) => status < 400 || status == 429,
    });
  }

  public async createEmbeddings(
    inputs: string | string[]
  ): Promise<EmbeddingsResponse> {
    if (this.options.logRequests) {
      console.log(Colorize.title("EMBEDDINGS REQUEST:"));
      // console.log(Colorize.output(inputs));
    }

    const startTime = Date.now();
    const response = await this.createEmbeddingRequest({
      input: inputs,
    });

    if (this.options.logRequests) {
      console.log(Colorize.title("RESPONSE:"));
      console.log(Colorize.value("status", response.status));
      console.log(Colorize.value("duration", Date.now() - startTime, "ms"));
      // console.log(Colorize.output(response.data));
    }

    if (response.status < 300) {
      return {
        status: "success",
        output: response.data.data
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding),
      };
    } else if (response.status == 429) {
      return {
        status: "rate_limited",
        message: `The embeddings API returned a rate limit error.`,
      };
    } else {
      return {
        status: "error",
        message: `The embeddings API returned an error status of ${response.status}: ${response.statusText}`,
      };
    }
  }

  protected createEmbeddingRequest(
    request: CreateEmbeddingRequest
  ): Promise<AxiosResponse<CreateEmbeddingResponse>> {
    const options = this.options as OpenAIEmbeddingsOptions;
    const url = `${options.endpoint ?? "https://api.openai.com"}/v1/embeddings`;
    (request as OpenAICreateEmbeddingRequest).model = options.model;
    return this.post(url, request);
  }

  protected async post<TData>(
    url: string,
    body: object,
    retryCount = 0
  ): Promise<AxiosResponse<TData>> {
    const requestConfig: AxiosRequestConfig = Object.assign(
      {},
      this.options.requestConfig
    );

    if (!requestConfig.headers) {
      requestConfig.headers = {};
    }
    if (!requestConfig.headers["Content-Type"]) {
      requestConfig.headers["Content-Type"] = "application/json";
    }

    const options = this.options as OpenAIEmbeddingsOptions;
    requestConfig.headers["Authorization"] = `Bearer ${options.apiKey}`;
    if (options.organization) {
      requestConfig.headers["OpenAI-Organization"] = options.organization;
    }

    const response = await this._httpClient.post(url, body, requestConfig);

    if (
      response.status == 429 &&
      Array.isArray(this.options.retryPolicy) &&
      retryCount < this.options.retryPolicy.length
    ) {
      const delay = this.options.retryPolicy[retryCount];
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.post(url, body, retryCount + 1);
    } else {
      return response;
    }
  }
}
