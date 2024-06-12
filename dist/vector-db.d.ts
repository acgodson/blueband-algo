export declare function createIndex(apiKey: string): Promise<string | undefined>;
export declare function addDocuments(indexName: string, //ipnsName, we query on the front end for this
apiKey: string, agent: string, //Event creator
appID: number, uris: string[], chunkSize: number, indexerClient: any, decryptedTexts?: string[]): Promise<{
    uris: string[];
    ids: any[];
}>;
export declare function queryIndex(indexName: string, agent: string, appID: number, apiKey: string, query: string, documentCount: number, chunkCount: number, sectionCount: number, tokens: number, format: string, overlap: boolean, indexerClient: any): Promise<any[]>;
